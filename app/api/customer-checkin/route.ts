// Customer check-ins, staff side (lib/pg/customer-checkin.ts). Staff only
// (proxy.ts default gate, plus a logged-in check here). Nothing here sends by
// itself: every email goes out because someone pressed Send.
//
// GET ?accountId=            the account's check-ins (newest first) and whether it stopped them
// GET ?copy=<id>             the saved copy of one check-in email ("View email")
// GET ?view=last             each account's last check-in, and who stopped them (Check-ins page filters)
// GET ?view=batches          History: one line per send
// GET ?batch=<id>            one send: every account in it, and the skipped ones
// GET ?view=lists            the saved lists
// POST { action: "preview", accountIds }                            who gets it, who is skipped and why, the email
// POST { action: "send", accountIds, kind, listId?, listName? }     sends (90 a day; the rest are queued)
// POST { action: "saveList", id?, name, accountIds }                 new or changed list
// POST { action: "deleteList", id }
// POST { action: "test" }                                            the real email to crm@, links save nothing

import { NextRequest, NextResponse } from "next/server";
import { getAdminIdentity } from "@/lib/adminSession";
import { CHECKIN_TEST_EMAIL, type CheckinBatchKind } from "@/lib/customerCheckin";
import {
  NOT_READY,
  accountCheckins,
  batchDetail,
  checkinCopy,
  checkinReady,
  deleteCheckinList,
  lastCheckins,
  listBatches,
  listCheckinLists,
  previewCheckins,
  saveCheckinList,
  sendCheckins,
  sendTestCheckin,
} from "@/lib/pg/customer-checkin";

// A send of up to 90 emails, half a second apart.
export const maxDuration = 300;

const noStore = { headers: { "Cache-Control": "no-store" } };
const refuse = (error: string, status = 400) => NextResponse.json({ success: false, error }, { status, ...noStore });
const ok = (data: object) => NextResponse.json({ success: true, ...data }, noStore);
const MAX_ACCOUNTS = 1000;

function idsOf(value: unknown): string[] {
  return Array.isArray(value) ? value.map((id) => String(id ?? "").trim()).filter(Boolean).slice(0, MAX_ACCOUNTS) : [];
}

export async function GET(request: NextRequest) {
  try {
    if (!(await getAdminIdentity(request))) return refuse("Log in first.", 401);
    const params = request.nextUrl.searchParams;
    const accountId = params.get("accountId")?.trim() ?? "";
    if (accountId) return ok(await accountCheckins(accountId));
    if (!(await checkinReady())) return ok({ ready: false });
    const copy = Number(params.get("copy"));
    if (copy > 0) {
      const found = await checkinCopy(copy);
      return found ? ok({ ready: true, ...found }) : refuse("No saved copy of this email.", 404);
    }
    const batch = Number(params.get("batch"));
    if (batch > 0) {
      const found = await batchDetail(batch);
      return found ? ok({ ready: true, ...found }) : refuse("That send is not there.", 404);
    }
    const view = params.get("view");
    if (view === "last") return ok({ ready: true, ...(await lastCheckins()) });
    if (view === "batches") return ok({ ready: true, batches: await listBatches() });
    if (view === "lists") return ok({ ready: true, lists: await listCheckinLists() });
    return refuse("Say what to show.");
  } catch (error) {
    console.error("[customer-checkin GET]", error instanceof Error ? error.message : error);
    return refuse("Check-ins did not load.", 500);
  }
}

export async function POST(request: NextRequest) {
  try {
    const identity = await getAdminIdentity(request);
    if (!identity) return refuse("Log in first.", 401);
    const by = identity.name || "Office";
    const origin = request.nextUrl.origin;
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const action = String(body.action ?? "");

    if (action === "test") {
      const sent = await sendTestCheckin(origin, by);
      return sent ? ok({ sentTo: CHECKIN_TEST_EMAIL }) : refuse("Email is not set up on this server, so nothing was sent.", 503);
    }
    if (!(await checkinReady())) return refuse(NOT_READY, 409);

    if (action === "preview") {
      const ids = idsOf(body.accountIds);
      if (ids.length === 0) return refuse("Pick at least one account.");
      return ok(await previewCheckins(ids, origin));
    }
    if (action === "send") {
      const ids = idsOf(body.accountIds);
      if (ids.length === 0) return refuse("Pick at least one account.");
      const kind: CheckinBatchKind = body.kind === "single" || body.kind === "list" ? body.kind : "picked";
      const listId = Number(body.listId) > 0 ? Number(body.listId) : null;
      return ok(await sendCheckins({ accountIds: ids, kind, listId, listName: String(body.listName ?? "").slice(0, 80), by, origin }));
    }
    if (action === "saveList") {
      const id = Number(body.id) > 0 ? Number(body.id) : null;
      try {
        return ok({ id: await saveCheckinList({ id, name: String(body.name ?? ""), accountIds: idsOf(body.accountIds), by }) });
      } catch (error) {
        return refuse(error instanceof Error ? error.message : "The list was not saved.");
      }
    }
    if (action === "deleteList") {
      const id = Number(body.id);
      if (!(id > 0)) return refuse("Which list?");
      await deleteCheckinList(id);
      return ok({});
    }
    return refuse("Unknown action.");
  } catch (error) {
    console.error("[customer-checkin POST]", error instanceof Error ? error.message : error);
    return refuse(error instanceof Error ? error.message : "That did not work.", 500);
  }
}
