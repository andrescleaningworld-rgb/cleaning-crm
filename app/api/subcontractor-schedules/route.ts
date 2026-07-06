import { NextRequest, NextResponse } from "next/server";
import { appendSubSchedule, fetchSubSchedules } from "@/lib/googleSheets";

export async function GET() {
  try {
    const schedules = await fetchSubSchedules();
    return NextResponse.json({ schedules });
  } catch (err) {
    console.error("[subcontractor-schedules GET]", err);
    return NextResponse.json({ error: "Failed to load schedules" }, { status: 500 });
  }
}

type ScheduleEntry = { dayOfWeek?: string; timeWindow?: string };

export async function POST(request: NextRequest) {
  let body: {
    accountId?: string;
    subId?: string;
    submittedBy?: string;
    recurring?: string;
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
  const recurring = body.recurring?.trim() ?? "";
  const effectiveStart = body.effectiveStart?.trim() ?? "";
  const effectiveEnd = body.effectiveEnd?.trim() ?? "";
  const entries = Array.isArray(body.entries) ? body.entries : [];

  if (!accountId || !subId || !submittedBy) {
    return NextResponse.json({ error: "accountId, subId, and submittedBy are required" }, { status: 400 });
  }
  if (recurring !== "Y" && recurring !== "N") {
    return NextResponse.json({ error: "recurring must be 'Y' or 'N'" }, { status: 400 });
  }
  if (entries.length === 0) {
    return NextResponse.json({ error: "At least one day/time-window entry is required" }, { status: 400 });
  }
  for (const entry of entries) {
    if (!entry.dayOfWeek?.trim() || !entry.timeWindow?.trim()) {
      return NextResponse.json({ error: "Each entry needs a dayOfWeek and timeWindow" }, { status: 400 });
    }
  }

  try {
    const scheduleIds: string[] = [];
    for (const entry of entries) {
      const id = await appendSubSchedule({
        accountId,
        subId,
        dayOfWeek: entry.dayOfWeek!.trim(),
        timeWindow: entry.timeWindow!.trim(),
        recurring,
        effectiveStart,
        effectiveEnd,
        status: "Active",
        submittedBy,
      });
      scheduleIds.push(id);
    }
    return NextResponse.json({ success: true, scheduleIds });
  } catch (err) {
    console.error("[subcontractor-schedules POST]", err);
    return NextResponse.json({ error: "Failed to save schedule" }, { status: 500 });
  }
}
