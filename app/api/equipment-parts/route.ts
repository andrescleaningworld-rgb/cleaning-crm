import { NextRequest, NextResponse } from "next/server";
import { appendEquipmentPart, fetchEquipmentParts } from "@/lib/googleSheets";

export async function GET() {
  try {
    const parts = await fetchEquipmentParts();
    return NextResponse.json({ success: true, parts });
  } catch (err) {
    console.error("[equipment-parts GET]", err);
    return NextResponse.json(
      { success: false, error: "Failed to load equipment parts." },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      partName?: string;
      compatibleEquipmentId?: string;
      supplier?: string;
      unitCost?: number;
      stockQty?: number;
      lowStockThreshold?: number;
    };

    const partName = body.partName?.trim();
    if (!partName) {
      return NextResponse.json({ success: false, error: "Part name is required." }, { status: 400 });
    }

    const id = await appendEquipmentPart({
      partName,
      compatibleEquipmentId: body.compatibleEquipmentId?.trim() || "General",
      supplier: body.supplier?.trim() ?? "",
      unitCost: Number(body.unitCost) || 0,
      stockQty: Number(body.stockQty) || 0,
      lowStockThreshold: Number(body.lowStockThreshold) || 0,
    });

    return NextResponse.json({ success: true, id });
  } catch (err) {
    console.error("[equipment-parts POST]", err);
    return NextResponse.json(
      { success: false, error: "Failed to create equipment part." },
      { status: 500 }
    );
  }
}
