// The Cleaning World Score for the Overview card (lib/pg/cw-score.ts).
// Staff only: behind the staff login in proxy.ts, and the staff session is
// checked here too. Subs and customers have no way in.

import { NextRequest, NextResponse } from "next/server";
import { getAdminIdentity } from "@/lib/adminSession";
import { getCwScore } from "@/lib/pg/cw-score";

export async function GET(request: NextRequest) {
  try {
    if (!(await getAdminIdentity(request))) return NextResponse.json({ success: false, error: "Log in first." }, { status: 401 });
    return NextResponse.json({ success: true, ...(await getCwScore()) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("[cw-score GET]", error instanceof Error ? error.message : error);
    return NextResponse.json({ success: false, error: "The score did not load." }, { status: 500 });
  }
}
