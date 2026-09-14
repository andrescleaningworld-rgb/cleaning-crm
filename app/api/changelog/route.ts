import { NextResponse } from "next/server";
import { getRecentChangelogEntries } from "@/lib/googleSheets";

// Backs the "What's new" modal opened from VersionCheckBanner. Same
// resilience pattern as /api/portal/new-count: on any failure (missing
// "ChangeLog" tab, Sheets API hiccup, etc.) fall back to an empty list
// rather than surfacing an error — this is a nice-to-have, not something
// worth showing a crew member a failure message over.
export async function GET() {
  const entries = await getRecentChangelogEntries(3).catch(() => []);

  return NextResponse.json(
    { success: true, entries },
    {
      headers: {
        "Cache-Control": "public, max-age=60, stale-while-revalidate=300",
      },
    }
  );
}
