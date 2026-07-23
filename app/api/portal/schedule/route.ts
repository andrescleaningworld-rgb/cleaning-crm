import { NextResponse } from "next/server";
import { getIronSession } from "iron-session";
import { cookies } from "next/headers";
import { sessionOptions, type PortalSessionData } from "@/lib/portalSession";
import { fetchScheduleExceptions, fetchSubSchedules } from "@/lib/googleSheets";
import { isScheduleEffectivelyActive, todayISO } from "@/lib/scheduleRecurrence";

export async function GET() {
  const session = await getIronSession<PortalSessionData>(await cookies(), sessionOptions());
  if (!session.accountId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const accountId = session.accountId.trim();
  const today = new Date().toISOString().slice(0, 10);

  try {
    const [allSchedules, allExceptions] = await Promise.all([
      fetchSubSchedules(),
      fetchScheduleExceptions(),
    ]);

    const asOfToday = todayISO();
    const schedules = allSchedules
      .filter((s) => s.accountId.trim() === accountId && isScheduleEffectivelyActive(s, asOfToday))
      .map((s) => ({
        dayOfWeek: s.dayOfWeek,
        timeWindow: s.timeWindow,
        recurring: s.recurring,
      }));

    const exceptions = allExceptions
      .filter((e) => e.accountId.trim() === accountId && e.originalDate >= today)
      .map((e) => ({
        type: e.type,
        originalDate: e.originalDate,
        newDate: e.newDate,
        newTimeWindow: e.newTimeWindow,
        reason: e.reason,
      }));

    return NextResponse.json({ schedules, exceptions });
  } catch (err) {
    console.error("[portal/schedule GET]", err);
    return NextResponse.json({ error: "Failed to load schedule" }, { status: 500 });
  }
}
