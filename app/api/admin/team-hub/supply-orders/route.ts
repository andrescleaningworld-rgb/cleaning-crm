// Admin-only (proxy.ts default admin gate). Phase 4: list + one-tap
// status change for one site's supply orders. "Delivered" decrements
// Equipment stock via adjustEquipmentPartStock() for any line whose item
// has an equipment_part_id — the second sanctioned direct
// lib/googleSheets.ts import in Team Hub, alongside
// lib/teamHubAccountLookup.ts (see docs/team-hub-spec.md §3: equipment
// stock changes have their own sanctioned path, separate from the
// account-data choke point).
import { NextRequest, NextResponse } from "next/server";
import { listTeamHubSupplyOrdersForSite, setTeamHubSupplyOrderStatus, type TeamHubSupplyOrderStatus } from "@/lib/teamHubDb";
import { adjustEquipmentPartStock } from "@/lib/googleSheets";
import { getAdminIdentity } from "@/lib/adminSession";
import { logActivity } from "@/lib/activityLog";

export async function GET(request: NextRequest) {
  try {
    const siteId = Number(new URL(request.url).searchParams.get("siteId"));
    if (!Number.isInteger(siteId)) {
      return NextResponse.json({ success: false, error: "A valid siteId is required." }, { status: 400 });
    }
    const orders = await listTeamHubSupplyOrdersForSite(siteId);
    return NextResponse.json({ success: true, orders });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Failed to load supply orders." },
      { status: 500 }
    );
  }
}

const VALID_STATUSES = new Set<TeamHubSupplyOrderStatus>(["new", "ordered", "delivered", "cancelled"]);

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const id = Number(body.id);
    const status = String(body.status ?? "");
    if (!Number.isInteger(id) || !VALID_STATUSES.has(status as TeamHubSupplyOrderStatus)) {
      return NextResponse.json({ success: false, error: "A valid id and status are required." }, { status: 400 });
    }

    const order = await setTeamHubSupplyOrderStatus(id, status as TeamHubSupplyOrderStatus);
    if (!order) return NextResponse.json({ success: false, error: "Order not found." }, { status: 404 });

    // Decrement Equipment stock only for lines that actually track an
    // equipment part — most supply items don't. One failed adjustment
    // (e.g. the part was deleted from Equipment since) shouldn't block the
    // rest or the status change itself, which has already been saved.
    if (status === "delivered") {
      for (const line of order.lines) {
        if (!line.equipmentPartId) continue;
        try {
          await adjustEquipmentPartStock(line.equipmentPartId, line.qty, "Restocked");
        } catch (error) {
          console.error(`[team-hub supply-orders] stock adjust failed for part ${line.equipmentPartId}:`, error);
        }
      }
    }

    const actor = await getAdminIdentity(request);
    if (actor?.accountId) {
      await logActivity({
        actorAccountId: actor.accountId,
        actorRole: actor.role ?? "manager",
        actorName: actor.name || "",
        action: "update",
        entityType: "team-hub-supply-order",
        entityId: String(id),
        detail: status,
      });
    }

    return NextResponse.json({ success: true, order });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Failed to update order." },
      { status: 500 }
    );
  }
}
