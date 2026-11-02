// "Check Markate now" (the Pin Board's New accepted square, Settings -> Markate).
// Managers and the owner only: this path also falls through to proxy.ts's
// default admin gate, and the route checks the login itself.
//
// GET   when the last check ran, and whether one is running now
// POST  runs the same check the 30-minute cron runs (lib/pg/markate.ts
//       checkForEstimates), right now. One at a time: when a check is already
//       running it says so and starts nothing.
//       { lookupId? }  Settings only: one Markate estimate to look up too.

import { NextRequest, NextResponse } from "next/server";
import { getAdminIdentity } from "@/lib/adminSession";
import { checkForEstimates, markateReady, markateStatus, plainCheckError } from "@/lib/pg/markate";

// A check can wait on Markate's call limit; it stops itself after 4 minutes.
export const maxDuration = 300;

const noStore = { "Cache-Control": "no-store" };
const refuse = (error: string, status: number) => NextResponse.json({ success: false, error }, { status, headers: noStore });

async function allowed(request: NextRequest): Promise<boolean> {
  const identity = await getAdminIdentity(request);
  return identity?.role === "manager" || identity?.role === "owner";
}

export async function GET(request: NextRequest) {
  try {
    if (!(await allowed(request))) return refuse("Only managers and the owner can check Markate.", 403);
    if (!(await markateReady())) return NextResponse.json({ success: true, ready: false }, { headers: noStore });
    const status = await markateStatus();
    return NextResponse.json(
      { success: true, ready: true, connected: status.connected, checking: status.checking, lastCheckedAt: status.lastCheckedAt, lastError: plainCheckError(status.lastError.startsWith("Stopped at the time limit") ? "" : status.lastError) },
      { headers: noStore }
    );
  } catch (error) {
    console.error("[markate sync-now GET]", error instanceof Error ? error.message : error);
    return refuse("Could not load when Markate was last checked.", 500);
  }
}

export async function POST(request: NextRequest) {
  try {
    if (!(await allowed(request))) return refuse("Only managers and the owner can check Markate.", 403);
    if (!(await markateReady())) return refuse("Markate is not turned on here yet.", 409);
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const lookupId = String(body.lookupId ?? "").replace(/\D/g, "");
    const result = await checkForEstimates({ lookupId });
    if (result.busy) return refuse("Already checking, try again in a minute.", 409);
    const status = await markateStatus();
    return NextResponse.json(
      {
        success: true,
        summary: {
          added: result.addedList,
          skipped: result.skipped,
          error: plainCheckError(result.error),
          // Stopped at the time limit: what it found is saved; the next check goes on.
          partial: !result.error && !result.finished,
          lastCheckedAt: status.lastCheckedAt,
        },
        // Settings shows the full details as before.
        result,
      },
      { headers: noStore }
    );
  } catch (error) {
    console.error("[markate sync-now POST]", error instanceof Error ? error.message : error);
    return refuse("The Markate check failed. Try again.", 500);
  }
}
