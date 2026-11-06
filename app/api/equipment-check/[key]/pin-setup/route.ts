// Public route — self-checks the link key. "Create your PIN": only works
// while a manager has opened a 48-hour setup window for this Staff ID
// ("Allow PIN setup" / "Reset PIN") and no PIN exists yet. On success the
// person is signed in and goes straight on to the report.
import { filesJson } from "@/lib/files";
import { NextRequest } from "next/server";
import { getStaffById } from "@/lib/data/people";
import { checkEquipmentCheckLinkKey, createEquipmentStaffPin } from "@/lib/equipmentCheckDb";
import { startEquipmentCheckSession } from "@/lib/equipmentCheckSession";
import { isFourDigitPin } from "@/lib/pinAuth";
import { checkRateLimit } from "@/lib/siteLinkRateLimit";

export async function POST(request: NextRequest, { params }: { params: Promise<{ key: string }> }) {
  try {
    const { key } = await params;
    const allowed = await checkRateLimit(`equipment-check-pin-setup:${key}`);
    if (!allowed) {
      return filesJson({ success: false, error: "Too many attempts. Please wait a minute and try again." }, { status: 429 });
    }

    const link = await checkEquipmentCheckLinkKey(key);
    if (!link) return filesJson({ success: false, error: "This link is no longer active." }, { status: 404 });

    const body = (await request.json()) as { staffId?: string; pin?: string; pinConfirm?: string };
    const staffId = String(body.staffId ?? "").trim();
    const pin = String(body.pin ?? "");
    const pinConfirm = String(body.pinConfirm ?? "");
    if (!staffId || !isFourDigitPin(pin)) {
      return filesJson({ success: false, error: "PIN must be 4 digits." }, { status: 400 });
    }
    if (pin !== pinConfirm) {
      return filesJson({ success: false, error: "PINs don't match." }, { status: 400 });
    }

    const staff = await getStaffById(staffId);
    if (!staff || !staff.active) return filesJson({ success: false, error: "Not found." }, { status: 404 });

    const created = await createEquipmentStaffPin(staffId, pin);
    if (!created) {
      return filesJson({ success: false, error: "PIN setup isn't open. Ask your office." }, { status: 409 });
    }

    const response = filesJson({ success: true, name: staff.name });
    await startEquipmentCheckSession(request, response, staffId, link.keyVersion);
    return response;
  } catch (error) {
    console.error("[equipment-check pin-setup POST]", error);
    return filesJson({ success: false, error: "Something went wrong." }, { status: 500 });
  }
}
