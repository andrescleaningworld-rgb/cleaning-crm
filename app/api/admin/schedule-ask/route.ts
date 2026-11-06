// Sub Center → Schedules to set (app/sub-center/schedule-ask.tsx): per sub,
// the Active accounts still with no schedule and how many they set, plus the
// office's own list (lib/pg/schedule-ask.ts). Staff only.

import { NextRequest, NextResponse } from "next/server";
import { getAdminIdentity } from "@/lib/adminSession";
import { scheduleAskProgress } from "@/lib/pg/schedule-ask";

export async function GET(request: NextRequest) {
  try {
    if (!(await getAdminIdentity(request))) return NextResponse.json({ success: false, error: "Log in first." }, { status: 401 });
    return NextResponse.json({ success: true, ...(await scheduleAskProgress()) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("[admin/schedule-ask GET]", error instanceof Error ? error.message : error);
    return NextResponse.json({ success: false, error: "The list did not load." }, { status: 500 });
  }
}
