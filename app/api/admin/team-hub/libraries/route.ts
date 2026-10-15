// Admin-only (proxy.ts default admin gate). Phase 6: CRUD for the two
// company-wide crew libraries (hub_checklist_library, hub_round_library) —
// Phase 0 only read them. Supply items are the products on the Supplies page
// now (lib/pg/supply-list.ts), so they are not edited here. No delete: an item can be
// referenced by a live hub_crew_items row or past run history, so "remove"
// is always setActive(false), same convention every other Team Hub admin
// entity uses. No Sheets reads/writes in this file.
import { scheduleCrewTranslations } from "@/lib/crewTranslations";
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
} from "@/lib/teamHubDb";

type LibraryType = "checklist" | "round";

function isLibraryType(value: unknown): value is LibraryType {
  return value === "checklist" || value === "round";
}

export async function GET() {
  try {
    const [checklist, rounds] = await Promise.all([listChecklistLibrary(false), listRoundLibrary(false)]);
    return NextResponse.json({ success: true, checklist, rounds });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Failed to load libraries." },
      { status: 500 }
    );
  }
}

async function handlePost(request: NextRequest) {
  try {
    const body = await request.json();
    const type = body.type;
    if (!isLibraryType(type)) {
      return NextResponse.json({ success: false, error: 'type must be "checklist" or "round".' }, { status: 400 });
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
      const name = String(body.name ?? "").trim();
      const defaultIntervalMinutes = Number(body.defaultIntervalMinutes);
      if (!name || !Number.isInteger(defaultIntervalMinutes) || defaultIntervalMinutes <= 0) {
        return NextResponse.json({ success: false, error: "name and a positive defaultIntervalMinutes are required." }, { status: 400 });
      }
      const item = await createRoundLibraryItem({ name, defaultIntervalMinutes });
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
      const item = await updateRoundLibraryItem(id, {
        name: typeof body.name === "string" ? body.name.trim() : undefined,
        defaultIntervalMinutes: Number.isInteger(Number(body.defaultIntervalMinutes)) ? Number(body.defaultIntervalMinutes) : undefined,
      });
      if (!item) return NextResponse.json({ success: false, error: "Item not found." }, { status: 404 });
      return NextResponse.json({ success: true, item });
    }

    if (action === "setActive") {
      const active = Boolean(body.active);
      if (type === "checklist") await setChecklistLibraryItemActive(id, active);
      else await setRoundLibraryItemActive(id, active);
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

// Library items / rounds changed → ES/PT for the new texts (after the response; lib/crewTranslations.ts).
export async function POST(request: NextRequest) {
  const response = await handlePost(request);
  if (response.ok) scheduleCrewTranslations();
  return response;
}
