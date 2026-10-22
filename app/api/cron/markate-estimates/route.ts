// Public path (proxy.ts PUBLIC_PATHS "/api/cron"): self-gated on CRON_SECRET
// like the other cron routes. Scheduled in vercel.json every 30 minutes.
// Looks in Markate for new accepted commercial estimates with a recurring line
// item (lib/pg/markate.ts checkForEstimates). Does nothing when Markate is not
// connected or migration 054 is not on this database.
import { NextRequest, NextResponse } from "next/server";
import { checkForEstimates, markateReady, markateStatus } from "@/lib/pg/markate";

// A check can wait on Markate's call limit; it stops itself after 4 minutes.
export const maxDuration = 300;

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ success: false, error: "Unauthorized." }, { status: 401 });
  }
  try {
    if (!(await markateReady())) return NextResponse.json({ success: true, skipped: "Markate tables are not on this database." });
    if (!(await markateStatus()).connected) return NextResponse.json({ success: true, skipped: "Markate is not connected." });
    const result = await checkForEstimates();
    if (result.error) console.error("[cron markate-estimates]", result.error);
    return NextResponse.json({ success: !result.error, result });
  } catch (error) {
    console.error("[cron markate-estimates]", error instanceof Error ? error.message : error);
    return NextResponse.json({ success: false, error: "The Markate check failed." }, { status: 500 });
  }
}
