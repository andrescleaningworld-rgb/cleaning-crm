// Admin-only. POST = "Allow PIN setup" / "Reset PIN" (same action: clears
// any existing PIN and lockout, opens a 48-hour window for the person to
// create their own PIN on the tablet). Only for Active Staff.
import { NextRequest, NextResponse } from "next/server";
import { getStaffById } from "@/lib/googleSheets";
import { allowEquipmentPinSetup } from "@/lib/equipmentCheckDb";

export async function POST(_request: NextRequest, { params }: { params: Promise<{ staffId: string }> }) {
  try {
    const { staffId } = await params;
    const staff = await getStaffById(staffId);
    if (!staff) return NextResponse.json({ success: false, error: "Staff member not found." }, { status: 404 });
    if (!staff.active) {
      return NextResponse.json({ success: false, error: "Activate this staff member first." }, { status: 400 });
    }

    const pin = await allowEquipmentPinSetup(staff.id);
    return NextResponse.json({ success: true, pin });
  } catch (error) {
    console.error("[equipment-pins POST]", error);
    return NextResponse.json({ success: false, error: "Failed to allow PIN setup." }, { status: 500 });
  }
}
