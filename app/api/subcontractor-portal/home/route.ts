// The simple sub portal home: today's sites, the sub's requests, and the
// two sends that become handoffs (a problem, an extra job) plus the note that
// a supply order was placed. Identity always comes from the sub's own
// session, never from the request. Off (GET answers { on: false }) where
// FEATURE_SUB_HOME is off or the tables are missing: the portal then shows
// today's screen.

import { NextRequest, NextResponse } from "next/server";
import { getSubPortalByEmail, subPortalOnPostgres } from "@/lib/data/sub-portal";
import { firstNameOf, readSubSession } from "@/lib/subDevice";
import { isNonProduction } from "@/lib/portalAuth";
import { startSubRequest, subHomeReady, subRequests, todaySites } from "@/lib/pg/sub-home";

const TEST_SUB_EMAIL = "zz-test-sub@example.com";

const clean = (value: unknown, max = 2000) => String(value ?? "").trim().slice(0, max);
const refuse = (error: string, status = 400) => NextResponse.json({ success: false, error }, { status });

async function identity(request: NextRequest) {
  const session = await readSubSession(request, NextResponse.json({}));
  if (!session.subcontractorEmail) return null;
  return { email: session.subcontractorEmail, name: session.subcontractorName ?? "" };
}

export async function GET(request: NextRequest) {
  try {
    if (!subPortalOnPostgres() || !(await subHomeReady())) return NextResponse.json({ success: true, on: false });
    const me = await identity(request);
    if (!me) return refuse("Not logged in.", 401);
    const portal = await getSubPortalByEmail(me.email);
    if (!portal) return refuse("Not logged in.", 401);
    const sub = portal.subcontractor as Record<string, unknown>;
    const contact = clean(sub.contactName ?? sub.name ?? me.name);
    const [sites, requests] = await Promise.all([todaySites(me.email, portal.accounts as Record<string, unknown>[]), subRequests(me.email)]);
    // The test sub (scripts/migrate/create-test-sub.mts) has no real accounts:
    // outside production it gets one made-up site, so every button can be tried.
    const today =
      sites.length === 0 && isNonProduction() && me.email.trim().toLowerCase() === TEST_SUB_EMAIL
        ? [{ accountId: "zz-test-site", accountName: "ZZ Test Site", address: "1 Test Street (made up)", timeWindow: "Morning", done: false }]
        : sites;
    return NextResponse.json(
      { success: true, on: true, firstName: firstNameOf(contact || me.name), today, requests, waiting: requests.filter((r) => r.status !== "done").length },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    console.error("[sub home GET]", error instanceof Error ? error.message : error);
    return refuse("That did not load.", 500);
  }
}

export async function POST(request: NextRequest) {
  try {
    if (!subPortalOnPostgres() || !(await subHomeReady())) return refuse("Not available here yet.", 409);
    const me = await identity(request);
    if (!me) return refuse("Not logged in.", 401);
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const action = clean(body.action, 40);
    const base = { accountId: clean(body.accountId, 200), accountName: clean(body.accountName, 300), sub: me.name, subEmail: me.email };

    // An extra job the sub saw or was asked for: to the office's To process list.
    if (action === "extraJob") {
      if (!clean(body.notes) && !clean(body.photoUrl)) return refuse("Add a photo or say what the job is.");
      const item = await startSubRequest({ ...base, kind: "extra", data: { notes: clean(body.notes), photoUrl: clean(body.photoUrl), updateType: "Extra job (from the sub)" } });
      return NextResponse.json({ success: true, id: item.itemId });
    }

    // A problem at a site: to the account manager's My work. (The portal also
    // files it the way it always has; this is the tracking on top.)
    if (action === "problem") {
      const problemType = clean(body.problemType, 80);
      if (!problemType) return refuse("Pick what happened.");
      const item = await startSubRequest({ ...base, kind: "issue", data: { problemType, notes: clean(body.notes), photoUrl: clean(body.photoUrl) } });
      return NextResponse.json({ success: true, id: item.itemId });
    }

    // A supply order the portal just placed: it starts the supply steps at once.
    if (action === "orderPlaced") {
      const orderId = clean(body.orderId, 200);
      if (!orderId) return refuse("orderId is required.");
      await startSubRequest({ ...base, kind: "order", itemId: orderId, data: { items: clean(body.items, 300) } });
      return NextResponse.json({ success: true });
    }

    return refuse(`Unknown action "${action}".`);
  } catch (error) {
    console.error("[sub home POST]", error instanceof Error ? error.message : error);
    return refuse("That did not send. Try again.", 500);
  }
}
