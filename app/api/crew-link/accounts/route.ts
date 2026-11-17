// Admin (proxy.ts default admin gate). The CW Now page's account finder:
// every account with its CW Now (Crew Link) status, so a manager can search,
// open and share an account's checklist without going through the account
// page. Sheets: fetchAllMainAccounts (read-only, cached) for name / address /
// status / manager / "Checklist Needed". Everything else is Postgres.
//
// usage (lib/crewLinkPeople.ts CREW_USAGE):
//   notSetUp    no checklist with items (and no supply orders / problems)
//   notUsedYet  set up, the crew never sent a checklist
//   stopped     the last 2+ service days (the cleaning calendar's scheduled
//               days, lib/pg/cleanings.ts; Mon–Fri when the account has no
//               schedule) went by with no checklist
//   inUse       anything else that has been used
import { NextResponse } from "next/server";
import { fetchAllMainAccounts } from "@/lib/data/accounts";
import { getSql } from "@/lib/db";
import { addDays, officeDay } from "@/lib/cleanings";
import { listCleanings } from "@/lib/pg/cleanings";
import { crewSummaryByAccount } from "@/lib/pg/crew-link-people";
import { STOPPED_AFTER_MISSED_DAYS, type CrewUsage } from "@/lib/crewLinkPeople";

/** Days looked back for missed service days. */
const LOOK_BACK_DAYS = 21;

/** Mon–Fri between two office days (after `from`, before `to`): the fallback when an account has no schedule. */
function weekdaysBetween(from: string, to: string): number {
  let count = 0;
  for (let day = addDays(from, 1); day < to; day = addDays(day, 1)) {
    const weekday = new Date(`${day}T12:00:00Z`).getUTCDay();
    if (weekday >= 1 && weekday <= 5) count += 1;
  }
  return count;
}

export async function GET() {
  try {
    const sql = getSql();
    const today = officeDay();
    const [accounts, templates, tabs, lastSubmissions, crew, calendar] = await Promise.all([
      fetchAllMainAccounts(),
      sql`SELECT account_id, supply_orders_enabled, problem_reports_enabled FROM checklist_templates`,
      sql`
        SELECT account_id, COUNT(*)::int AS tab_count,
               COALESCE(SUM((SELECT COALESCE(SUM(jsonb_array_length(sec->'items')), 0) FROM jsonb_array_elements(sections_json) sec)), 0)::int AS item_count
        FROM checklist_tabs WHERE deleted_at IS NULL GROUP BY account_id
      `,
      sql`SELECT account_id, MAX(submitted_at) AS last_at FROM checklist_submissions GROUP BY account_id`,
      crewSummaryByAccount(),
      // The scheduled days before today (for "not used in 2+ service days"). The calendar failing only loses 🔴.
      listCleanings(addDays(today, -LOOK_BACK_DAYS), addDays(today, -1)).catch((error) => {
        console.error("[crew-link accounts] calendar:", error instanceof Error ? error.message : error);
        return null;
      }),
    ]);
    const templateBy = new Map(templates.map((t) => [t.account_id as string, t]));
    const tabsBy = new Map(tabs.map((t) => [t.account_id as string, t]));
    const lastBy = new Map(lastSubmissions.map((t) => [t.account_id as string, t.last_at]));
    const scheduledDays = new Map<string, string[]>();
    for (const cleaning of calendar?.cleanings ?? []) {
      if (cleaning.status === "extra" || cleaning.day >= today) continue;
      const list = scheduledDays.get(cleaning.accountId) ?? [];
      list.push(cleaning.day);
      scheduledDays.set(cleaning.accountId, list);
    }

    return NextResponse.json({
      success: true,
      accounts: accounts.map((a) => {
        const template = templateBy.get(a.accountId);
        const tab = tabsBy.get(a.accountId);
        const last = lastBy.get(a.accountId);
        const lastSubmittedAt = last ? (last instanceof Date ? last.toISOString() : String(last)) : null;
        const supplyOrders = template?.supply_orders_enabled === true;
        const problemReports = template?.problem_reports_enabled === true;
        const itemCount = Number(tab?.item_count ?? 0);
        const people = crew.get(a.accountId);

        let usage: CrewUsage;
        let missedDays = 0;
        if (!((a.checklistNeeded && itemCount > 0) || supplyOrders || problemReports)) usage = "notSetUp";
        else if (!lastSubmittedAt) usage = "notUsedYet";
        else {
          const lastDay = officeDay(lastSubmittedAt);
          const days = scheduledDays.get(a.accountId);
          missedDays = days ? new Set(days.filter((day) => day > lastDay)).size : weekdaysBetween(lastDay, today);
          usage = missedDays >= STOPPED_AFTER_MISSED_DAYS ? "stopped" : "inUse";
        }

        return {
          accountId: a.accountId,
          accountName: a.accountName,
          address: a.address,
          status: a.status,
          manager: (a.managerName ?? "").trim(),
          checklistNeeded: a.checklistNeeded,
          supplyOrders,
          problemReports,
          tabCount: Number(tab?.tab_count ?? 0),
          itemCount,
          lastSubmittedAt,
          usage,
          missedDays,
          crewCount: people?.people ?? 0,
          lastSentAt: people?.lastSentAt ?? "",
        };
      }),
    });
  } catch (error) {
    console.error("[crew-link accounts GET]", error);
    return NextResponse.json({ success: false, error: "Could not load accounts." }, { status: 500 });
  }
}
