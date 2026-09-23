// Admin-only (proxy.ts default admin gate). Phase 6: CRUD for the three
// company-wide Team Hub libraries (hub_checklist_library, hub_round_library,
// supply_items) — Phase 0 only read them. No delete: an item can be
// referenced by a live hub_crew_items row or past run history, so "remove"
// is always setActive(false), same convention every other Team Hub admin
// entity uses. No Sheets reads/writes in this file.
import { NextRequest, NextResponse } from "next/server";
import {
  listChecklistLibrary,
  createChecklistLibraryItem,
  updateChecklistLibraryItem,
  setChecklistLibraryItemActive,
  listRoundLibrary,
  createRoundLibraryItem,
  updateRoundLibraryItem,
  setRoundLibraryItemActive,
  listSupplyItemsLibrary,
  createSupplyLibraryItem,
  updateSupplyLibraryItem,
  setSupplyLibraryItemActive,
} from "@/lib/teamHubDb";

type LibraryType = "checklist" | "round" | "supply";

function isLibraryType(value: unknown): value is LibraryType {
  return value === "checklist" || value === "round" || value === "supply";
}

export async function GET() {
  try {
    const [checklist, rounds, supplies] = await Promise.all([
      listChecklistLibrary(false),
      listRoundLibrary(false),
      listSupplyItemsLibrary(false),
    ]);
    return NextResponse.json({ success: true, checklist, rounds, supplies });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Failed to load libraries." },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const type = body.type;
    if (!isLibraryType(type)) {
      return NextResponse.json({ success: false, error: 'type must be "checklist", "round", or "supply".' }, { status: 400 });
    }
    const action = String(body.action ?? "");

    if (action === "create") {
      if (type === "checklist") {
        const area = String(body.area ?? "").trim();
        const text = String(body.text ?? "").trim();
        const defaultFrequency = body.defaultFrequency;
        if (!area || !text || (defaultFrequency !== "visit" && defaultFrequency !== "weekly" && defaultFrequency !== "monthly")) {
          return NextResponse.json({ success: false, error: "area, text, and a valid defaultFrequency are required." }, { status: 400 });
        }
        const item = await createChecklistLibraryItem({ area, text, defaultFrequency, isNote: Boolean(body.isNote) });
        return NextResponse.json({ success: true, item });
      }
      if (type === "round") {
        const name = String(body.name ?? "").trim();
        const defaultIntervalMinutes = Number(body.defaultIntervalMinutes);
        if (!name || !Number.isInteger(defaultIntervalMinutes) || defaultIntervalMinutes <= 0) {
          return NextResponse.json({ success: false, error: "name and a positive defaultIntervalMinutes are required." }, { status: 400 });
        }
        const item = await createRoundLibraryItem({ name, defaultIntervalMinutes });
        return NextResponse.json({ success: true, item });
      }
      // supply
      const name = String(body.name ?? "").trim();
      const unit = String(body.unit ?? "").trim() || "unit";
      const sortOrder = Number.isInteger(Number(body.sortOrder)) ? Number(body.sortOrder) : 0;
      const equipmentPartId = body.equipmentPartId ? String(body.equipmentPartId).trim() : null;
      if (!name) {
        return NextResponse.json({ success: false, error: "name is required." }, { status: 400 });
      }
      const item = await createSupplyLibraryItem({ name, unit, sortOrder, equipmentPartId });
      return NextResponse.json({ success: true, item });
    }

    const id = Number(body.id);
    if (!Number.isInteger(id)) {
      return NextResponse.json({ success: false, error: "A valid id is required." }, { status: 400 });
    }

    if (action === "update") {
      if (type === "checklist") {
        const item = await updateChecklistLibraryItem(id, {
          area: typeof body.area === "string" ? body.area.trim() : undefined,
          text: typeof body.text === "string" ? body.text.trim() : undefined,
          defaultFrequency: body.defaultFrequency,
          isNote: typeof body.isNote === "boolean" ? body.isNote : undefined,
        });
        if (!item) return NextResponse.json({ success: false, error: "Item not found." }, { status: 404 });
        return NextResponse.json({ success: true, item });
      }
      if (type === "round") {
        const item = await updateRoundLibraryItem(id, {
          name: typeof body.name === "string" ? body.name.trim() : undefined,
          defaultIntervalMinutes: Number.isInteger(Number(body.defaultIntervalMinutes)) ? Number(body.defaultIntervalMinutes) : undefined,
        });
        if (!item) return NextResponse.json({ success: false, error: "Item not found." }, { status: 404 });
        return NextResponse.json({ success: true, item });
      }
      const item = await updateSupplyLibraryItem(id, {
        name: typeof body.name === "string" ? body.name.trim() : undefined,
        unit: typeof body.unit === "string" ? body.unit.trim() : undefined,
        sortOrder: Number.isInteger(Number(body.sortOrder)) ? Number(body.sortOrder) : undefined,
        equipmentPartId: body.equipmentPartId !== undefined ? (body.equipmentPartId ? String(body.equipmentPartId).trim() : null) : undefined,
      });
      if (!item) return NextResponse.json({ success: false, error: "Item not found." }, { status: 404 });
      return NextResponse.json({ success: true, item });
    }

    if (action === "setActive") {
      const active = Boolean(body.active);
      if (type === "checklist") await setChecklistLibraryItemActive(id, active);
      else if (type === "round") await setRoundLibraryItemActive(id, active);
      else await setSupplyLibraryItemActive(id, active);
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ success: false, error: `Unknown action "${action}".` }, { status: 400 });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Failed to save library item." },
      { status: 500 }
    );
  }
}
