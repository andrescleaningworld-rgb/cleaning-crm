// Subcontractor portal — Crew Link / Team Hub checklists and problem
// reports for ONE of the signed-in sub's accounts. Read-only (GET only).
// proxy.ts leaves /api/subcontractor-portal public, so this route checks the
// sub_session itself (same pattern as ./equipment/route.ts) and then the one
// access rule in lib/subPortalChecklists.ts (Active SubSchedules row with
// this AccountID and SubID = the session email). Anything else → 403, with
// no hint about whether the account exists.
//   ?accountId=X                   → { checklists, problems }
//   ?accountId=X&submissionId=N    → Crew Link checklist, filled in
//   ?accountId=X&runId=N           → Team Hub run, filled in
import { NextRequest, NextResponse } from "next/server";
import { getIronSession } from "iron-session";
import { subSessionOptions, type SubSessionData } from "@/lib/subSession";
import {
  getCrewLinkChecklistDetail,
  getTeamHubRunDetail,
  listChecklistsForAccount,
  listProblemsForAccount,
  subCanSeeAccount,
} from "@/lib/subPortalChecklists";

export async function GET(request: NextRequest) {
  try {
    const session = await getIronSession<SubSessionData>(request, NextResponse.json({}), subSessionOptions());
    if (!session.subcontractorEmail) {
      return NextResponse.json({ success: false, error: "Not logged in." }, { status: 401 });
    }

    const params = new URL(request.url).searchParams;
    const accountId = params.get("accountId")?.trim() ?? "";
    if (!accountId || !(await subCanSeeAccount(session.subcontractorEmail, accountId))) {
      return NextResponse.json({ success: false, error: "Not available for this account." }, { status: 403 });
    }

    const submissionId = Number(params.get("submissionId"));
    const runId = Number(params.get("runId"));
    if (params.has("submissionId") || params.has("runId")) {
      const detail = params.has("submissionId")
        ? Number.isInteger(submissionId) ? await getCrewLinkChecklistDetail(accountId, submissionId) : null
        : Number.isInteger(runId) ? await getTeamHubRunDetail(accountId, runId) : null;
      if (!detail) return NextResponse.json({ success: false, error: "Checklist not found." }, { status: 404 });
      return NextResponse.json({ success: true, detail });
    }

    const [checklists, problems] = await Promise.all([listChecklistsForAccount(accountId), listProblemsForAccount(accountId)]);
    return NextResponse.json({ success: true, checklists, problems });
  } catch (error) {
    console.error("[subcontractor-portal/checklists GET]", error);
    return NextResponse.json({ success: false, error: "Could not load checklists." }, { status: 500 });
  }
}
