// The sub portal's "Please set the schedule for these accounts" box
// (app/subcontractor-portal/schedule-ask.tsx): the logged-in sub's Active
// accounts with no schedule yet (lib/pg/schedule-ask.ts). Identity comes from
// the sub_session cookie, never from the page. Saving goes through
// POST /api/subcontractor-schedules, which checks the account is theirs.

import { filesJson } from "@/lib/files";
import { NextRequest } from "next/server";
import { getIronSession } from "iron-session";
import { subSessionOptions, type SubSessionData } from "@/lib/subSession";
import { listScheduleAskForSub } from "@/lib/pg/schedule-ask";

export async function GET(request: NextRequest) {
  try {
    const session = await getIronSession<SubSessionData>(request, filesJson({}), subSessionOptions());
    const email = session.subcontractorEmail?.trim() ?? "";
    if (!email) return filesJson({ success: false, error: "Not logged in." }, { status: 401 });
    const accounts = await listScheduleAskForSub(email);
    return filesJson(
      { success: true, subId: email, subName: session.subcontractorName?.trim() || email, accounts },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    console.error("[subcontractor-portal/schedule-ask GET]", error instanceof Error ? error.message : error);
    return filesJson({ success: false, error: "Your list did not load." }, { status: 500 });
  }
}
