// Public path (see proxy.ts's PUBLIC_PATHS "/api/cron" entry) — self-gated
// on CRON_SECRET rather than an admin session, since Vercel Cron invokes
// this with no cookies at all (same self-checking-route pattern
// /api/subcontractor-portal already uses for its own reasons). Scheduled in
// vercel.json every 15 minutes. Phase 6: emails info@/crm@ once per site per
// (local) day when a configured night crew hasn't submitted its checklist
// by the site's cutoff time. Sheets touch: lookupAccountSummary via the
// sanctioned choke point, for the email's real account name only.
import { NextRequest, NextResponse } from "next/server";
import { findTeamHubSitesNeedingNightChecklistAlert, recordTeamHubChecklistAlertSent } from "@/lib/teamHubDb";
import { lookupAccountSummary } from "@/lib/teamHubAccountLookup";
import { sendInternalNotification } from "@/lib/email";

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ success: false, error: "Unauthorized." }, { status: 401 });
  }

  try {
    const alerts = await findTeamHubSitesNeedingNightChecklistAlert();
    let sent = 0;

    for (const { site, crew } of alerts) {
      const account = await lookupAccountSummary(site.accountId);
      const accountName = account?.accountName ?? site.accountId;

      await sendInternalNotification(`Team Hub: night checklist not done — ${site.label}`, [
        `${accountName} (${site.label}) — the ${crew.name} checklist has not been submitted yet.`,
        `Cutoff time: ${site.nightChecklistCutoffTime} (America/New_York).`,
        `Account Team Hub tab: /accounts/${site.accountId}?tab=team-hub`,
      ]);

      // Recorded even if the email send itself failed (sendInternalNotification
      // returns false rather than throwing when unconfigured) — this alert
      // is "once per site per day" by design, not "retry until it lands";
      // an admin can always check the account's Team Hub tab directly.
      await recordTeamHubChecklistAlertSent(site.id);
      sent += 1;
    }

    return NextResponse.json({ success: true, sent });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Cron run failed." },
      { status: 500 }
    );
  }
}
