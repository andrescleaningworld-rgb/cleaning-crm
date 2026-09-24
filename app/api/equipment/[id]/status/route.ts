// Admin-only (proxy.ts default admin gate). The Equipment page's three
// status buttons that have no other home:
//   retire  — Status → Retired (the Equipment page's "Retire / Remove"; there
//             is no hard delete, so checkout/repair history stays). Blocked
//             while the item is checked out or in repair.
//   restore — Retired → Available.
//   found   — a manager's "Found it" on a Lost item: writes a "good" row to
//             equipment_reports with the manager's note, which (being the
//             newest report) clears Lost and shows in the item's history.
// Sheets: retire/restore write only the existing Status column of the
// Equipment tab through updateEquipmentFields. "found" writes Postgres only.
import { NextRequest, NextResponse } from "next/server";
import { getEquipmentById, updateEquipmentFields } from "@/lib/googleSheets";
import { createEquipmentReport } from "@/lib/equipmentCheckDb";
import { getAdminIdentity } from "@/lib/adminSession";
import { logActivity } from "@/lib/activityLog";

type RouteContext = { params: Promise<{ id: string }> };

const MAX_NOTE_LENGTH = 1000;

export async function POST(request: NextRequest, { params }: RouteContext) {
  try {
    const { id } = await params;
    const body = (await request.json().catch(() => ({}))) as { action?: string; note?: string };
    const action = String(body.action ?? "");

    const equipment = await getEquipmentById(id);
    if (!equipment) return NextResponse.json({ success: false, error: "Equipment not found." }, { status: 404 });
    const actor = await getAdminIdentity(request);
    const actorName = actor?.name || "Office";

    if (action === "retire") {
      if (equipment.status === "Retired") return NextResponse.json({ success: true });
      if (equipment.status === "CheckedOut") {
        return NextResponse.json({ success: false, error: "Return it first — it's checked out." }, { status: 409 });
      }
      if (equipment.status === "InRepair") {
        return NextResponse.json({ success: false, error: "Finish the repair first." }, { status: 409 });
      }
      await updateEquipmentFields(id, { status: "Retired" });
    } else if (action === "restore") {
      if (equipment.status !== "Retired") {
        return NextResponse.json({ success: false, error: "Only retired equipment can be restored." }, { status: 409 });
      }
      await updateEquipmentFields(id, { status: "Available" });
    } else if (action === "found") {
      const note = String(body.note ?? "").trim().slice(0, MAX_NOTE_LENGTH);
      await createEquipmentReport({
        staffId: actor?.staffId || `office:${actor?.accountId ?? "unknown"}`,
        equipmentId: id,
        condition: "good",
        notesOriginal: `Found it — marked by ${actorName} in the office.${note ? ` ${note}` : ""}`,
      });
    } else {
      return NextResponse.json({ success: false, error: "Unknown action." }, { status: 400 });
    }

    if (actor?.accountId) {
      await logActivity({
        actorAccountId: actor.accountId,
        actorRole: actor.role ?? "manager",
        actorName,
        action: "update",
        entityType: "equipment",
        entityId: id,
        detail: `${action === "retire" ? "Retired" : action === "restore" ? "Restored" : "Marked found"}: ${equipment.name}`,
      });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[equipment/[id]/status POST]", err);
    return NextResponse.json({ success: false, error: "Something went wrong." }, { status: 500 });
  }
}
