import { NextRequest, NextResponse } from "next/server";
import {
  completeEquipmentRepair,
  fetchEquipmentRepairs,
  getEquipmentById,
  updateEquipmentFields,
} from "@/lib/googleSheets";

type RouteContext = { params: Promise<{ id: string; repairId: string }> };

function errorStatus(err: unknown): number {
  return err instanceof Error && err.message.includes("not found") ? 404 : 500;
}

// Marks an Open repair Completed and flips the parent Equipment row back to
// Available — the only mutation this route supports.
export async function PATCH(request: NextRequest, { params }: RouteContext) {
  try {
    const { id, repairId } = await params;
    const body = (await request.json()) as {
      cost?: number;
      performedBy?: string;
      partsUsed?: string;
    };

    const [equipment, repairs] = await Promise.all([
      getEquipmentById(id),
      fetchEquipmentRepairs(id),
    ]);

    if (!equipment) {
      return NextResponse.json({ success: false, error: "Equipment not found." }, { status: 404 });
    }

    const repair = repairs.find((r) => r.id === repairId);
    if (!repair) {
      return NextResponse.json({ success: false, error: "Repair record not found." }, { status: 404 });
    }
    if (repair.status !== "Open") {
      return NextResponse.json({ success: false, error: "This repair is already Completed." }, { status: 409 });
    }

    await completeEquipmentRepair(id, repairId, {
      cost: body.cost,
      performedBy: body.performedBy?.trim(),
      partsUsed: body.partsUsed?.trim(),
    });

    await updateEquipmentFields(id, {
      status: "Available",
      needsMaintenanceReview: false,
      currentHolderType: "",
      currentHolderId: "",
      currentHolderName: "",
      checkedOutAt: "",
      expectedReturnAt: "",
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[equipment/[id]/repairs/[repairId] PATCH]", err);
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Failed to complete repair." },
      { status: errorStatus(err) }
    );
  }
}
