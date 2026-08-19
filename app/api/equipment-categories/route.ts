import { NextRequest, NextResponse } from "next/server";
import { appendEquipmentCategory, fetchEquipmentCategories } from "@/lib/googleSheets";

export async function GET() {
  try {
    const categories = await fetchEquipmentCategories();
    return NextResponse.json({ success: true, categories });
  } catch (err) {
    console.error("[equipment-categories GET]", err);
    return NextResponse.json(
      { success: false, error: "Failed to load equipment categories." },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { name?: string };
    const name = body.name?.trim();
    if (!name) {
      return NextResponse.json({ success: false, error: "Name is required." }, { status: 400 });
    }

    const id = await appendEquipmentCategory(name);
    return NextResponse.json({ success: true, id });
  } catch (err) {
    console.error("[equipment-categories POST]", err);
    return NextResponse.json(
      { success: false, error: "Failed to create equipment category." },
      { status: 500 }
    );
  }
}
