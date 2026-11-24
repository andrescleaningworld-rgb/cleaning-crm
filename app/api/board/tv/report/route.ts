// A TV whose board broke tells the server what went wrong, so it shows in the
// Vercel logs as "[board tv client error]". No login (proxy.ts: everything
// under "/api/board/tv" is public). Takes only the error message, a trimmed
// stack, the browser's name and version and the time (lib/tvErrorReport.ts
// scrubs them again here): never the page address, the TV's key or a token.
// Small reports only, and only a few: it is a courtesy, not a log anyone can fill.

import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/siteLinkRateLimit";
import { TV_REPORT_LIMITS, tvErrorReport } from "@/lib/tvErrorReport";

const noStore = { headers: { "Cache-Control": "no-store" } };

export async function POST(request: NextRequest) {
  try {
    const text = await request.text();
    if (text.length > TV_REPORT_LIMITS.body) return NextResponse.json({ success: false }, { status: 413, ...noStore });
    // 10 a minute from one place, 60 in 10 minutes from everyone. The address is only used for counting, never logged.
    const from = (request.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "unknown";
    const allowed = (await checkRateLimit(`tv-report:${from}`, 10, 60)) && (await checkRateLimit("tv-report:all", 60, 600));
    if (!allowed) return NextResponse.json({ success: false }, { status: 429, ...noStore });

    let body: Record<string, unknown> = {};
    try {
      body = JSON.parse(text) as Record<string, unknown>;
    } catch {
      return NextResponse.json({ success: false }, { status: 400, ...noStore });
    }
    console.error("[board tv client error]", JSON.stringify(tvErrorReport(body)));
    return NextResponse.json({ success: true }, noStore);
  } catch (error) {
    console.error("[board tv report]", error instanceof Error ? error.message : error);
    return NextResponse.json({ success: false }, { status: 500, ...noStore });
  }
}
