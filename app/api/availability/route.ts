// Coverage → "Who's free?". Staff only (proxy.ts default gate, and the staff
// session is checked here). See lib/availability.ts for the rules.
//   GET  ?settings=1[&subId=…]                       Evening's end (and a sub's crews)
//   POST { action: "check", days: ["Monday", …], start: "19:00", minutes: 90,
//          point?: { lat, lng }, points?: { [accountId]: [lat, lng] } }
//        Free / Tight / Busy for each day. points are the map's positions
//        (the same ones "Find closest subcontractors" uses). With a point:
//        only subs within 10 mi, else the 5 closest (within: false).
//        Coverage and Add Account both ask here.
//   POST { action: "crews", subId, crews }           the office sets a sub's crews
//   POST { action: "eveningEnds", time: "23:00" }    the office sets when Evening ends

import { NextRequest, NextResponse } from "next/server";
import { getAdminIdentity } from "@/lib/adminSession";
import { checkAll, nearbyAvailable, WEEK_ORDER, type Point } from "@/lib/availability";
import { dayToDate, officeDay } from "@/lib/cleanings";
import { getCrews, getEveningEnds, loadAvailabilitySubs, saveCrews, saveEveningEnds } from "@/lib/pg/availability";
import { parseClock, toClock } from "@/lib/schedule-time";
import { clampMinutesOnSite } from "@/lib/time-on-site";

const refuse = (error: string, status = 400) => NextResponse.json({ success: false, error }, { status });
const noStore = { headers: { "Cache-Control": "no-store" } };
// Before migration 042: no crews column or settings table yet.
const notYet = (error: unknown) => ["42703", "42P01"].includes((error as { code?: string }).code ?? "");

export async function GET(request: NextRequest) {
  try {
    if (!(await getAdminIdentity(request))) return refuse("Log in first.", 401);
    const params = request.nextUrl.searchParams;

    const subId = (params.get("subId") ?? "").trim();
    const eveningEnds = await getEveningEnds();
    return NextResponse.json({ success: true, eveningEnds: toClock(eveningEnds), crews: subId ? await getCrews(subId) : null }, noStore);
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

    if (body.action === "check") {
      const days = Array.isArray(body.days) ? WEEK_ORDER.filter((day) => (body.days as unknown[]).includes(day)) : [];
      const start = parseClock(body.start);
      const minutes = Number(body.minutes);
      if (days.length === 0) return refuse("Which days?");
      if (start === null) return refuse("What time?");
      if (!Number.isFinite(minutes) || minutes <= 0) return refuse("How long?");
      const point = toPoint(body.point);
      const points = toPoints(body.points);
      const [subs, eveningEnds] = await Promise.all([loadAvailabilitySubs(), getEveningEnds()]);
      // accountId: the account being edited, left out of "nearest account" (its own sub would be 0 mi away).
      const excludeAccountId = typeof body.accountId === "string" ? body.accountId.trim() : "";
      const all = checkAll(subs, { days, start, minutes: clampMinutesOnSite(minutes), point, excludeAccountId }, dayToDate(officeDay()), eveningEnds, points);
      // With an address: only the nearby subs (lib/availability.ts nearbyAvailable).
      // Without one there are no miles, so every sub is listed as before.
      const nearby = point ? nearbyAvailable(all) : null;
      return NextResponse.json(
        { success: true, eveningEnds: toClock(eveningEnds), results: nearby ? nearby.subs : all, within: nearby ? nearby.within : null },
        noStore
      );
    }

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

function toPoint(value: unknown): Point | null {
  const point = value as { lat?: unknown; lng?: unknown } | null;
  const lat = Number(point?.lat);
  const lng = Number(point?.lng);
  return point && Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
}

// { [accountId]: [lat, lng] } from the map. Not sent: the saved positions are used.
function toPoints(value: unknown): Map<string, Point> | undefined {
  if (!value || typeof value !== "object") return undefined;
  const points = new Map<string, Point>();
  for (const [accountId, pair] of Object.entries(value as Record<string, unknown>)) {
    if (!Array.isArray(pair)) continue;
    const point = toPoint({ lat: pair[0], lng: pair[1] });
    if (point) points.set(accountId, point);
  }
  return points;
}
