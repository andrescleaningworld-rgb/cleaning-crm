// Birthday and first day of work for staff and managers (Settings -> Staff).
// They show on the board calendar and the TV as birthdays and work
// anniversaries. Staff only (proxy.ts default gate). Postgres only.
//   GET    every person's two dates, by Staff id
//   POST   save one person's dates (a blank date clears it)

import { NextRequest, NextResponse } from "next/server";
import { getAdminIdentity } from "@/lib/adminSession";
import { getStaffDates, officeEventsReady, setStaffDates } from "@/lib/pg/office-events";

const clean = (value: unknown) => String(value ?? "").trim();
const refuse = (error: string, status = 400) => NextResponse.json({ success: false, error }, { status });
const noStore = { headers: { "Cache-Control": "no-store" } };

export async function GET(request: NextRequest) {
  try {
    if (!(await getAdminIdentity(request))) return refuse("Log in first.", 401);
    if (!(await officeEventsReady())) return NextResponse.json({ success: true, on: false, dates: {} }, noStore);
    return NextResponse.json({ success: true, on: true, dates: await getStaffDates() }, noStore);
  } catch (error) {
    console.error("[staff-dates GET]", error instanceof Error ? error.message : error);
    return refuse("The dates did not load.", 500);
  }
}

export async function POST(request: NextRequest) {
  try {
    const identity = await getAdminIdentity(request);
    if (!identity) return refuse("Log in first.", 401);
    if (!(await officeEventsReady())) return refuse("This is not turned on here yet.", 409);
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const staffId = clean(body.staffId);
    if (!staffId) return refuse("staffId is required.");
    try {
      await setStaffDates({ staffId, birthday: clean(body.birthday), workStart: clean(body.workStart), by: clean(identity.name) || "Staff" });
    } catch (error) {
      return refuse(error instanceof Error ? error.message : "That did not save. Try again.");
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[staff-dates POST]", error instanceof Error ? error.message : error);
    return refuse("That did not save. Try again.", 500);
  }
}
