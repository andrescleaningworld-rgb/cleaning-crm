import { NextRequest, NextResponse } from "next/server";
import {
  appendEquipmentRepair,
  fetchEquipmentRepairs,
  getEquipmentById,
  getOpenRepairForEquipment,
  updateEquipmentFields,
} from "@/lib/googleSheets";

type RouteContext = { params: Promise<{ id: string }> };

// Only ever called from app/equipment/[id]/page.tsx's Repair History section
// — the list page must never read EquipmentRepairs.
export async function GET(_request: NextRequest, { params }: RouteContext) {
  try {
    const { id } = await params;
    const repairs = await fetchEquipmentRepairs(id);
    return NextResponse.json({ success: true, repairs });
  } catch (err) {
    console.error("[equipment/[id]/repairs GET]", err);
    return NextResponse.json(
      { success: false, error: "Failed to load repair history." },
      { status: 500 }
    );
  }
}

// The "manually mark as In Repair from the detail page" trigger — opens a
// repair record and flips Equipment Status to InRepair in the same request.
// The other trigger (damage flagged on return) goes through
// appendEquipmentRepair directly from app/api/equipment/[id]/return/route.ts
// instead of this route, since that flow is transitioning CheckedOut ->
// InRepair, not Available -> InRepair, and already has its own signing-staff
// validation.
export async function POST(request: NextRequest, { params }: RouteContext) {
  try {
    const { id } = await params;
    const body = (await request.json()) as {
      description?: string;
      cost?: number;
      performedBy?: string;
      partsUsed?: string;
      startedAt?: string;
    };

    const description = body.description?.trim();
    if (!description) {
      return NextResponse.json({ success: false, error: "Description is required." }, { status: 400 });
    }

    const [equipment, openRepair] = await Promise.all([
      getEquipmentById(id),
      getOpenRepairForEquipment(id),
    ]);

    if (!equipment) {
      return NextResponse.json({ success: false, error: "Equipment not found." }, { status: 404 });
    }
    if (equipment.status !== "Available") {
      return NextResponse.json(
        {
          success: false,
          error: `Equipment must be Available to send it for repair (current status: ${equipment.status}).`,
        },
        { status: 409 }
      );
    }
    if (openRepair) {
      return NextResponse.json(
        { success: false, error: "Equipment already has an open repair." },
        { status: 409 }
      );
    }

    const repairId = await appendEquipmentRepair({
      equipmentId: equipment.id,
      description,
      cost: body.cost,
      performedBy: body.performedBy?.trim(),
      partsUsed: body.partsUsed?.trim(),
      startedAt: body.startedAt?.trim(),
    });

    await updateEquipmentFields(equipment.id, { status: "InRepair" });

    return NextResponse.json({ success: true, id: repairId });
  } catch (err) {
    console.error("[equipment/[id]/repairs POST]", err);
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Failed to create repair record." },
      { status: 500 }
    );
  }
}
