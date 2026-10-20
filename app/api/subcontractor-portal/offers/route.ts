// Subcontractor portal: new-account offers (step 3 of the New Account flow,
// lib/pg/account-flow.ts). proxy.ts leaves /api/subcontractor-portal public,
// so this route checks the sub_session itself, like ./checklists/route.ts.
// A sub only ever sees and answers the offers made to them.
//
// GET                                   { offers } waiting for this sub's answer
// POST { accountId, answer: "yes"|"no" }  "Yes, I can do it" / "No, I can't"

import { NextRequest, NextResponse } from "next/server";
import { getIronSession } from "iron-session";
import { subSessionOptions, type SubSessionData } from "@/lib/subSession";
import { invalidateAccountLists } from "@/app/api/accounts/route";
import { FlowError, answerOffer, offersForSub } from "@/lib/pg/account-flow";

const clean = (value: unknown) => String(value ?? "").trim();
const noStore = { headers: { "Cache-Control": "no-store" } };

async function readSession(request: NextRequest) {
  const session = await getIronSession<SubSessionData>(request, NextResponse.json({}), subSessionOptions());
  return { subId: clean(session.subcontractorId), email: clean(session.subcontractorEmail), name: clean(session.subcontractorName) };
}

export async function GET(request: NextRequest) {
  try {
    const sub = await readSession(request);
    if (!sub.subId && !sub.email) return NextResponse.json({ success: false, error: "Not logged in." }, { status: 401 });
    return NextResponse.json({ success: true, offers: await offersForSub(sub.subId, sub.email) }, noStore);
  } catch (error) {
    console.error("[subcontractor-portal/offers GET]", error instanceof Error ? error.message : error);
    return NextResponse.json({ success: false, error: "Could not load new accounts." }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const sub = await readSession(request);
    if (!sub.subId && !sub.email) return NextResponse.json({ success: false, error: "Not logged in." }, { status: 401 });
    const body = (await request.json().catch(() => ({}))) as { accountId?: unknown; answer?: unknown };
    const accountId = clean(body.accountId);
    const answer = clean(body.answer);
    if (!accountId || (answer !== "yes" && answer !== "no")) return NextResponse.json({ success: false, error: "Tap Yes or No." }, { status: 400 });
    await answerOffer({ accountId, subId: sub.subId, email: sub.email, subName: sub.name, yes: answer === "yes", origin: new URL(request.url).origin });
    if (answer === "yes") await invalidateAccountLists();
    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof FlowError) return NextResponse.json({ success: false, error: error.message }, { status: 409 });
    console.error("[subcontractor-portal/offers POST]", error instanceof Error ? error.message : error);
    return NextResponse.json({ success: false, error: "That did not save. Try again." }, { status: 500 });
  }
}
