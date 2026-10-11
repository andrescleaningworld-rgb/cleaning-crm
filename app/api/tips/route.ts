// First-time tips: what the logged-in staff member has already seen, kept in
// Postgres so it follows them to every device. Staff only (proxy.ts default
// gate). When this database has no tips_seen table yet, it answers
// { ready: false } and the browser keeps its own memory, as before.

import { NextRequest, NextResponse } from "next/server";
import { getAdminIdentity } from "@/lib/adminSession";
import { getTips, markTipsSeen, setTipsOff, tipsReady } from "@/lib/pg/tips";

const noStore = { headers: { "Cache-Control": "no-store" } };

/** One steady key per person: their login's own id, else their Staff ID, else their name. */
async function personOf(request: NextRequest): Promise<string> {
  const identity = await getAdminIdentity(request);
  return String(identity?.accountId || identity?.staffId || identity?.name || "").trim();
}

export async function GET(request: NextRequest) {
  try {
    const person = await personOf(request);
    if (!person || !(await tipsReady())) return NextResponse.json({ success: true, ready: false }, noStore);
    return NextResponse.json({ success: true, ready: true, ...(await getTips(person)) }, noStore);
  } catch (error) {
    console.error("[tips GET]", error instanceof Error ? error.message : error);
    return NextResponse.json({ success: true, ready: false }, noStore);
  }
}

export async function POST(request: NextRequest) {
  try {
    const person = await personOf(request);
    if (!person) return NextResponse.json({ success: false, error: "Log in first." }, { status: 401 });
    if (!(await tipsReady())) return NextResponse.json({ success: true, ready: false }, noStore);
    const body = (await request.json().catch(() => ({}))) as { seen?: unknown; off?: unknown };
    if (Array.isArray(body.seen)) await markTipsSeen(person, body.seen.map((id) => String(id)));
    if (typeof body.off === "boolean") await setTipsOff(person, body.off);
    return NextResponse.json({ success: true, ready: true }, noStore);
  } catch (error) {
    console.error("[tips POST]", error instanceof Error ? error.message : error);
    return NextResponse.json({ success: false, error: "That did not save. Try again." }, { status: 500 });
  }
}
