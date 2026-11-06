// Saves an account's schedule from the shared schedule form
// (app/components/schedule-editor.tsx): POST /api/admin/sub-schedules with
// action "replaceSchedule". Used by the account page, Add / Edit Account and
// Sub Center.
//
// Same table and same rules as every other schedule save: the new rows are
// added first (starting today, or the date picked), then the rows the form
// was showing are closed (Status "Superseded", ending the day before). So a
// failure half way leaves an extra row to tidy, never a lost schedule.
//
// Body: { accountId, accountName, subId (the sub's email, may be ""),
//         submittedBy, frequency, entries, closeScheduleIds, startDate,
//         keepOldUntilStart }
//
// keepOldUntilStart (the "Price & frequency change" form): the old rows stay
// Active and only get the day before as their end date, so every cleaning up
// to the change (past ones and the ones still to come before it) stays on the
// calendar exactly as it was. Without it the old rows are marked Superseded.

import { after, NextRequest, NextResponse } from "next/server";
import { appendSubSchedule, fetchSubSchedules, updateSubSchedule } from "@/lib/data/scheduling";
import { validateScheduleEntries, type ScheduleEntryInput } from "@/lib/scheduleRecurrence";
import { getAdminIdentity } from "@/lib/adminSession";
import { sendSubcontractorNotification } from "@/lib/email";
import { addDays, officeDay } from "@/lib/cleanings";
import { describeRows, type ScheduleRowLike } from "@/lib/schedule-plan";
import { getTimeOnSite, setTimeOnSiteByOffice, timeOnSiteReady } from "@/lib/pg/time-on-site";

const refuse = (error: string, status = 400) => NextResponse.json({ success: false, error }, { status });
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

// Whole weeks between the Mondays of two days; only odd/even matters.
function weeksApart(a: string, b: string): number {
  const monday = (day: string) => {
    const date = new Date(`${day}T00:00:00`);
    date.setDate(date.getDate() - ((date.getDay() + 6) % 7));
    return date.getTime();
  };
  return Math.round((monday(b) - monday(a)) / (7 * 24 * 60 * 60 * 1000));
}

function mostCommon(values: number[]): number | null {
  const counts = new Map<number, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  let best: number | null = null;
  let bestCount = 0;
  for (const [value, count] of counts) {
    if (count > bestCount) {
      best = value;
      bestCount = count;
    }
  }
  return best;
}

export async function replaceSchedule(request: NextRequest, body: Record<string, unknown>): Promise<NextResponse> {
  const identity = await getAdminIdentity(request);
  const text = (value: unknown) => (typeof value === "string" ? value.trim() : "");
  const accountId = text(body.accountId);
  const accountName = text(body.accountName);
  const subId = text(body.subId);
  const submittedBy = text(body.submittedBy) || String(identity?.name ?? "").trim() || "Staff";
  const frequency = text(body.frequency);
  const entries = (Array.isArray(body.entries) ? body.entries : []) as ScheduleEntryInput[];
  const closeIds = new Set((Array.isArray(body.closeScheduleIds) ? body.closeScheduleIds : []).map((id) => String(id).trim()).filter(Boolean));
  const asked = text(body.startDate);
  const keepOldUntilStart = body.keepOldUntilStart === true;

  if (!accountId) return refuse("Which account?");
  if (asked && !ISO_DAY.test(asked)) return refuse("The start date is not a date.");
  const problem = validateScheduleEntries(frequency, entries);
  if (problem) return refuse(problem);

  try {
    const all = await fetchSubSchedules();
    // Only this account's rows that are still running are closed.
    const closing = all.filter((row) => closeIds.has(row.scheduleId) && row.accountId.trim() === accountId && row.status.trim().toLowerCase() === "active");

    const today = officeDay();
    let start = asked && asked > today ? asked : today;
    // Every 2 weeks counts from the start date: keep the same weeks as before
    // by starting on the next "on" week when this one is an "off" week.
    const oldBiweekly = closing.find((row) => row.frequency === "BIWEEKLY" && ISO_DAY.test(row.effectiveStart));
    if (frequency === "BIWEEKLY" && oldBiweekly && weeksApart(oldBiweekly.effectiveStart, start) % 2 !== 0) {
      const date = new Date(`${start}T00:00:00`);
      start = addDays(start, 7 - ((date.getDay() + 6) % 7));
    }

    // A changed schedule keeps the end date the old one had; a brand-new
    // schedule has no end date (it runs until someone changes or stops it).
    const carried = closing.length > 0 ? (closing[0].storedEffectiveEnd ?? closing[0].effectiveEnd) : "";
    const end = carried && carried >= start ? carried : "";

    const asNeeded = frequency === "AS_NEEDED";
    const rows: ScheduleEntryInput[] = asNeeded ? [{}] : entries;
    const scheduleIds: string[] = [];
    for (const entry of rows) {
      scheduleIds.push(
        await appendSubSchedule({
          accountId,
          subId,
          dayOfWeek: entry.dayOfWeek?.trim() ?? "",
          timeWindow: entry.timeWindow?.trim() ?? "",
          recurring: asNeeded ? "N" : "Y",
          effectiveStart: asNeeded ? "" : start,
          effectiveEnd: asNeeded ? "" : end,
          status: "Active",
          submittedBy,
          submittedVia: "Admin",
          frequency,
          monthlyOccurrence: entry.monthlyOccurrence?.trim() ?? "",
          scheduleType: entry.scheduleType,
          startTime: entry.startTime?.trim(),
          windowStart: entry.windowStart?.trim(),
          windowEnd: entry.windowEnd?.trim(),
          minutesOnSite: typeof entry.minutesOnSite === "number" ? entry.minutesOnSite : null,
        })
      );
    }

    const dayBefore = addDays(start, -1);
    for (const row of closing) {
      // Kept running up to the change: Active, ending the day before (never later than its own end).
      const ownEnd = row.storedEffectiveEnd ?? row.effectiveEnd;
      const keepRunning = keepOldUntilStart && (!row.effectiveStart || row.effectiveStart <= dayBefore);
      await updateSubSchedule(row.sheetRow, {
        effectiveEnd: keepRunning && ownEnd && ownEnd < dayBefore ? ownEnd : dayBefore,
        status: keepRunning ? "Active" : "Superseded",
        lastEditedBy: submittedBy,
        lastEditedDate: new Date().toISOString(),
      });
    }

    // The account's own time on site follows the schedule's (the most used
    // one), so the account page and the sub portal say the same.
    const dayMinutes = entries.map((entry) => entry.minutesOnSite).filter((value): value is number => typeof value === "number" && value > 0);
    const common = mostCommon(dayMinutes);
    if (common !== null && (await timeOnSiteReady())) {
      try {
        const current = await getTimeOnSite(accountId);
        if (current && (current.minutes !== common || current.source === "est")) await setTimeOnSiteByOffice(accountId, common, submittedBy);
      } catch (error) {
        console.error("[schedule-save] time on site not updated:", error instanceof Error ? error.message : error);
      }
    }

    const summary = describeRows(
      rows.map(
        (entry): ScheduleRowLike => ({
          frequency,
          dayOfWeek: entry.dayOfWeek ?? "",
          monthlyOccurrence: entry.monthlyOccurrence ?? "",
          timeWindow: entry.timeWindow ?? "",
          scheduleType: entry.scheduleType,
          startTime: entry.startTime,
          windowStart: entry.windowStart,
          windowEnd: entry.windowEnd,
          minutesOnSite: entry.minutesOnSite ?? null,
        })
      )
    );

    // Best effort, after the answer is sent: the sub hears about it.
    after(async () => {
      try {
        if (!subId.includes("@")) return;
        const name = accountName || accountId;
        await sendSubcontractorNotification(
          subId,
          closing.length > 0 ? `Schedule Updated - ${name}` : `New Recurring Schedule Set Up For You - ${name}`,
          [`Account: ${name}`, `Schedule: ${summary}`, asNeeded ? null : `Starts: ${start}`, `Set up by: ${submittedBy}`, `Log into your portal to see it.`].filter(
            (line): line is string => line !== null
          )
        );
      } catch (error) {
        console.error("[email] schedule notify failed:", error instanceof Error ? error.message : error);
      }
    });

    return NextResponse.json({ success: true, scheduleIds, summary, startDate: asNeeded ? "" : start });
  } catch (error) {
    console.error("[schedule-save]", error instanceof Error ? error.message : error);
    return refuse("The schedule was not saved. Try again.", 500);
  }
}
