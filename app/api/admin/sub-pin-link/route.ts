// Staff: make a subcontractor's personal PIN setup link and text it to them.
// Staff only (proxy.ts default gate). Outside production the link is also
// returned, to be shown on screen: no text really goes out there
// (OUTBOUND_DRY_RUN), and the test sub has a made-up phone.

import { NextRequest, NextResponse } from "next/server";
import { getAdminIdentity } from "@/lib/adminSession";
import { getSubPortalByEmail, subPortalOnPostgres } from "@/lib/data/sub-portal";
import { isNonProduction } from "@/lib/portalAuth";
import { firstNameOf } from "@/lib/subDevice";
import { sendSms } from "@/lib/sms";
import { MOTTO } from "@/app/ui/words";
import { createSetupLink, subHomeReady, SETUP_LINK_DAYS } from "@/lib/pg/sub-home";

const refuse = (error: string, status = 400) => NextResponse.json({ success: false, error }, { status });

export async function GET() {
  return NextResponse.json({ success: true, on: subPortalOnPostgres() && (await subHomeReady()) });
}

export async function POST(request: NextRequest) {
  try {
    if (!subPortalOnPostgres() || !(await subHomeReady())) return refuse("PIN login is not turned on here yet.", 409);
    const identity = await getAdminIdentity(request);
    if (!identity) return refuse("Log in first.", 401);
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const email = String(body.email ?? "").trim().toLowerCase();
    if (!email) return refuse("This subcontractor has no email on file. Add one first.");
    const portal = await getSubPortalByEmail(email);
    if (!portal) return refuse("No subcontractor has that email.", 404);
    const sub = portal.subcontractor as Record<string, unknown>;
    const phone = String(sub.phone ?? "").replace(/\D/g, "");

    const token = await createSetupLink(email, identity.name ?? "");
    const link = `${new URL(request.url).origin}/subcontractor-portal/setup?token=${token}`;
    const first = firstNameOf(String(sub.contactName ?? sub.name ?? ""));

    let texted = false;
    if (phone.length >= 10) {
      const result = await sendSms(phone, `Cleaning World: ${first ? `${first}, ` : ""}tap to pick your PIN: ${link} ${MOTTO.es}`, "sub-pin-link").catch(() => ({ success: false }));
      texted = result.success === true;
    }
    return NextResponse.json({
      success: true,
      texted,
      hasPhone: phone.length >= 10,
      days: SETUP_LINK_DAYS,
      // Only outside production: lets the link be tested without a real text.
      ...(isNonProduction() ? { devLink: link } : {}),
    });
  } catch (error) {
    console.error("[sub-pin-link POST]", error instanceof Error ? error.message : error);
    return refuse("The link was not made. Try again.", 500);
  }
}
