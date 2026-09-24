// Admin-only (proxy.ts default admin gate). The "visibility setup" backend
// — module toggles + library-item checkbox picker for one crew. Also
// serves the read-only libraries the picker renders against (Phase 0:
// read-only; full library editors are Phase 6). No Sheets reads in this
// file at all.
import { scheduleCrewTranslations } from "@/lib/crewTranslations";
import { NextRequest, NextResponse } from "next/server";
import {
  getTeamHubCrewModules,
  setTeamHubCrewModules,
  listTeamHubCrewItems,
  setTeamHubCrewItems,
  listChecklistLibrary,
  listRoundLibrary,
  listSupplyItemsLibrary,
  TEAM_HUB_MODULES,
  type SetCrewItemInput,
} from "@/lib/teamHubDb";

export async function GET(request: NextRequest) {
  try {
    const crewId = Number(new URL(request.url).searchParams.get("crewId"));
    if (!Number.isInteger(crewId)) {
      return NextResponse.json({ success: false, error: "A valid crewId is required." }, { status: 400 });
    }

    const [modules, crewItems, checklistLibrary, roundLibrary, supplyLibrary] = await Promise.all([
      getTeamHubCrewModules(crewId),
      listTeamHubCrewItems(crewId),
      listChecklistLibrary(true),
      listRoundLibrary(true),
      listSupplyItemsLibrary(true),
    ]);

    return NextResponse.json({
      success: true,
      modules,
      crewItems,
      libraries: { checklist: checklistLibrary, rounds: roundLibrary, supplies: supplyLibrary },
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Failed to load visibility setup." },
      { status: 500 }
    );
  }
}

async function handlePost(request: NextRequest) {
  try {
    const body = await request.json();
    const action = String(body.action ?? "");
    const crewId = Number(body.crewId);

    if (!Number.isInteger(crewId)) {
      return NextResponse.json({ success: false, error: "A valid crewId is required." }, { status: 400 });
    }

    if (action === "setModules") {
      const modules = body.modules && typeof body.modules === "object" ? body.modules : {};
      const validated: Partial<Record<(typeof TEAM_HUB_MODULES)[number], boolean>> = {};
      // Named moduleName, not module — see the matching comment in
      // lib/teamHubDb.ts for why.
      for (const moduleName of TEAM_HUB_MODULES) {
        if (typeof modules[moduleName] === "boolean") validated[moduleName] = modules[moduleName];
      }
      await setTeamHubCrewModules(crewId, validated);
      return NextResponse.json({ success: true });
    }

    if (action === "setCrewItems") {
      const rawItems = Array.isArray(body.items) ? body.items : [];
      const items: SetCrewItemInput[] = rawItems
        .filter(
          (i: unknown): i is Record<string, unknown> =>
            !!i && typeof i === "object" && ["checklist", "round", "supply"].includes((i as Record<string, unknown>).itemType as string)
        )
        .map((i: Record<string, unknown>, index: number) => ({
          itemType: i.itemType as SetCrewItemInput["itemType"],
          itemId: Number(i.itemId),
          enabled: Boolean(i.enabled),
          frequencyOverride: ["visit", "weekly", "monthly"].includes(i.frequencyOverride as string)
            ? (i.frequencyOverride as SetCrewItemInput["frequencyOverride"])
            : null,
          instanceLabel: typeof i.instanceLabel === "string" ? i.instanceLabel.trim() || null : null,
          sortOrder: Number.isInteger(Number(i.sortOrder)) ? Number(i.sortOrder) : index,
        }))
        .filter((i: SetCrewItemInput) => Number.isInteger(i.itemId));

      await setTeamHubCrewItems(crewId, items);
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ success: false, error: `Unknown action "${action}".` }, { status: 400 });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Failed to save visibility setup." },
      { status: 500 }
    );
  }
}

// Crew item labels changed → ES/PT for the new texts (after the response; lib/crewTranslations.ts).
export async function POST(request: NextRequest) {
  const response = await handlePost(request);
  if (response.ok) scheduleCrewTranslations();
  return response;
}
