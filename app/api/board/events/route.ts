// The board calendar's other days: birthdays, work anniversaries, holidays,
// office closed, company events (lib/officeEvents.ts). Staff only (proxy.ts
// default gate). Postgres only; see lib/pg/office-events.ts.
//   GET ?from=&to=   the days in that range
//   POST add         a holiday, an office-closed day or a company event, by hand
//   POST remove      take a hand-added day off

import { NextRequest, NextResponse } from "next/server";
import { getAdminIdentity } from "@/lib/adminSession";
import { addDays, isDay, officeDay } from "@/lib/cleanings";
import { addOfficeEvent, listOfficeEvents, officeEventsReady, removeOfficeEvent } from "@/lib/pg/office-events";

const clean = (value: unknown) => String(value ?? "").trim();
const refuse = (error: string, status = 400) => NextResponse.json({ success: false, error }, { status });
const noStore = { headers: { "Cache-Control": "no-store" } };

export async function GET(request: NextRequest) {
  try {
    if (!(await getAdminIdentity(request))) return refuse("Log in first.", 401);
    if (!(await officeEventsReady())) return NextResponse.json({ success: true, on: false, events: [] }, noStore);
    const params = request.nextUrl.searchParams;
    const today = officeDay();
    const from = isDay(params.get("from") ?? "") ? (params.get("from") as string) : today;
    const asked = isDay(params.get("to") ?? "") ? (params.get("to") as string) : from;
    // At most a little over a year at a time.
    const to = asked < from ? from : asked > addDays(from, 400) ? addDays(from, 400) : asked;
    return NextResponse.json({ success: true, on: true, events: await listOfficeEvents(from, to) }, noStore);
  } catch (error) {
    console.error("[board events GET]", error instanceof Error ? error.message : error);
    return refuse("The calendar days did not load.", 500);
  }
}

export async function POST(request: NextRequest) {
  try {
    const identity = await getAdminIdentity(request);
    if (!identity) return refuse("Log in first.", 401);
    if (!(await officeEventsReady())) return refuse("This is not turned on here yet.", 409);
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const action = clean(body.action);

    if (action === "add") {
      try {
        await addOfficeEvent({ kind: clean(body.kind), title: clean(body.title), day: clean(body.day), yearly: body.yearly === true, by: clean(identity.name) || "Staff" });
      } catch (error) {
        return refuse(error instanceof Error ? error.message : "That did not save. Try again.");
      }
      return NextResponse.json({ success: true });
    }
    if (action === "remove") {
      return NextResponse.json({ success: true, removed: await removeOfficeEvent(clean(body.id)) });
    }
    return refuse("Unknown action.");
  } catch (error) {
    console.error("[board events POST]", error instanceof Error ? error.message : error);
    return refuse("That did not save. Try again.", 500);
  }
}
