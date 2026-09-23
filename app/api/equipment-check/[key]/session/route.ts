// Public route — self-checks the link key. POST = PIN sign-in
// ({ staffId, pin }), DELETE = sign out. Same lockout rule as Team Hub
// (lib/pinAuth.ts) and the same one-time office alert when someone gets
// locked out.
import { NextRequest, NextResponse } from "next/server";
import { waitUntil } from "@vercel/functions";
import { getStaffById } from "@/lib/googleSheets";
import { checkEquipmentCheckLinkKey, verifyEquipmentStaffPin } from "@/lib/equipmentCheckDb";
import { startEquipmentCheckSession, endEquipmentCheckSession } from "@/lib/equipmentCheckSession";
import { MAX_FAILED_ATTEMPTS } from "@/lib/pinAuth";
import { checkRateLimit } from "@/lib/siteLinkRateLimit";
import { sendInternalNotification } from "@/lib/email";

export async function POST(request: NextRequest, { params }: { params: Promise<{ key: string }> }) {
  try {
    const { key } = await params;
    const allowed = await checkRateLimit(`equipment-check-login:${key}`);
    if (!allowed) {
      return NextResponse.json({ success: false, error: "Too many attempts. Please wait a minute and try again." }, { status: 429 });
    }

    const link = await checkEquipmentCheckLinkKey(key);
    if (!link) return NextResponse.json({ success: false, error: "This link is no longer active." }, { status: 404 });

    const body = (await request.json()) as { staffId?: string; pin?: string };
    const staffId = String(body.staffId ?? "").trim();
    const pin = String(body.pin ?? "");
    if (!staffId || !pin) {
      return NextResponse.json({ success: false, error: "Choose your name and enter your PIN." }, { status: 400 });
    }

    const staff = await getStaffById(staffId);
    if (!staff || !staff.active) return NextResponse.json({ success: false, error: "Not found." }, { status: 404 });

    const result = await verifyEquipmentStaffPin(staffId, pin);
    if (result.outcome === "no-pin") {
      return NextResponse.json({ success: false, error: "No PIN yet." }, { status: 404 });
    }
    if (result.outcome === "locked") {
      if (result.justLocked) {
        waitUntil(
          sendInternalNotification(`Equipment Check: ${staff.name} locked out`, [
            `${staff.name} was locked out of the Equipment Check tablet app`,
            `after ${MAX_FAILED_ATTEMPTS} incorrect PIN attempts.`,
            `Locked until: ${result.lockedUntil}`,
            `If they forgot their PIN, use "Reset PIN" in Equipment > Categories & Staff.`,
          ]).catch((error) => console.error("[equipment-check lockout alert]", error))
        );
      }
      return NextResponse.json(
        { success: false, error: "Too many incorrect PINs. Locked for a few minutes.", lockedUntil: result.lockedUntil },
        { status: 423 }
      );
    }
    if (result.outcome === "invalid") {
      return NextResponse.json({ success: false, error: "Incorrect PIN." }, { status: 401 });
    }

    const response = NextResponse.json({ success: true, name: staff.name });
    await startEquipmentCheckSession(request, response, staffId, link.keyVersion);
    return response;
  } catch (error) {
    console.error("[equipment-check session POST]", error);
    return NextResponse.json({ success: false, error: "Something went wrong." }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const response = NextResponse.json({ success: true });
  try {
    await endEquipmentCheckSession(request, response);
  } catch (error) {
    console.error("[equipment-check session DELETE]", error);
  }
  return response;
}
