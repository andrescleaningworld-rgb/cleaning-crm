import { NextResponse } from "next/server";
import { getPortalNewCount } from "@/lib/googleSheets";

// Exposes getPortalNewCount() (direct Sheets API, internally cached/timeout-
// bounded — see lib/googleSheets.ts) to the client so the "Portal" nav badge
// in CWHeader can fetch it after mount instead of the root layout awaiting it
// on every server render, which previously blocked every page (including
// /login) on this call.
export async function GET() {
  const newCount = await getPortalNewCount().catch(() => 0);

  return NextResponse.json(
    { success: true, newCount },
    {
      headers: {
        "Cache-Control": "public, max-age=30, stale-while-revalidate=60",
      },
    }
  );
}
