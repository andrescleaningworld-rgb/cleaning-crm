// Public route — signed-in tablet session required. "What did you use?"
// cards: every non-retired item from the Equipment tab (read only), with
// just what a card shows — id, name, tag (serial number), photo — then every
// active vehicle (Postgres) as id "vehicle:<n>", tag = plate, kind
// "vehicle" and its last mileage (the tablet asks for mileage first).
import { NextRequest, NextResponse } from "next/server";
import { fetchEquipmentList } from "@/lib/googleSheets";
import { listVehicles } from "@/lib/vehiclesDb";
import { requireEquipmentCheckSession, startEquipmentCheckSession } from "@/lib/equipmentCheckSession";

export async function GET(request: NextRequest, { params }: { params: Promise<{ key: string }> }) {
  try {
    const { key } = await params;
    const ctx = await requireEquipmentCheckSession(request, key);
    if (!ctx) return NextResponse.json({ success: false, error: "Not signed in." }, { status: 401 });

    const [equipment, vehicles] = await Promise.all([fetchEquipmentList(), listVehicles(false)]);
    const items = [
      ...equipment
        .filter((item) => item.status !== "Retired")
        .map((item) => ({ id: item.id, name: item.name, tag: item.serialNumber, photoUrl: item.photoUrl, kind: "equipment" as const, lastMileage: null }))
        .sort((a, b) => a.name.localeCompare(b.name)),
      ...vehicles.map((v) => ({
        id: `vehicle:${v.id}`,
        name: v.name,
        tag: v.plate,
        photoUrl: v.photoUrl,
        kind: "vehicle" as const,
        lastMileage: v.currentMileage,
      })),
    ];

    const response = NextResponse.json({ success: true, equipment: items });
    await startEquipmentCheckSession(request, response, ctx.staff.id, ctx.keyVersion);
    return response;
  } catch (error) {
    console.error("[equipment-check equipment GET]", error);
    return NextResponse.json({ success: false, error: "Something went wrong." }, { status: 500 });
  }
}
