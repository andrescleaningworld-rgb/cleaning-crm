// Admin-only (proxy.ts default admin gate). One vehicle: GET everything the
// vehicle page shows; POST { action } for each button on it:
//   update      — Edit (name, plate, VIN, year/make/model, photo, driver)
//   mileage     — Update mileage (office: sets the number as typed)
//   logService  — Log service (marks the item done, records mileage)
//   saveItem    — add / edit a service item (itemId omitted = add)
//   retire / restore — active=false/true (no hard delete)
// Postgres only (lib/vehiclesDb.ts); no Sheets access here.
import { NextRequest, NextResponse } from "next/server";
import {
  getVehicle,
  listMileageReadings,
  listServiceItems,
  listServiceLogs,
  logService,
  recordMileage,
  saveServiceItem,
  setVehicleActive,
  updateVehicle,
} from "@/lib/vehiclesDb";
import { parseDate, parseMileage, parseServiceItemInput, parseVehicleInput } from "@/lib/vehicleInput";
import { SERVICE_TYPES, todayInCompanyTz } from "@/lib/vehicleDue";
import { getAdminIdentity } from "@/lib/adminSession";
import { logActivity } from "@/lib/activityLog";

type RouteContext = { params: Promise<{ id: string }> };

const bad = (error: string, status = 400) => NextResponse.json({ success: false, error }, { status });

export async function GET(_request: NextRequest, { params }: RouteContext) {
  try {
    const id = Number((await params).id);
    const vehicle = Number.isInteger(id) ? await getVehicle(id) : null;
    if (!vehicle) return bad("Vehicle not found.", 404);
    const [items, logs, readings] = await Promise.all([listServiceItems([id]), listServiceLogs(id), listMileageReadings(id)]);
    return NextResponse.json({ success: true, vehicle, items, logs, readings });
  } catch (error) {
    console.error("[vehicles/[id] GET]", error);
    return bad("Could not load this vehicle.", 500);
  }
}

export async function POST(request: NextRequest, { params }: RouteContext) {
  try {
    const id = Number((await params).id);
    const vehicle = Number.isInteger(id) ? await getVehicle(id) : null;
    if (!vehicle) return bad("Vehicle not found.", 404);
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const action = String(body.action ?? "");
    const actor = await getAdminIdentity(request);
    const actorName = actor?.name || "Office";
    let detail = "";

    if (action === "update") {
      const input = parseVehicleInput(body);
      if (typeof input === "string") return bad(input);
      await updateVehicle(id, input);
      detail = `Edited ${input.name}`;
    } else if (action === "mileage") {
      const mileage = parseMileage(body.mileage);
      if (mileage === null || Number.isNaN(mileage)) return bad("Type the mileage.");
      await recordMileage({ vehicleId: id, mileage, staffId: actor?.staffId ?? null, source: "office", force: true });
      detail = `Mileage set to ${mileage}`;
    } else if (action === "logService") {
      const doneOn = parseDate(body.doneOn) ?? todayInCompanyTz();
      const nextDueDate = parseDate(body.nextDueDate);
      const mileage = parseMileage(body.mileage);
      const cost = body.cost === undefined || body.cost === null || String(body.cost).trim() === "" ? null : Number(body.cost);
      if (doneOn === "invalid" || nextDueDate === "invalid") return bad("Date doesn't look right.");
      if (doneOn > todayInCompanyTz()) return bad("The date can't be in the future.");
      if (Number.isNaN(mileage)) return bad("Mileage doesn't look right.");
      if (cost !== null && (!Number.isFinite(cost) || cost < 0 || cost > 1_000_000)) return bad("Cost doesn't look right.");

      // Type = one of the quick-picks, or the name of one of this vehicle's
      // own active reminders. A type that matches a reminder (e.g. "Oil
      // change") marks that reminder done, which restarts its countdown.
      const serviceType = String(body.serviceType ?? "").trim();
      const items = await listServiceItems([id]);
      const matchingItem = items.find((i) => i.active && i.name.trim().toLowerCase() === serviceType.toLowerCase()) ?? null;
      if (!serviceType || !((SERVICE_TYPES as readonly string[]).includes(serviceType) || matchingItem)) {
        return bad("Tap what was done.");
      }
      const notes = String(body.notes ?? "").trim().slice(0, 1000);
      await logService({
        vehicleId: id,
        serviceItemId: matchingItem?.id ?? null,
        doneOn,
        mileage,
        serviceType,
        notes,
        shop: String(body.shop ?? "").trim().slice(0, 200),
        cost: cost === null ? null : Math.round(cost * 100) / 100,
        receiptUrl: String(body.receiptUrl ?? "").trim().slice(0, 500),
        createdBy: actorName,
        nextDueDate,
      });
      detail = `Logged service: ${serviceType}${notes ? ` — ${notes}` : ""}`;
    } else if (action === "saveItem") {
      const input = parseServiceItemInput(body);
      if (typeof input === "string") return bad(input);
      const itemId = body.itemId ? Number(body.itemId) : null;
      await saveServiceItem(id, itemId, input);
      detail = `${itemId ? "Edited" : "Added"} service item: ${input.name}`;
    } else if (action === "retire" || action === "restore") {
      await setVehicleActive(id, action === "restore");
      detail = action === "retire" ? "Retired" : "Restored";
    } else {
      return bad("Unknown action.");
    }

    if (actor?.accountId) {
      await logActivity({
        actorAccountId: actor.accountId,
        actorRole: actor.role ?? "manager",
        actorName,
        action: "update",
        entityType: "vehicle",
        entityId: String(id),
        detail: `${vehicle.name}: ${detail}`,
      });
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[vehicles/[id] POST]", error);
    return bad("Could not save. Try again.", 500);
  }
}
