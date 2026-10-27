// Admin-gated by the default proxy.ts cookie check. Porters never reach this
// route at all (their surface is app/api/porter-checklist/route.ts, which is
// public and has no read-list capability).
// The office "Submitted" page: checklists and Crew Link supply requests.
import { NextRequest, NextResponse } from "next/server";
import { fetchAllMainAccounts } from "@/lib/data/accounts";
import { getSubmissionDetail, listSubmissions } from "@/lib/checklistDb";
import { listCrewLinkSupplyOrders } from "@/lib/teamHubDb";
import { getSql } from "@/lib/db";

export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const accountId = url.searchParams.get("accountId")?.trim() || undefined;
    const detailId = url.searchParams.get("id");

    if (detailId) {
      const detail = await getSubmissionDetail(Number(detailId));
      if (!detail) {
        return NextResponse.json({ success: false, error: "Submission not found." }, { status: 404 });
      }
      return NextResponse.json({ success: true, detail });
    }

    const sql = getSql();
    const [submissions, orders, accounts, supplyEnabled] = await Promise.all([
      listSubmissions(accountId),
      listCrewLinkSupplyOrders(accountId),
      fetchAllMainAccounts(),
      sql`SELECT account_id FROM checklist_templates WHERE supply_orders_enabled = true`,
    ]);
    const supplyIds = new Set(supplyEnabled.map((r) => r.account_id as string));
    const nameById = new Map(accounts.map((a) => [a.accountId, a.accountName]));
    // The dropdown: accounts with a checklist or supplies set up, plus any
    // account that already has a supply request (switched off since).
    const orderAccountIds = new Set(orders.map((o) => o.crewLinkAccountId ?? ""));
    const flaggedAccounts = accounts
      .filter((a) => a.checklistNeeded || supplyIds.has(a.accountId) || orderAccountIds.has(a.accountId))
      .map((a) => ({ accountId: a.accountId, accountName: a.accountName }));

    const supplyRequests = orders.map((o) => {
      const id = o.crewLinkAccountId ?? "";
      return {
        id: o.id,
        accountId: id,
        accountName: nameById.get(id) || id,
        reporterName: o.reporterName || o.workerFirstName || "",
        status: o.status,
        note: o.note,
        noteEnglish: o.noteEnglish,
        otherItems: o.otherItems,
        createdAt: o.createdAt,
        lines: o.lines.map((l) => ({ itemName: l.itemName, unit: l.unit, qty: l.qty })),
      };
    });

    return NextResponse.json({ success: true, submissions, supplyRequests, flaggedAccounts });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Failed to load submissions." },
      { status: 500 }
    );
  }
}
