// Public path (proxy.ts PUBLIC_PATHS "/api/cron") — self-gated on
// CRON_SECRET like /api/cron/team-hub-checklist-alerts. Scheduled in
// vercel.json for Mondays 13:00 UTC (9 AM EDT / 8 AM EST). Emails info@/crm@
// (sendInternalNotification, the existing path) a list of vehicle service
// items due soon (amber) or overdue (red); sends nothing when the list is
// empty. vehicle_digest_sent makes it once per week even if the cron is
// retried. ?dryRun=1 returns the email lines without sending or recording.
// Sheets touch: fetchStaff (read) for driver names, only when there's
// something to send.
import { NextRequest, NextResponse } from "next/server";
import { sendInternalNotification } from "@/lib/email";
import { fetchStaff } from "@/lib/googleSheets";
import { buildVehicleDigest } from "@/lib/vehicleDigest";
import { claimVehicleDigestWeek } from "@/lib/vehiclesDb";
import { TEAM_HUB_TIMEZONE, getDateStringInTimeZone, startOfWeekInTimeZone } from "@/lib/teamHubTimezone";

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ success: false, error: "Unauthorized." }, { status: 401 });
  }

  try {
    const dryRun = new URL(request.url).searchParams.get("dryRun") === "1";
    const now = new Date();
    const weekStart = getDateStringInTimeZone(startOfWeekInTimeZone(now, TEAM_HUB_TIMEZONE), TEAM_HUB_TIMEZONE);
    const groups = await buildVehicleDigest();
    const itemCount = groups.reduce((n, g) => n + g.due.length, 0);

    if (itemCount === 0) {
      if (!dryRun) await claimVehicleDigestWeek(weekStart, 0);
      return NextResponse.json({ success: true, sent: false, reason: "Nothing due." });
    }

    const staffName = new Map((await fetchStaff()).map((s) => [s.id, s.name]));
    const origin = new URL(request.url).origin;
    const lines: string[] = [
      `${itemCount} vehicle service item${itemCount === 1 ? "" : "s"} due soon or overdue (due soon = within 500 mi or 30 days).`,
      "",
    ];
    for (const group of groups) {
      const driver = group.driverStaffId ? staffName.get(group.driverStaffId) : null;
      lines.push(`${group.title}${driver ? ` — driver: ${driver}` : ""}`);
      for (const due of group.due) lines.push(`  ${due.level === "red" ? "OVERDUE" : "Due soon"}: ${due.text}`);
      lines.push(`  ${origin}/equipment/vehicles/${group.vehicleId}`, "");
    }
    const subject = `Vehicles: ${itemCount} service item${itemCount === 1 ? "" : "s"} due`;

    if (dryRun) return NextResponse.json({ success: true, dryRun: true, weekStart, subject, lines });

    if (!(await claimVehicleDigestWeek(weekStart, itemCount))) {
      return NextResponse.json({ success: true, sent: false, reason: "Already sent this week." });
    }
    const sent = await sendInternalNotification(subject, lines);
    return NextResponse.json({ success: true, sent, itemCount });
  } catch (error) {
    console.error("[cron vehicle-maintenance]", error);
    return NextResponse.json({ success: false, error: "Cron run failed." }, { status: 500 });
  }
}
