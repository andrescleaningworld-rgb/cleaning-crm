// Cleaning calendar API (/board/calendar). Staff only (proxy.ts default
// gate). Postgres only; see lib/pg/cleanings.ts.

import { NextRequest, NextResponse } from "next/server";
import { getAdminIdentity } from "@/lib/adminSession";
import { addDays, isDay, officeDay } from "@/lib/cleanings";
import { boardReady } from "@/lib/pg/board";
import { listCleanings, markCleaning, pinMissedCleaning } from "@/lib/pg/cleanings";

const clean = (value: unknown) => String(value ?? "").trim();
const refuse = (error: string, status = 400) => NextResponse.json({ success: false, error }, { status });
const noStore = { headers: { "Cache-Control": "no-store" } };

export async function GET(request: NextRequest) {
  try {
    if (!(await boardReady())) return NextResponse.json({ success: true, ready: false }, noStore);
    const params = request.nextUrl.searchParams;
    const today = officeDay();
    const from = isDay(params.get("from") ?? "") ? (params.get("from") as string) : today;
    const asked = isDay(params.get("to") ?? "") ? (params.get("to") as string) : from;
    const to = asked < from ? from : asked;
    return NextResponse.json({ success: true, ready: true, ...(await listCleanings(from, to)) }, noStore);
  } catch (error) {
    console.error("[board calendar GET]", error instanceof Error ? error.message : error);
    return refuse("The calendar did not load.", 500);
  }
}

export async function POST(request: NextRequest) {
  try {
    if (!(await boardReady())) return refuse("The Pin Board is not turned on here yet.", 409);
    const identity = await getAdminIdentity(request);
    if (!identity) return refuse("Log in first.", 401);
    const by = clean(identity.name) || "Staff";
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const action = clean(body.action);
    const accountId = clean(body.accountId);
    const day = clean(body.day);
    if (!accountId || !isDay(day)) return refuse("accountId and day are required.");

    // A manager's own answer for one account on one day.
    if (action === "mark") {
      const mark = clean(body.mark);
      if (mark !== "cleaned" && mark !== "missed" && mark !== "") return refuse("mark must be cleaned, missed or empty.");
      // Nobody can know today whether next week's cleaning happened.
      if (mark !== "" && day > addDays(officeDay(), 0)) return refuse("That day has not come yet.");
      await markCleaning({ accountId, day, mark, by });
      return NextResponse.json({ success: true });
    }

    // One tap: a missed cleaning goes up on the board as a to-do.
    if (action === "pinMissed") {
      const pinned = await pinMissedCleaning({ accountId, day, by });
      return NextResponse.json({ success: true, pinned });
    }

    return refuse("Unknown action.");
  } catch (error) {
    console.error("[board calendar POST]", error instanceof Error ? error.message : error);
    return refuse("That did not save. Try again.", 500);
  }
}
