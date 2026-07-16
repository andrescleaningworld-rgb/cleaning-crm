import { NextRequest, NextResponse } from "next/server";
import { appendSubSchedule, fetchSubSchedules } from "@/lib/googleSheets";
import { SCHEDULE_FREQUENCIES, type ScheduleFrequency } from "@/lib/scheduleRecurrence";

export async function GET() {
  try {
    const schedules = await fetchSubSchedules();
    return NextResponse.json({ schedules });
  } catch (err) {
    console.error("[subcontractor-schedules GET]", err);
    return NextResponse.json({ error: "Failed to load schedules" }, { status: 500 });
  }
}

type ScheduleEntry = { dayOfWeek?: string; timeWindow?: string; monthlyOccurrence?: string };

export async function POST(request: NextRequest) {
  let body: {
    accountId?: string;
    subId?: string;
    submittedBy?: string;
    frequency?: string;
    effectiveStart?: string;
    effectiveEnd?: string;
    entries?: ScheduleEntry[];
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const accountId = body.accountId?.trim() ?? "";
  const subId = body.subId?.trim() ?? "";
  const submittedBy = body.submittedBy?.trim() ?? "";
  const frequency = body.frequency?.trim() ?? "";
  const effectiveStart = body.effectiveStart?.trim() ?? "";
  const effectiveEnd = body.effectiveEnd?.trim() ?? "";
  const entries = Array.isArray(body.entries) ? body.entries : [];

  if (!accountId || !subId || !submittedBy) {
    return NextResponse.json({ error: "accountId, subId, and submittedBy are required" }, { status: 400 });
  }
  if (!SCHEDULE_FREQUENCIES.includes(frequency as ScheduleFrequency)) {
    return NextResponse.json(
      { error: "frequency must be one of WEEKLY, BIWEEKLY, MONTHLY_1X, MONTHLY_2X, AS_NEEDED" },
      { status: 400 }
    );
  }

  if (frequency === "WEEKLY" || frequency === "BIWEEKLY") {
    if (entries.length === 0) {
      return NextResponse.json({ error: "At least one day/time-window entry is required" }, { status: 400 });
    }
    for (const entry of entries) {
      if (!entry.dayOfWeek?.trim() || !entry.timeWindow?.trim()) {
        return NextResponse.json({ error: "Each entry needs a dayOfWeek and timeWindow" }, { status: 400 });
      }
    }
  } else if (frequency === "MONTHLY_1X" || frequency === "MONTHLY_2X") {
    const expected = frequency === "MONTHLY_1X" ? 1 : 2;
    if (entries.length !== expected) {
      return NextResponse.json(
        { error: `${frequency} requires exactly ${expected} occurrence entr${expected === 1 ? "y" : "ies"}` },
        { status: 400 }
      );
    }
    for (const entry of entries) {
      if (!entry.monthlyOccurrence?.trim() || !entry.timeWindow?.trim()) {
        return NextResponse.json({ error: "Each occurrence needs a week/weekday and a time window" }, { status: 400 });
      }
    }
  }
  // AS_NEEDED requires no entries.

  const recurring = frequency === "AS_NEEDED" ? "N" : "Y";
  const rowsToCreate: ScheduleEntry[] = frequency === "AS_NEEDED" ? [{}] : entries;

  try {
    const scheduleIds: string[] = [];
    for (const entry of rowsToCreate) {
      const id = await appendSubSchedule({
        accountId,
        subId,
        dayOfWeek: entry.dayOfWeek?.trim() ?? "",
        timeWindow: entry.timeWindow?.trim() ?? "",
        recurring,
        effectiveStart,
        effectiveEnd,
        status: "Active",
        submittedBy,
        frequency,
        monthlyOccurrence: entry.monthlyOccurrence?.trim() ?? "",
      });
      scheduleIds.push(id);
    }
    return NextResponse.json({ success: true, scheduleIds });
  } catch (err) {
    console.error("[subcontractor-schedules POST]", err);
    return NextResponse.json({ error: "Failed to save schedule" }, { status: 500 });
  }
}
