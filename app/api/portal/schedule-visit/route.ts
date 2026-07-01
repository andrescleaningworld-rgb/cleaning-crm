import { NextRequest, NextResponse } from "next/server";
import { appendSubSchedule, listPortalAccounts, updatePortalAccountFields } from "@/lib/googleSheets";

const VALID_WINDOWS = ["Morning", "Midday", "Afternoon", "Evening"] as const;

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const DAY_NAMES = [
  "Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday",
];

function formatLabel(date: string, timeWindow: string): string {
  const parts = date.split("-");
  const month = parseInt(parts[1], 10) - 1;
  const day = parseInt(parts[2], 10);
  return `${MONTH_NAMES[month]} ${day} - ${timeWindow}`;
}

function dayOfWeekFromDate(date: string): string {
  const [y, m, d] = date.split("-").map((n) => parseInt(n, 10));
  return DAY_NAMES[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
}

export async function POST(request: NextRequest) {
  try {
    let body: Record<string, unknown>;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    const accountName = typeof body.accountName === "string" ? body.accountName.trim() : "";
    const accountId   = typeof body.accountId   === "string" ? body.accountId.trim()   : "";
    const subEmail    = typeof body.subEmail    === "string" ? body.subEmail.trim()    : "";
    const subName     = typeof body.subName     === "string" ? body.subName.trim()     : "";
    const timeWindow  = typeof body.timeWindow  === "string" ? body.timeWindow.trim()  : "";

    // Accept either visitDates[] (new) or visitDate (legacy single)
    let visitDates: string[];
    if (Array.isArray(body.visitDates)) {
      visitDates = (body.visitDates as unknown[])
        .filter((d): d is string => typeof d === "string" && d.trim().length > 0)
        .map((d) => d.trim());
    } else if (typeof body.visitDate === "string" && body.visitDate.trim()) {
      visitDates = [body.visitDate.trim()];
    } else {
      visitDates = [];
    }

    if (!accountName || !accountId || !subEmail || !timeWindow || visitDates.length === 0) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    if (!(VALID_WINDOWS as readonly string[]).includes(timeWindow)) {
      return NextResponse.json({ error: "Invalid time window" }, { status: 400 });
    }

    const today = new Date().toISOString().slice(0, 10);
    const invalidDate = visitDates.find((d) => d <= today);
    if (invalidDate) {
      return NextResponse.json({ error: "All dates must be in the future" }, { status: 400 });
    }

    // Sort dates so the first one is earliest (for the label and effective range)
    const sortedDates = [...visitDates].sort();
    const effectiveStart = sortedDates[0];
    const effectiveEnd = sortedDates[sortedDates.length - 1];
    const scheduleLabel = formatLabel(effectiveStart, timeWindow);
    const submittedBy = subName || subEmail;

    // Write one recurring SubSchedules pattern row per distinct weekday implied
    // by the chosen dates (e.g. weekly = 1 row, twice-weekly = 2 rows).
    const distinctDays = Array.from(new Set(sortedDates.map(dayOfWeekFromDate)));

    const scheduleIds: string[] = [];
    for (const dayOfWeek of distinctDays) {
      const scheduleId = await appendSubSchedule({
        accountId,
        subId: subEmail,
        dayOfWeek,
        timeWindow,
        recurring: "Y",
        effectiveStart,
        effectiveEnd,
        status: "Active",
        submittedBy,
      });
      scheduleIds.push(scheduleId);
    }

    // Update Next Scheduled Service on the customer-portal sheet (first/earliest date).
    // Best-effort: the schedule rows above are already saved, so a failure here
    // shouldn't fail the whole request.
    try {
      const portalAccounts = await listPortalAccounts();
      const match = portalAccounts.find(
        (a) => a.accountName.trim().toLowerCase() === accountName.toLowerCase(),
      );

      if (match) {
        await updatePortalAccountFields(match.sheetRow, {
          nextScheduledService: scheduleLabel,
        });
      }
    } catch (sideEffectErr) {
      console.error(
        "[portal/schedule-visit] Failed to update Next Scheduled Service (non-fatal):",
        sideEffectErr,
      );
    }

    return NextResponse.json({ success: true, scheduleLabel, count: sortedDates.length, scheduleIds });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error ? err.stack : undefined;
    console.error("[portal/schedule-visit] Unhandled error:", { message, stack, raw: err });
    return NextResponse.json({ error: "Failed to save schedule" }, { status: 500 });
  }
}
