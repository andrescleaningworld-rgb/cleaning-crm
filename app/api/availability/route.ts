// Coverage → "Who's free?". Staff only (proxy.ts default gate, and the staff
// session is checked here). See lib/availability.ts for the rules.
//   GET  ?weekday=Tuesday&start=19:00&minutes=90[&lat=…&lng=…]   every sub: Free / Tight / Busy
//   GET  ?settings=1[&subId=…]                                    Evening's end (and a sub's crews)
//   POST { action: "crews", subId, crews }                        the office sets a sub's crews
//   POST { action: "eveningEnds", time: "23:00" }                 the office sets when Evening ends

import { NextRequest, NextResponse } from "next/server";
import { getAdminIdentity } from "@/lib/adminSession";
import { checkAll } from "@/lib/availability";
import { dayToDate, officeDay } from "@/lib/cleanings";
import { getCrews, getEveningEnds, loadAvailabilitySubs, saveCrews, saveEveningEnds } from "@/lib/pg/availability";
import { parseClock, toClock } from "@/lib/schedule-time";
import { clampMinutesOnSite } from "@/lib/time-on-site";

const refuse = (error: string, status = 400) => NextResponse.json({ success: false, error }, { status });
const noStore = { headers: { "Cache-Control": "no-store" } };
const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
// Before migration 042: no crews column or settings table yet.
const notYet = (error: unknown) => ["42703", "42P01"].includes((error as { code?: string }).code ?? "");

export async function GET(request: NextRequest) {
  try {
    if (!(await getAdminIdentity(request))) return refuse("Log in first.", 401);
    const params = request.nextUrl.searchParams;

    if (params.get("settings") === "1") {
      const subId = (params.get("subId") ?? "").trim();
      const eveningEnds = await getEveningEnds();
      return NextResponse.json({ success: true, eveningEnds: toClock(eveningEnds), crews: subId ? await getCrews(subId) : null }, noStore);
    }

    const weekday = params.get("weekday") ?? "";
    const start = parseClock(params.get("start"));
    const minutes = Number(params.get("minutes"));
    if (!WEEKDAYS.includes(weekday)) return refuse("Which day?");
    if (start === null) return refuse("What time?");
    if (!Number.isFinite(minutes) || minutes <= 0) return refuse("How long?");
    const lat = Number(params.get("lat"));
    const lng = Number(params.get("lng"));
    const point = params.get("lat") && params.get("lng") && Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;

    const [subs, eveningEnds] = await Promise.all([loadAvailabilitySubs(), getEveningEnds()]);
    const results = checkAll(subs, { weekday, start, minutes: clampMinutesOnSite(minutes), point }, dayToDate(officeDay()), eveningEnds);
    return NextResponse.json({ success: true, eveningEnds: toClock(eveningEnds), results }, noStore);
  } catch (error) {
    console.error("[availability GET]", error instanceof Error ? error.message : error);
    return refuse("Availability did not load.", 500);
  }
}

export async function POST(request: NextRequest) {
  try {
    const identity = await getAdminIdentity(request);
    if (!identity) return refuse("Log in first.", 401);
    const by = String(identity.name ?? "").trim() || "Staff";
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;

    if (body.action === "crews") {
      const subId = String(body.subId ?? "").trim();
      const crews = Number(body.crews);
      if (!subId) return refuse("Which sub?");
      if (!Number.isFinite(crews)) return refuse("How many crews?");
      const saved = await saveCrews(subId, crews);
      if (saved === null) return refuse("That sub was not found.", 404);
      return NextResponse.json({ success: true, crews: saved });
    }

    if (body.action === "eveningEnds") {
      const time = parseClock(body.time);
      if (time === null) return refuse("What time?");
      return NextResponse.json({ success: true, eveningEnds: toClock(await saveEveningEnds(time, by)) });
    }

    return refuse("Unknown action.");
  } catch (error) {
    if (notYet(error)) return refuse("This is not turned on here yet.", 409);
    console.error("[availability POST]", error instanceof Error ? error.message : error);
    return refuse("Not saved.", 500);
  }
}
