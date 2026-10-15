// Supply Check on the shop tablet ("I'm taking supplies"). Public route under
// /api/equipment-check (proxy.ts), like the rest of the tablet app: it checks
// the tablet's secret link and the signed-in staff member (name + PIN) itself.
//
// GET  = the picture grid (products with a photo, unit and warehouse count),
//        the sites, the orders ready to go ("We deliver", not taken yet), the
//        open in-house jobs (Extra Jobs), and this week's count when due.
// POST = { action: "take", for: "account", key }                 an order ready to go
//        { action: "take", for: "account", accountId, accountName, lines }
//        { action: "take", for: "job", jobId, jobName, lines }
//        { action: "take", for: "van", lines }
//        { action: "return", lines }
//        { action: "count", counts }
//
// Taking for an account is a delivery (lib/pg/shelves.ts sendToSite): the
// warehouse goes down now, the site goes up when the crew confirms Supplies
// arrived. A job or the van: the warehouse goes down (lib/pg/supply-control.ts).
// Costs are never sent to the tablet.

import { NextRequest, NextResponse } from "next/server";
import { fetchAllMainAccounts } from "@/lib/data/accounts";
import { requireEquipmentCheckSession, startEquipmentCheckSession } from "@/lib/equipmentCheckSession";
import { extraJobsReady, listExtraJobs } from "@/lib/pg/extra-jobs";
import { sendToSite, waiting } from "@/lib/pg/shelves";
import { OFFICE_USE, listShelf, moveFromShelf, saveWeeklyCount, supplyControlReady, weeklyCount } from "@/lib/pg/supply-control";

const clean = (value: unknown) => String(value ?? "").trim();
const noStore = { headers: { "Cache-Control": "no-store" } };

function pick(row: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = clean(row[key]);
    if (value) return value;
  }
  return "";
}

/** Open in-house jobs, soonest first: number, site and what it is. Never a price. */
async function openJobs(): Promise<{ id: string; label: string; date: string }[]> {
  if (!(await extraJobsReady())) return [];
  return (await listExtraJobs())
    .filter((job) => job.status === "setup")
    .slice(0, 40)
    .map((job) => ({ id: job.id, label: [`#${job.jobNumber}`, job.accountName, job.description.slice(0, 50)].filter(Boolean).join(" · "), date: job.jobDate }));
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ key: string }> }) {
  try {
    const { key } = await params;
    if (!(await supplyControlReady())) return NextResponse.json({ success: true, ready: false }, noStore);
    const ctx = await requireEquipmentCheckSession(request, key);
    if (!ctx) return NextResponse.json({ success: false, error: "Not signed in." }, { status: 401, ...noStore });

    const [shelf, accounts, count, onTheWay, jobs] = await Promise.all([listShelf(), fetchAllMainAccounts(), weeklyCount(), waiting(), openJobs()]);
    const sites = (accounts as unknown as Record<string, unknown>[])
      .filter((account) => /^active$/i.test(pick(account, ["status", "Status"])))
      .map((account) => ({ id: pick(account, ["accountId", "id", "Account ID"]), name: pick(account, ["accountName", "Account Name", "name"]) }))
      .filter((site) => site.name)
      .sort((a, b) => a.name.localeCompare(b.name));

    const response = NextResponse.json(
      {
        success: true,
        ready: true,
        name: ctx.staff.name,
        officeUse: OFFICE_USE,
        items: shelf.map((item) => ({ id: item.id, name: item.name, unit: item.unit, photoUrl: item.photoUrl, shelfCount: item.shelfCount, shelfLocation: item.shelfLocation })),
        sites,
        // "We deliver" orders still at the warehouse: take one and it is on its way.
        ready_to_go: onTheWay
          .filter((entry) => entry.fill === "deliver" && !entry.sentAt)
          .map((entry) => ({ key: entry.key, accountId: entry.accountId, accountName: entry.accountName, lines: entry.lines.map((line) => ({ name: line.name, unit: line.unit, qty: line.qty })) })),
        jobs,
        // The weekly count is asked for until it is done, starting Monday.
        count: count.done ? null : { week: count.week, asks: count.asks.filter((ask) => ask.counted === null) },
      },
      noStore
    );
    await startEquipmentCheckSession(request, response, ctx.staff.id, ctx.keyVersion);
    return response;
  } catch (error) {
    console.error("[supply-check GET]", error instanceof Error ? error.message : error);
    return NextResponse.json({ success: false, error: "Something went wrong." }, { status: 500, ...noStore });
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ key: string }> }) {
  try {
    const { key } = await params;
    if (!(await supplyControlReady())) return NextResponse.json({ success: false, error: "Not turned on here yet." }, { status: 409, ...noStore });
    const ctx = await requireEquipmentCheckSession(request, key);
    if (!ctx) return NextResponse.json({ success: false, error: "Not signed in." }, { status: 401, ...noStore });
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const action = clean(body.action);
    const lines = (Array.isArray(body.lines) ? body.lines : []).map((line) => ({ supplyId: Number((line as Record<string, unknown>)?.supplyId), qty: Number((line as Record<string, unknown>)?.qty) }));
    const staff = { staffId: ctx.staff.id, staffName: ctx.staff.name };
    const items = lines.reduce((sum, line) => sum + (Number.isInteger(line.qty) && line.qty > 0 ? line.qty : 0), 0);

    let payload: Record<string, unknown>;
    if (action === "take" && clean(body.for) === "account") {
      if (clean(body.key)) {
        const ready = (await waiting()).find((entry) => entry.key === clean(body.key) && entry.fill === "deliver" && !entry.sentAt);
        if (!ready) throw new Error("That order was already taken. Go back and look again.");
        await sendToSite({ key: ready.key, by: ctx.staff.name, source: "tablet" });
        payload = { success: true, items: ready.lines.reduce((sum, line) => sum + line.qty, 0) };
      } else {
        await sendToSite({ accountId: clean(body.accountId), accountName: clean(body.accountName), lines, by: ctx.staff.name, source: "tablet" });
        payload = { success: true, items };
      }
    } else if (action === "take" && clean(body.for) === "job") {
      const jobName = clean(body.jobName).slice(0, 80);
      if (!jobName) throw new Error("Pick the job, or type its name.");
      const moved = await moveFromShelf({ kind: "take", lines, accountId: "", accountName: `Job: ${jobName}`, extraJobId: clean(body.jobId), ...staff, note: "Supply Check tablet", source: "tablet" });
      payload = { success: true, items: moved.items };
    } else if (action === "take") {
      const moved = await moveFromShelf({ kind: "take", lines, accountId: "", accountName: OFFICE_USE, ...staff, note: "Supply Check tablet", source: "tablet" });
      payload = { success: true, items: moved.items };
    } else if (action === "return") {
      const moved = await moveFromShelf({ kind: "return", lines, accountId: "", accountName: "", ...staff, note: "Brought back to the warehouse", source: "tablet" });
      payload = { success: true, items: moved.items };
    } else if (action === "count") {
      const counts = (Array.isArray(body.counts) ? body.counts : []).map((entry) => ({ supplyId: Number((entry as Record<string, unknown>)?.supplyId), counted: Number((entry as Record<string, unknown>)?.counted) }));
      await saveWeeklyCount(counts, ctx.staff.name);
      payload = { success: true };
    } else {
      return NextResponse.json({ success: false, error: "Unknown action." }, { status: 400, ...noStore });
    }

    const response = NextResponse.json(payload, noStore);
    await startEquipmentCheckSession(request, response, ctx.staff.id, ctx.keyVersion);
    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    console.error("[supply-check POST]", message);
    return NextResponse.json({ success: false, error: message && message.length < 120 && !/sql|syntax|relation|column/i.test(message) ? message : "That did not save. Try again." }, { status: 400, ...noStore });
  }
}
