import { after, NextRequest, NextResponse } from "next/server";
import { appendSubSchedule, fetchSubSchedules, supersedeActiveSubSchedulesForSub } from "@/lib/data/scheduling";
import { FREQUENCY_LABELS, validateScheduleEntries } from "@/lib/scheduleRecurrence";
import { sendInternalNotification, sendSubcontractorNotification } from "@/lib/email";
import { describeRows } from "@/lib/schedule-plan";

export async function GET() {
  try {
    const schedules = await fetchSubSchedules();
    return NextResponse.json({ schedules });
  } catch (err) {
    console.error("[subcontractor-schedules GET]", err);
    return NextResponse.json({ error: "Failed to load schedules" }, { status: 500 });
  }
}

// The shared schedule form (app/components/schedule-editor.tsx) also sends
// the day's exact time or its own "between" times. Time on site is not taken
// from here: subs answer it on their Time on site page (office review rule).
type ScheduleEntry = {
  dayOfWeek?: string;
  timeWindow?: string;
  monthlyOccurrence?: string;
  scheduleType?: string;
  startTime?: string;
  windowStart?: string;
  windowEnd?: string;
};

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
  const validationError = validateScheduleEntries(frequency, entries);
  if (validationError) {
    return NextResponse.json({ error: validationError }, { status: 400 });
  }

  const recurring = frequency === "AS_NEEDED" ? "N" : "Y";
  const rowsToCreate: ScheduleEntry[] = frequency === "AS_NEEDED" ? [{}] : entries;

  try {
    // A sub can overwrite a prior schedule for this account (most notably
    // one an admin set up for them) — close out whatever's currently Active
    // for this exact account+sub pair before appending the new rows, or
    // this submission would just pile up as a second co-active schedule.
    // No-op when there's nothing to supersede (the normal first-time-
    // submission case).
    const superseded = await supersedeActiveSubSchedulesForSub(accountId, subId, submittedBy);

    // The same day (or monthly visit) as before.
    const sameDayBefore = (entry: ScheduleEntry) =>
      superseded.find(
        (row) => row.dayOfWeek === (entry.dayOfWeek?.trim() ?? "") && row.monthlyOccurrence === (entry.monthlyOccurrence?.trim() ?? "")
      );
    // An older portal page sends no times: a day sent back unchanged (same
    // day, same window) keeps the exact time the office set on it.
    const keptAppointment = (entry: ScheduleEntry) => {
      const before = sameDayBefore(entry);
      return before?.scheduleType === "appointment" && before.timeWindow === (entry.timeWindow?.trim() ?? "") ? before : undefined;
    };

    // No end date unless one is sent; a replaced schedule keeps its end date.
    const carriedEnd = superseded[0]?.effectiveEnd ?? "";
    const end = effectiveEnd || (frequency !== "AS_NEEDED" && carriedEnd && carriedEnd >= effectiveStart ? carriedEnd : "");

    const scheduleIds: string[] = [];
    for (const entry of rowsToCreate) {
      const kept = entry.scheduleType ? undefined : keptAppointment(entry);
      const id = await appendSubSchedule({
        accountId,
        subId,
        dayOfWeek: entry.dayOfWeek?.trim() ?? "",
        timeWindow: entry.timeWindow?.trim() ?? "",
        recurring,
        effectiveStart,
        effectiveEnd: end,
        status: "Active",
        submittedBy,
        submittedVia: "Sub Portal",
        frequency,
        monthlyOccurrence: entry.monthlyOccurrence?.trim() ?? "",
        scheduleType: entry.scheduleType ?? kept?.scheduleType,
        startTime: entry.startTime?.trim() || kept?.startTime,
        windowStart: entry.windowStart?.trim(),
        windowEnd: entry.windowEnd?.trim(),
        // The office's time on site for this day stays; subs do not set it here.
        minutesOnSite: sameDayBefore(entry)?.minutesOnSite ?? null,
      });
      scheduleIds.push(id);
    }

    const summary = describeRows(
      rowsToCreate.map((entry) => ({
        frequency,
        dayOfWeek: entry.dayOfWeek ?? "",
        monthlyOccurrence: entry.monthlyOccurrence ?? "",
        timeWindow: entry.timeWindow ?? "",
        scheduleType: entry.scheduleType,
        startTime: entry.startTime,
        windowStart: entry.windowStart,
        windowEnd: entry.windowEnd,
      }))
    );

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
            frequency === "AS_NEEDED" ? null : `Schedule: ${summary}`,
            `Effective Start: ${effectiveStart || "-"}`,
          ].filter((line): line is string => line !== null)
        );
      } catch (error) {
        console.error("[email] new-schedule notify failed:", error instanceof Error ? error.message : error);
      }
    });

    // Staff never see this happen otherwise — an admin-entered schedule
    // getting silently changed by the sub is worth knowing about. Only
    // fires when the schedule being replaced was admin-created; a sub
    // overwriting their own prior sub-submitted schedule doesn't notify
    // staff (nothing surprising there).
    const supersededAdminRows = superseded.filter((s) => s.submittedVia === "Admin");
    if (supersededAdminRows.length > 0) {
      const oldFrequency = supersededAdminRows[0].frequency;
      after(async () => {
        try {
          await sendInternalNotification(
            `Sub Changed an Admin-Created Schedule - ${accountName || accountId}`,
            [
              `Account: ${accountName || accountId}`,
              `Subcontractor: ${submittedBy} (${subId})`,
              `This schedule was originally set up by an admin and has now been changed by the subcontractor.`,
              `Previous: ${FREQUENCY_LABELS[oldFrequency] || oldFrequency} — ${describeEntries(oldFrequency, supersededAdminRows)}`,
              frequency === "AS_NEEDED"
                ? `New: ${FREQUENCY_LABELS[frequency] || frequency}`
                : `New: ${summary}`,
            ]
          );
        } catch (error) {
          console.error("[email] admin-schedule-overwritten notify failed:", error instanceof Error ? error.message : error);
        }
      });
    }

    return NextResponse.json({ success: true, scheduleIds });
  } catch (err) {
    console.error("[subcontractor-schedules POST]", err);
    return NextResponse.json({ error: "Failed to save schedule" }, { status: 500 });
  }
}
