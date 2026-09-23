// Public route — signed-in tablet session required. "What did you use?"
// cards: every non-retired item from the Equipment tab (read only), with
// just what a card shows — id, name, tag (serial number), photo.
import { NextRequest, NextResponse } from "next/server";
import { fetchEquipmentList } from "@/lib/googleSheets";
import { requireEquipmentCheckSession, startEquipmentCheckSession } from "@/lib/equipmentCheckSession";

export async function GET(request: NextRequest, { params }: { params: Promise<{ key: string }> }) {
  try {
    const { key } = await params;
    const ctx = await requireEquipmentCheckSession(request, key);
    if (!ctx) return NextResponse.json({ success: false, error: "Not signed in." }, { status: 401 });

    const items = (await fetchEquipmentList())
      .filter((item) => item.status !== "Retired")
      .map((item) => ({ id: item.id, name: item.name, tag: item.serialNumber, photoUrl: item.photoUrl }))
      .sort((a, b) => a.name.localeCompare(b.name));

    const response = NextResponse.json({ success: true, equipment: items });
    await startEquipmentCheckSession(request, response, ctx.staff.id, ctx.keyVersion);
    return response;
  } catch (error) {
    console.error("[equipment-check equipment GET]", error);
    return NextResponse.json({ success: false, error: "Something went wrong." }, { status: 500 });
  }
}
