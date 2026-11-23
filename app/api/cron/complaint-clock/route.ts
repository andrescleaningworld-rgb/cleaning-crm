// Every 15 minutes (vercel.json): an open complaint that has waited past the
// red business hours with no answer texts and pushes its assigned manager,
// once (lib/pg/complaint-response.ts). Vercel Cron calls it with CRON_SECRET
// (/api/cron is public in proxy.ts).

import { NextRequest, NextResponse } from "next/server";
import { runResponseClock } from "@/lib/pg/complaint-response";
import { runPromiseLateChecks } from "@/lib/pg/complaint-promise";

export const maxDuration = 120;

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }
  try {
    const origin = new URL(request.url).origin;
    const result = await runResponseClock(origin);
    // A promised date that passed. Its own failure never stops the clock check.
    const promises = await runPromiseLateChecks(origin).catch((error) => {
      console.error("[cron complaint-clock] promised dates:", error instanceof Error ? error.message : error);
      return null;
    });
    return NextResponse.json({ success: true, result, promises });
  } catch (error) {
    console.error("[cron complaint-clock]", error instanceof Error ? error.message : error);
    return NextResponse.json({ success: false, error: "The clock check did not run." }, { status: 500 });
  }
}
