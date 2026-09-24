// Admin (proxy.ts default admin gate). The Crew Link page's account finder:
// every account with its Crew Link status, so a manager can search, open and
// share an account's checklist without going through the account page.
// Sheets: fetchAllMainAccounts (read-only, cached) for name / address /
// status / "Checklist Needed". Everything else is Postgres.
import { NextResponse } from "next/server";
import { fetchAllMainAccounts } from "@/lib/googleSheets";
import { getSql } from "@/lib/db";

export async function GET() {
  try {
    const sql = getSql();
    const [accounts, templates, tabs, lastSubmissions] = await Promise.all([
      fetchAllMainAccounts(),
      sql`SELECT account_id, supply_orders_enabled, problem_reports_enabled FROM checklist_templates`,
      sql`
        SELECT account_id, COUNT(*)::int AS tab_count,
               COALESCE(SUM((SELECT COALESCE(SUM(jsonb_array_length(sec->'items')), 0) FROM jsonb_array_elements(sections_json) sec)), 0)::int AS item_count
        FROM checklist_tabs WHERE deleted_at IS NULL GROUP BY account_id
      `,
      sql`SELECT account_id, MAX(submitted_at) AS last_at FROM checklist_submissions GROUP BY account_id`,
    ]);
    const templateBy = new Map(templates.map((t) => [t.account_id as string, t]));
    const tabsBy = new Map(tabs.map((t) => [t.account_id as string, t]));
    const lastBy = new Map(lastSubmissions.map((t) => [t.account_id as string, t.last_at]));

    return NextResponse.json({
      success: true,
      accounts: accounts.map((a) => {
        const template = templateBy.get(a.accountId);
        const tab = tabsBy.get(a.accountId);
        const last = lastBy.get(a.accountId);
        return {
          accountId: a.accountId,
          accountName: a.accountName,
          address: a.address,
          status: a.status,
          checklistNeeded: a.checklistNeeded,
          supplyOrders: template?.supply_orders_enabled === true,
          problemReports: template?.problem_reports_enabled === true,
          tabCount: Number(tab?.tab_count ?? 0),
          itemCount: Number(tab?.item_count ?? 0),
          lastSubmittedAt: last ? (last instanceof Date ? last.toISOString() : String(last)) : null,
        };
      }),
    });
  } catch (error) {
    console.error("[crew-link accounts GET]", error);
    return NextResponse.json({ success: false, error: "Could not load accounts." }, { status: 500 });
  }
}
