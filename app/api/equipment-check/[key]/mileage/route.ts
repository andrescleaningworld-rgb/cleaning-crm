// Public route — signed-in tablet session required. The tablet's "Mileage?"
// keypad (after picking a vehicle, before Good/Damaged/Lost). Body:
// { vehicleId: "vehicle:<n>", mileage }. Every reading is saved with who and
// when; the vehicle's current mileage only goes up from a tablet reading
// (lib/vehiclesDb.ts recordMileage). A number lower than the last one needs
// { confirmedLower: true } — the tablet asks "Is that right?" first.
// Postgres only; the session check reads the Staff tab (as every tablet
// route does).
import { NextRequest, NextResponse } from "next/server";
import { requireEquipmentCheckSession, startEquipmentCheckSession } from "@/lib/equipmentCheckSession";
import { checkRateLimit } from "@/lib/siteLinkRateLimit";
import { getVehicle, recordMileage } from "@/lib/vehiclesDb";
import { parseMileage, vehicleIdFromTabletId } from "@/lib/vehicleInput";

export async function POST(request: NextRequest, { params }: { params: Promise<{ key: string }> }) {
  try {
    const { key } = await params;
    if (!(await checkRateLimit(`equipment-check-mileage:${key}`))) {
      return NextResponse.json({ success: false, error: "Too many requests. Please wait a minute and try again." }, { status: 429 });
    }
    const ctx = await requireEquipmentCheckSession(request, key);
    if (!ctx) return NextResponse.json({ success: false, error: "Not signed in." }, { status: 401 });

    const body = (await request.json().catch(() => ({}))) as { vehicleId?: string; mileage?: unknown; confirmedLower?: boolean };
    const vehicleId = vehicleIdFromTabletId(body.vehicleId);
    const vehicle = vehicleId ? await getVehicle(vehicleId) : null;
    if (!vehicle || !vehicle.active) return NextResponse.json({ success: false, error: "Vehicle not found." }, { status: 404 });

    const mileage = parseMileage(body.mileage);
    if (mileage === null || Number.isNaN(mileage)) {
      return NextResponse.json({ success: false, error: "Mileage doesn't look right." }, { status: 400 });
    }
    if (vehicle.currentMileage !== null && mileage < vehicle.currentMileage && body.confirmedLower !== true) {
      return NextResponse.json({ success: false, needsConfirm: true, lastMileage: vehicle.currentMileage }, { status: 409 });
    }

    await recordMileage({ vehicleId: vehicle.id, mileage, staffId: ctx.staff.id, source: "tablet" });

    const response = NextResponse.json({ success: true });
    await startEquipmentCheckSession(request, response, ctx.staff.id, ctx.keyVersion);
    return response;
  } catch (error) {
    console.error("[equipment-check mileage POST]", error);
    return NextResponse.json({ success: false, error: "Something went wrong." }, { status: 500 });
  }
}
