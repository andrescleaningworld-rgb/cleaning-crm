import { NextRequest, NextResponse } from "next/server";
import { appendEquipmentItem, fetchEquipmentList } from "@/lib/googleSheets";

// Reads only the Equipment tab (fetchEquipmentList) — status, holder, and
// overdue state all live on the Equipment row itself.
export async function GET() {
  try {
    const equipment = await fetchEquipmentList();
    return NextResponse.json({ success: true, equipment });
  } catch (err) {
    console.error("[equipment GET]", err);
    return NextResponse.json(
      { success: false, error: "Failed to load equipment." },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      name?: string;
      categoryId?: string;
      serialNumber?: string;
      purchaseDate?: string;
      purchaseCost?: number;
      conditionNotes?: string;
      photoUrl?: string;
    };

    const name = body.name?.trim();
    if (!name) {
      return NextResponse.json({ success: false, error: "Name is required." }, { status: 400 });
    }

    const id = await appendEquipmentItem({
      name,
      categoryId: body.categoryId?.trim() ?? "",
      serialNumber: body.serialNumber?.trim() ?? "",
      purchaseDate: body.purchaseDate?.trim() ?? "",
      purchaseCost: Number(body.purchaseCost) || 0,
      conditionNotes: body.conditionNotes?.trim() ?? "",
      photoUrl: body.photoUrl?.trim() ?? "",
    });

    return NextResponse.json({ success: true, id });
  } catch (err) {
    console.error("[equipment POST]", err);
    return NextResponse.json(
      { success: false, error: "Failed to create equipment." },
      { status: 500 }
    );
  }
}
