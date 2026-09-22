// Admin-only (proxy.ts default admin gate). Create/revoke/reactivate/
// regenerate-token crews for one site. No Sheets reads in this file —
// sub_id is stored as a plain id (direction 8), never resolved to a sub
// name here.
import { NextRequest, NextResponse } from "next/server";
import {
  listTeamHubCrewsForSite,
  createTeamHubCrew,
  setTeamHubCrewActive,
  regenerateTeamHubCrewToken,
} from "@/lib/teamHubDb";

export async function GET(request: NextRequest) {
  try {
    const siteId = Number(new URL(request.url).searchParams.get("siteId"));
    if (!Number.isInteger(siteId)) {
      return NextResponse.json({ success: false, error: "A valid siteId is required." }, { status: 400 });
    }

    const crews = await listTeamHubCrewsForSite(siteId);
    return NextResponse.json({ success: true, crews });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Failed to load crews." },
      { status: 500 }
    );
  }
}

const VALID_CREW_TYPES = new Set(["porter", "night", "other"]);
const VALID_CREW_KINDS = new Set(["sub", "inhouse"]);

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const action = String(body.action ?? "");

    if (action === "create") {
      const siteId = Number(body.siteId);
      const name = String(body.name ?? "").trim();
      const crewType = String(body.crewType ?? "");
      const crewKind = String(body.crewKind ?? "");
      const subId = body.subId ? String(body.subId).trim() : null;

      if (!Number.isInteger(siteId) || !name) {
        return NextResponse.json({ success: false, error: "siteId and name are required." }, { status: 400 });
      }
      if (!VALID_CREW_TYPES.has(crewType)) {
        return NextResponse.json({ success: false, error: "Invalid crewType." }, { status: 400 });
      }
      if (!VALID_CREW_KINDS.has(crewKind)) {
        return NextResponse.json({ success: false, error: "Invalid crewKind." }, { status: 400 });
      }
      if (crewKind === "sub" && !subId) {
        return NextResponse.json({ success: false, error: "subId is required for a sub crew." }, { status: 400 });
      }

      const crew = await createTeamHubCrew({
        siteId,
        name,
        crewType: crewType as "porter" | "night" | "other",
        crewKind: crewKind as "sub" | "inhouse",
        subId: crewKind === "sub" ? subId : null,
      });
      return NextResponse.json({ success: true, crew });
    }

    const id = Number(body.id);
    if (!Number.isInteger(id)) {
      return NextResponse.json({ success: false, error: "A valid id is required." }, { status: 400 });
    }

    if (action === "setActive") {
      const crew = await setTeamHubCrewActive(id, Boolean(body.active));
      if (!crew) return NextResponse.json({ success: false, error: "Crew not found." }, { status: 404 });
      return NextResponse.json({ success: true, crew });
    }

    if (action === "regenerateToken") {
      const crew = await regenerateTeamHubCrewToken(id);
      if (!crew) return NextResponse.json({ success: false, error: "Crew not found." }, { status: 404 });
      return NextResponse.json({ success: true, crew });
    }

    return NextResponse.json({ success: false, error: `Unknown action "${action}".` }, { status: 400 });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Failed to save crew." },
      { status: 500 }
    );
  }
}
