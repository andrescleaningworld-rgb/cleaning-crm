// The sub score alert: subs whose score dropped below 6 (who and why), and
// "Got it". Staff only (proxy.ts default gate, and the staff session is
// checked here). See lib/pg/sub-score-alerts.ts.
//   GET    looks at the scores (at most every 10 minutes) and lists the open alerts
//   POST   acknowledge: the alert leaves the list

import { NextRequest, NextResponse } from "next/server";
import { getAdminIdentity } from "@/lib/adminSession";
import { acknowledgeSubScoreAlert, checkSubScores, listSubScoreAlerts, subScoreAlertsReady } from "@/lib/pg/sub-score-alerts";

const refuse = (error: string, status = 400) => NextResponse.json({ success: false, error }, { status });
const noStore = { headers: { "Cache-Control": "no-store" } };

// The check reads every sub's score and can send a few emails.
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  try {
    if (!(await getAdminIdentity(request))) return refuse("Log in first.", 401);
    if (!(await subScoreAlertsReady())) return NextResponse.json({ success: true, on: false, alerts: [] }, noStore);
    // A check that fails must not hide the alerts already on the list.
    await checkSubScores().catch((error) => console.error("[sub score alerts] check failed:", error instanceof Error ? error.message : error));
    return NextResponse.json({ success: true, on: true, alerts: await listSubScoreAlerts() }, noStore);
  } catch (error) {
    console.error("[sub-score-alerts GET]", error instanceof Error ? error.message : error);
    return refuse("The alerts did not load.", 500);
  }
}

export async function POST(request: NextRequest) {
  try {
    const identity = await getAdminIdentity(request);
    if (!identity) return refuse("Log in first.", 401);
    if (!(await subScoreAlertsReady())) return refuse("This is not turned on here yet.", 409);
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    if (body.action !== "acknowledge") return refuse("Unknown action.");
    const id = Number(body.id);
    if (!Number.isInteger(id) || id <= 0) return refuse("Which alert?");
    await acknowledgeSubScoreAlert(id, String(identity.name ?? "").trim() || "Staff");
    return NextResponse.json({ success: true, alerts: await listSubScoreAlerts() });
  } catch (error) {
    console.error("[sub-score-alerts POST]", error instanceof Error ? error.message : error);
    return refuse("That did not save. Try again.", 500);
  }
}
