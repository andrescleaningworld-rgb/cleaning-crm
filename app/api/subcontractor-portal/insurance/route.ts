// "Upload my insurance" in the sub portal (lib/pg/sub-insurance.ts). Who the
// sub is always comes from their own portal session (the login stays email
// only), never from the request. Off (GET answers { on: false }, POST says
// no) until Settings -> Reminders & check-ins -> "Subs upload insurance in
// the portal" is on, and while migration 056 is missing.
//
// GET    the sub's insurance: date, state, waiting for the office, rejected (why)
// POST   (form) file + expiresOn: waits for the office to approve it

import { NextRequest, NextResponse } from "next/server";
import { readSubSession } from "@/lib/subDevice";
import { saveCoiFromForm } from "@/lib/coiUpload";
import { getFeatureSetting } from "@/lib/pg/feature-settings";
import { addSubCoi, portalInsurance, subIdForPortal, subInsuranceReady } from "@/lib/pg/sub-insurance";

const noStore = { headers: { "Cache-Control": "no-store" } };
const refuse = (error: string, status = 400) => NextResponse.json({ success: false, error }, { status, ...noStore });

async function me(request: NextRequest) {
  const session = await readSubSession(request, NextResponse.json({}));
  if (!session.subcontractorEmail) return null;
  const subId = await subIdForPortal(session.subcontractorId ?? "", session.subcontractorEmail);
  return subId ? { subId, name: session.subcontractorName ?? "", email: session.subcontractorEmail } : null;
}

async function on(): Promise<boolean> {
  return (await subInsuranceReady()) && (await getFeatureSetting("subInsurancePortal")).on;
}

export async function GET(request: NextRequest) {
  try {
    if (!(await on())) return NextResponse.json({ success: true, on: false }, noStore);
    const sub = await me(request);
    if (!sub) return refuse("Not logged in.", 401);
    return NextResponse.json({ success: true, on: true, ...(await portalInsurance(sub.subId)) }, noStore);
  } catch (error) {
    console.error("[portal insurance GET]", error instanceof Error ? error.message : error);
    return refuse("That did not load.", 500);
  }
}

export async function POST(request: NextRequest) {
  try {
    if (!(await on())) return refuse("Not available.", 409);
    const sub = await me(request);
    if (!sub) return refuse("Not logged in.", 401);
    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      return refuse("too-big");
    }
    const saved = await saveCoiFromForm(form);
    await addSubCoi({ subId: sub.subId, ...saved, by: sub.email, subName: sub.name });
    return NextResponse.json({ success: true, ...(await portalInsurance(sub.subId)) }, noStore);
  } catch (error) {
    console.error("[portal insurance POST]", error instanceof Error ? error.message : error);
    return refuse("failed", 500);
  }
}
