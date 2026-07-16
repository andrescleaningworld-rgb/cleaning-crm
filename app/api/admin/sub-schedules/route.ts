import { NextRequest, NextResponse } from "next/server";
import { applySchedulePatternChange, fetchSubSchedules, updateSubSchedule } from "@/lib/googleSheets";
import { SCHEDULE_FREQUENCIES, type ScheduleFrequency } from "@/lib/scheduleRecurrence";

export async function GET() {
  try {
    const schedules = await fetchSubSchedules();
    return NextResponse.json({ schedules });
  } catch (err) {
    console.error("[admin/sub-schedules GET]", err);
    return NextResponse.json({ error: "Failed to load schedules" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  let body: {
    sheetRow?: number;
    lastEditedBy?: string;
    fields?: Partial<{
      dayOfWeek: string;
      timeWindow: string;
      recurring: string;
      effectiveStart: string;
      effectiveEnd: string;
      status: string;
    }>;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const sheetRow = body.sheetRow;
  const lastEditedBy = body.lastEditedBy?.trim() ?? "";
  const fields = body.fields ?? {};

  if (!sheetRow || !lastEditedBy) {
    return NextResponse.json({ error: "sheetRow and lastEditedBy are required" }, { status: 400 });
  }

  try {
    await updateSubSchedule(sheetRow, {
      ...fields,
      lastEditedBy,
      lastEditedDate: new Date().toISOString(),
    });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[admin/sub-schedules PATCH]", err);
    return NextResponse.json({ error: "Failed to update schedule" }, { status: 500 });
  }
}

// Pattern changes (Frequency/DayOfWeek/MonthlyOccurrence/TimeWindow) are
// versioned rather than patched in place — see applySchedulePatternChange in
// lib/googleSheets.ts. Non-pattern edits (Status, a manual
// EffectiveStart/EffectiveEnd adjustment) keep using PATCH above.
export async function POST(request: NextRequest) {
  let body: {
    scheduleId?: string;
    lastEditedBy?: string;
    effectiveDate?: string;
    newPattern?: {
      dayOfWeek?: string;
      timeWindow?: string;
      frequency?: string;
      monthlyOccurrence?: string;
      status?: string;
    };
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const scheduleId = body.scheduleId?.trim() ?? "";
  const lastEditedBy = body.lastEditedBy?.trim() ?? "";
  const effectiveDate = body.effectiveDate?.trim() ?? "";
  const newPattern = body.newPattern;

  if (!scheduleId || !lastEditedBy || !effectiveDate || !newPattern) {
    return NextResponse.json(
      { error: "scheduleId, lastEditedBy, effectiveDate, and newPattern are required" },
      { status: 400 }
    );
  }

  const frequency = newPattern.frequency?.trim() ?? "";
  if (!SCHEDULE_FREQUENCIES.includes(frequency as ScheduleFrequency)) {
    return NextResponse.json(
      { error: "newPattern.frequency must be one of WEEKLY, BIWEEKLY, MONTHLY_1X, MONTHLY_2X, AS_NEEDED" },
      { status: 400 }
    );
  }
  if ((frequency === "WEEKLY" || frequency === "BIWEEKLY") && !newPattern.dayOfWeek?.trim()) {
    return NextResponse.json({ error: "newPattern.dayOfWeek is required for Weekly/Biweekly" }, { status: 400 });
  }
  if ((frequency === "MONTHLY_1X" || frequency === "MONTHLY_2X") && !newPattern.monthlyOccurrence?.trim()) {
    return NextResponse.json(
      { error: "newPattern.monthlyOccurrence is required for Monthly 1x/2x" },
      { status: 400 }
    );
  }
  if (frequency !== "AS_NEEDED" && !newPattern.timeWindow?.trim()) {
    return NextResponse.json({ error: "newPattern.timeWindow is required unless frequency is As Needed" }, { status: 400 });
  }

  try {
    const newScheduleId = await applySchedulePatternChange(
      scheduleId,
      {
        dayOfWeek: newPattern.dayOfWeek?.trim() ?? "",
        timeWindow: newPattern.timeWindow?.trim() ?? "",
        frequency,
        monthlyOccurrence: newPattern.monthlyOccurrence?.trim() ?? "",
        status: newPattern.status?.trim(),
      },
      effectiveDate,
      lastEditedBy
    );
    return NextResponse.json({ success: true, scheduleId: newScheduleId });
  } catch (err) {
    console.error("[admin/sub-schedules POST pattern change]", err);
    const message = err instanceof Error ? err.message : "Failed to apply schedule pattern change";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
