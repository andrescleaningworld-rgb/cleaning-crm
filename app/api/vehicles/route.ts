// Admin-only (proxy.ts default admin gate). Vehicles list + Add vehicle.
// Postgres only (lib/vehiclesDb.ts); no Sheets access here — the pages get
// driver names from /api/staff.
import { NextRequest, NextResponse } from "next/server";
import { createVehicle, listLastServiceLogs, listServiceItems, listVehicles } from "@/lib/vehiclesDb";
import { parseMileage, parseVehicleInput } from "@/lib/vehicleInput";
import { getAdminIdentity } from "@/lib/adminSession";
import { logActivity } from "@/lib/activityLog";

export async function GET() {
  try {
    const vehicles = await listVehicles(true);
    const ids = vehicles.map((v) => v.id);
    const [items, lastLogs] = await Promise.all([listServiceItems(ids), listLastServiceLogs(ids)]);
    return NextResponse.json({ success: true, vehicles, items, lastLogs });
  } catch (error) {
    console.error("[vehicles GET]", error);
    return NextResponse.json({ success: false, error: "Could not load vehicles." }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const input = parseVehicleInput(body);
    if (typeof input === "string") return NextResponse.json({ success: false, error: input }, { status: 400 });
    const mileage = parseMileage(body.currentMileage);
    if (Number.isNaN(mileage)) return NextResponse.json({ success: false, error: "Mileage doesn't look right." }, { status: 400 });

    const vehicle = await createVehicle(input, mileage);

    const actor = await getAdminIdentity(request);
    if (actor?.accountId) {
      await logActivity({
        actorAccountId: actor.accountId,
        actorRole: actor.role ?? "manager",
        actorName: actor.name || "",
        action: "create",
        entityType: "vehicle",
        entityId: String(vehicle.id),
        detail: vehicle.name,
      });
    }
    return NextResponse.json({ success: true, id: vehicle.id });
  } catch (error) {
    console.error("[vehicles POST]", error);
    return NextResponse.json({ success: false, error: "Could not save. Try again." }, { status: 500 });
  }
}
