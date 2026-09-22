// Admin-only (proxy.ts default admin gate). CRUD for the supply_items
// catalog used by the Site Supply Link feature.
import { NextRequest, NextResponse } from "next/server";
import { listSupplyItems, createSupplyItem, updateSupplyItem } from "@/lib/siteLinkDb";

export async function GET() {
  try {
    const items = await listSupplyItems(false);
    return NextResponse.json({ success: true, items });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Failed to load supply items." },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const action = String(body.action ?? "");

    if (action === "create") {
      const name = String(body.name ?? "").trim();
      const unit = String(body.unit ?? "unit").trim() || "unit";
      const sortOrder = Number.isInteger(Number(body.sortOrder)) ? Number(body.sortOrder) : 0;

      if (!name) {
        return NextResponse.json({ success: false, error: "name is required." }, { status: 400 });
      }

      const item = await createSupplyItem({ name, unit, sortOrder });
      return NextResponse.json({ success: true, item });
    }

    if (action === "update") {
      const id = Number(body.id);
      if (!Number.isInteger(id)) {
        return NextResponse.json({ success: false, error: "A valid id is required." }, { status: 400 });
      }

      const item = await updateSupplyItem(id, {
        name: typeof body.name === "string" ? body.name.trim() : undefined,
        unit: typeof body.unit === "string" ? body.unit.trim() : undefined,
        sortOrder: Number.isInteger(Number(body.sortOrder)) ? Number(body.sortOrder) : undefined,
        active: typeof body.active === "boolean" ? body.active : undefined,
      });

      if (!item) {
        return NextResponse.json({ success: false, error: "Item not found." }, { status: 404 });
      }
      return NextResponse.json({ success: true, item });
    }

    return NextResponse.json({ success: false, error: `Unknown action "${action}".` }, { status: 400 });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Failed to save supply item." },
      { status: 500 }
    );
  }
}
