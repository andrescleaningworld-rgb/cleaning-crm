import { NextRequest, NextResponse } from "next/server";
import { getEquipmentById, updateEquipmentFields } from "@/lib/googleSheets";

type RouteContext = { params: Promise<{ id: string }> };

function errorStatus(err: unknown): number {
  return err instanceof Error && err.message.includes("not found") ? 404 : 500;
}

export async function GET(_request: NextRequest, { params }: RouteContext) {
  try {
    const { id } = await params;
    const equipment = await getEquipmentById(id);
    if (!equipment) {
      return NextResponse.json({ success: false, error: "Equipment not found." }, { status: 404 });
    }
    return NextResponse.json({ success: true, equipment });
  } catch (err) {
    console.error("[equipment/[id] GET]", err);
    return NextResponse.json({ success: false, error: "Failed to load equipment." }, { status: 500 });
  }
}

// Edits catalog fields only — Status/CurrentHolder*/CheckedOutAt/
// ExpectedReturnAt are exclusively owned by checkout/return/repairs, never
// writable through this route.
export async function PATCH(request: NextRequest, { params }: RouteContext) {
  try {
    const { id } = await params;
    const body = (await request.json()) as {
      name?: string;
      categoryId?: string;
      serialNumber?: string;
      purchaseDate?: string;
      purchaseCost?: number;
      conditionNotes?: string;
      photoUrl?: string;
      needsMaintenanceReview?: boolean;
    };

    const fields: Parameters<typeof updateEquipmentFields>[1] = {};
    if (body.name !== undefined) fields.name = body.name.trim();
    if (body.categoryId !== undefined) fields.categoryId = body.categoryId.trim();
    if (body.serialNumber !== undefined) fields.serialNumber = body.serialNumber.trim();
    if (body.purchaseDate !== undefined) fields.purchaseDate = body.purchaseDate.trim();
    if (body.purchaseCost !== undefined) fields.purchaseCost = Number(body.purchaseCost) || 0;
    if (body.conditionNotes !== undefined) fields.conditionNotes = body.conditionNotes.trim();
    if (body.photoUrl !== undefined) fields.photoUrl = body.photoUrl.trim();
    if (body.needsMaintenanceReview !== undefined) fields.needsMaintenanceReview = body.needsMaintenanceReview;

    await updateEquipmentFields(id, fields);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[equipment/[id] PATCH]", err);
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Failed to update equipment." },
      { status: errorStatus(err) }
    );
  }
}
