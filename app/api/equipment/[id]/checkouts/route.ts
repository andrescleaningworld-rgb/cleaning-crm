import { NextRequest, NextResponse } from "next/server";
import { fetchEquipmentCheckouts } from "@/lib/googleSheets";

type RouteContext = { params: Promise<{ id: string }> };

// Only ever called from app/equipment/[id]/page.tsx — the list page must
// never read EquipmentCheckouts.
export async function GET(_request: NextRequest, { params }: RouteContext) {
  try {
    const { id } = await params;
    const checkouts = await fetchEquipmentCheckouts(id);
    return NextResponse.json({ success: true, checkouts });
  } catch (err) {
    console.error("[equipment/[id]/checkouts GET]", err);
    return NextResponse.json(
      { success: false, error: "Failed to load checkout history." },
      { status: 500 }
    );
  }
}
