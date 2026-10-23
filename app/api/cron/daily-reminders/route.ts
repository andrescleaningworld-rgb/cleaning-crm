// The daily reminders (vercel.json, every morning): sub insurance, "At
// risk" papers, price reviews and the customer monthly check-in (sent from
// the 25th, only while it is switched on). Each
// part runs on its own: one failing never stops the others. Vercel Cron calls it with CRON_SECRET (the
// same self-check as the other crons; /api/cron is public in proxy.ts).

import { NextRequest, NextResponse } from "next/server";
import { runInsuranceChecks } from "@/lib/pg/sub-insurance";
import { refreshRiskPins } from "@/lib/pg/account-risk";
import { refreshPricePins } from "@/lib/pg/price-review";
import { runMonthlyCheckins } from "@/lib/pg/customer-checkin";

export const maxDuration = 300;

type Part = { name: string; run: (origin: string) => Promise<unknown> };

const PARTS: Part[] = [
  { name: "insurance", run: runInsuranceChecks },
  { name: "atRisk", run: () => refreshRiskPins() },
  { name: "priceReview", run: () => refreshPricePins() },
  { name: "checkin", run: runMonthlyCheckins },
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
