// Admin-only. PIN status per Staff ID for the Staff list — whether a PIN
// exists, whether setup is open and until when, lockout. Never the PIN or
// its hash ("Managers never see PINs").
import { NextResponse } from "next/server";
import { listEquipmentStaffPinStatuses } from "@/lib/equipmentCheckDb";

export async function GET() {
  try {
    const pins = await listEquipmentStaffPinStatuses();
    return NextResponse.json({ success: true, pins });
  } catch (error) {
    console.error("[equipment-pins GET]", error);
    return NextResponse.json({ success: false, error: "Failed to load PIN status." }, { status: 500 });
  }
}
