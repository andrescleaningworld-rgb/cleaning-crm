// Every 15 minutes (vercel.json): CW Now shift-start texts and the morning
// "no checklist last night" pins (lib/pg/crew-shifts.ts). Vercel Cron calls it
// with CRON_SECRET (/api/cron is public in proxy.ts). One part failing never
// stops the other.

import { NextRequest, NextResponse } from "next/server";
import { boardReady } from "@/lib/pg/board";
import { runMissedPins, runShiftTexts } from "@/lib/pg/crew-shifts";

export const maxDuration = 120;

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }
  const origin = new URL(request.url).origin;
  const texts = await runShiftTexts(origin).catch((error) => {
    console.error("[cron shift texts]", error instanceof Error ? error.message : error);
    return null;
  });
  const missed = (await boardReady())
    ? await runMissedPins().catch((error) => {
        console.error("[cron missed checklists]", error instanceof Error ? error.message : error);
        return null;
      })
    : null;
  return NextResponse.json({ success: true, texts, missed });
}
