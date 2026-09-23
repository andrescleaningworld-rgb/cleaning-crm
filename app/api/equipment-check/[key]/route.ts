// Public route (proxy.ts PUBLIC_PATHS covers "/api/equipment-check") —
// gated by the secret link key itself. GET returns the tablet's name grid:
// active Staff (Sheets Staff tab, read only) who have a PIN or an open PIN
// setup window. Never returns PIN hashes, lock state, or roles.
import { NextRequest, NextResponse } from "next/server";
import { fetchStaff } from "@/lib/googleSheets";
import { checkEquipmentCheckLinkKey, listEquipmentStaffPinStatuses } from "@/lib/equipmentCheckDb";
import { checkRateLimit } from "@/lib/siteLinkRateLimit";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ key: string }> }) {
  try {
    const { key } = await params;
    const allowed = await checkRateLimit(`equipment-check-people:${key}`);
    if (!allowed) {
      return NextResponse.json({ success: false, error: "Too many requests. Please wait a minute and try again." }, { status: 429 });
    }

    const link = await checkEquipmentCheckLinkKey(key);
    if (!link) return NextResponse.json({ success: true, active: false });

    const [staff, pins] = await Promise.all([fetchStaff(), listEquipmentStaffPinStatuses()]);
    const pinByStaffId = new Map(pins.map((p) => [p.staffId, p]));

    const people = staff
      .filter((s) => s.active)
      .flatMap((s) => {
        const pin = pinByStaffId.get(s.id);
        if (!pin || (!pin.hasPin && !pin.setupOpen)) return [];
        return [{ staffId: s.id, name: s.name, isNew: pin.setupOpen }];
      })
      .sort((a, b) => a.name.localeCompare(b.name));

    return NextResponse.json({ success: true, active: true, people });
  } catch (error) {
    console.error("[equipment-check GET]", error);
    return NextResponse.json({ success: false, error: "Something went wrong." }, { status: 500 });
  }
}
