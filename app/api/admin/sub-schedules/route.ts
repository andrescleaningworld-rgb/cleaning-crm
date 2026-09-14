import { after, NextRequest, NextResponse } from "next/server";
import { applySchedulePatternChange, fetchSubSchedules, updateSubSchedule } from "@/lib/googleSheets";
import { FREQUENCY_LABELS, SCHEDULE_FREQUENCIES, type ScheduleFrequency } from "@/lib/scheduleRecurrence";
import { sendSubcontractorNotification } from "@/lib/email";

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

// e.g. "Monday (Morning)" or "1st Tuesday (Evening)" — mirrors describeEntries
// in app/api/subcontractor-schedules/route.ts, but for a single new pattern
// rather than a list of entries.
function describeNewPattern(newPattern: {
  dayOfWeek?: string;
  timeWindow?: string;
  frequency?: string;
  monthlyOccurrence?: string;
}): string {
  if (newPattern.frequency === "MONTHLY_1X" || newPattern.frequency === "MONTHLY_2X") {
    const [position, weekday] = (newPattern.monthlyOccurrence ?? "").split(":");
    return `${position || "-"} ${weekday || "-"} (${newPattern.timeWindow || "-"})`;
  }
  return `${newPattern.dayOfWeek || "-"} (${newPattern.timeWindow || "-"})`;
}

export async function POST(request: NextRequest) {
  let body: {
    scheduleId?: string;
    accountName?: string;
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
  const accountName = body.accountName?.trim() ?? "";
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
    const result = await applySchedulePatternChange(
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

    // Best-effort — runs after the response is already sent, so a slow/failed
    // send never delays or fails the schedule save. Same pattern as the
    // complaint-assignment notify in app/api/complaints/route.ts.
    after(async () => {
      try {
        if (!result.subId.includes("@")) {
          console.debug(`[email] skip schedule-change notify: SubID "${result.subId}" is not an email`);
          return;
        }
        await sendSubcontractorNotification(
          result.subId,
          `Schedule Updated - ${accountName || result.accountId}`,
          [
            `Account: ${accountName || result.accountId}`,
            `New Frequency: ${FREQUENCY_LABELS[frequency] || frequency}`,
            frequency === "AS_NEEDED" ? null : `New Schedule: ${describeNewPattern(newPattern)}`,
            `Effective Date: ${effectiveDate}`,
            `Updated By: ${lastEditedBy}`,
          ].filter((line): line is string => line !== null)
        );
      } catch (error) {
        console.error("[email] schedule-change notify failed:", error instanceof Error ? error.message : error);
      }
    });

    return NextResponse.json({ success: true, scheduleId: result.scheduleId });
  } catch (err) {
    console.error("[admin/sub-schedules POST pattern change]", err);
    const message = err instanceof Error ? err.message : "Failed to apply schedule pattern change";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
