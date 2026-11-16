// The daily reminders (vercel.json, every morning): sub insurance, "At
// risk" papers, price reviews, the Pin Board status check, and the customer
// check-ins still queued from a send (someone pressed Send; more than 90 go
// over several days: nothing is ever sent here that nobody asked for). Each
// part runs on its own: one failing never stops the others. Vercel Cron calls it with CRON_SECRET (the
// same self-check as the other crons; /api/cron is public in proxy.ts).

import { NextRequest, NextResponse } from "next/server";
import { runInsuranceChecks, runSubInsuranceReminders } from "@/lib/pg/sub-insurance";
import { refreshRiskPins } from "@/lib/pg/account-risk";
import { refreshPricePins } from "@/lib/pg/price-review";
import { sendQueuedCheckins } from "@/lib/pg/customer-checkin";
import { runPinStatusChecks } from "@/lib/pg/pin-status";
import { saveCwScoreSnapshot } from "@/lib/pg/cw-score";

export const maxDuration = 300;

type Part = { name: string; run: (origin: string) => Promise<unknown> };

const PARTS: Part[] = [
  { name: "insurance", run: runInsuranceChecks },
  { name: "subInsuranceReminders", run: runSubInsuranceReminders },
  { name: "atRisk", run: () => refreshRiskPins() },
  { name: "priceReview", run: () => refreshPricePins() },
  // Pin Board: "Status needed" on pins with no update for 2 business days, and the ask by text and push (weekdays only).
  { name: "pinStatus", run: (origin) => runPinStatusChecks(origin) },
  // Overview: today's Cleaning World Score, for "since last month" (migration 073).
  { name: "cwScore", run: () => saveCwScoreSnapshot() },
  // Last: it can take a couple of minutes (90 emails half a second apart), and stops in time; what is left stays queued.
  { name: "checkinQueue", run: (origin) => sendQueuedCheckins(origin, 150_000) },
];

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }
  const origin = request.nextUrl.origin;
  const results: Record<string, unknown> = {};
  for (const part of PARTS) {
    try {
      results[part.name] = await part.run(origin);
    } catch (error) {
      console.error(`[daily-reminders] ${part.name}:`, error instanceof Error ? error.message : error);
      results[part.name] = { error: error instanceof Error ? error.message : "failed" };
    }
  }
  return NextResponse.json({ success: true, results });
}
