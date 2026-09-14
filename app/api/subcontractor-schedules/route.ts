import { after, NextRequest, NextResponse } from "next/server";
import { appendSubSchedule, fetchSubSchedules } from "@/lib/googleSheets";
import { FREQUENCY_LABELS, SCHEDULE_FREQUENCIES, type ScheduleFrequency } from "@/lib/scheduleRecurrence";
import { sendSubcontractorNotification } from "@/lib/email";

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

// One line per entry, e.g. "Monday (Morning)" or "1st Tuesday (Evening)" —
// AS_NEEDED has no entries, so it isn't described here.
function describeEntries(frequency: string, entries: ScheduleEntry[]): string {
  if (frequency === "MONTHLY_1X" || frequency === "MONTHLY_2X") {
    return entries
      .map((e) => {
        const [position, weekday] = (e.monthlyOccurrence ?? "").split(":");
        return `${position || "-"} ${weekday || "-"} (${e.timeWindow || "-"})`;
      })
      .join(", ");
  }
  return entries.map((e) => `${e.dayOfWeek || "-"} (${e.timeWindow || "-"})`).join(", ");
}

export async function POST(request: NextRequest) {
  let body: {
    accountId?: string;
    accountName?: string;
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
  const accountName = body.accountName?.trim() ?? "";
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

    // Best-effort — runs after the response is already sent, so a slow/failed
    // send never delays or fails the schedule save. Same pattern as the
    // complaint-assignment notify in app/api/complaints/route.ts.
    after(async () => {
      try {
        if (!subId.includes("@")) {
          console.debug(`[email] skip new-schedule notify: SubID "${subId}" is not an email`);
          return;
        }
        await sendSubcontractorNotification(
          subId,
          `New Recurring Schedule - ${accountName || accountId}`,
          [
            `Account: ${accountName || accountId}`,
            `Frequency: ${FREQUENCY_LABELS[frequency] || frequency}`,
            frequency === "AS_NEEDED" ? null : `Schedule: ${describeEntries(frequency, rowsToCreate)}`,
            `Effective Start: ${effectiveStart || "-"}`,
          ].filter((line): line is string => line !== null)
        );
      } catch (error) {
        console.error("[email] new-schedule notify failed:", error instanceof Error ? error.message : error);
      }
    });

    return NextResponse.json({ success: true, scheduleIds });
  } catch (err) {
    console.error("[subcontractor-schedules POST]", err);
    return NextResponse.json({ error: "Failed to save schedule" }, { status: 500 });
  }
}
