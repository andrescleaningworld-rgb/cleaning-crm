// Admin-only (proxy.ts default admin gate). Orders + issues across every
// site link, with resolved account names for display, filterable by
// status, and status-update actions.
import { NextRequest, NextResponse } from "next/server";
import { listQueue, updateSupplyOrderStatus, updateSiteIssueStatus } from "@/lib/siteLinkDb";
import { getAccountSummariesByIds } from "@/lib/googleSheets";
import { getAdminIdentity } from "@/lib/adminSession";
import { logActivity } from "@/lib/activityLog";

export async function GET(request: NextRequest) {
  try {
    const status = new URL(request.url).searchParams.get("status") ?? undefined;
    const entries = await listQueue(status ? { status } : {});
    const accountMap = await getAccountSummariesByIds(entries.map((e) => e.accountId));

    const enriched = entries.map((entry) => ({
      ...entry,
      accountName: accountMap.get(entry.accountId)?.accountName ?? "(unknown account)",
    }));

    return NextResponse.json({ success: true, entries: enriched });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Failed to load queue." },
      { status: 500 }
    );
  }
}

const VALID_ORDER_STATUSES = new Set(["new", "ordered", "delivered", "cancelled"]);
const VALID_ISSUE_STATUSES = new Set(["open", "resolved"]);

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const kind = String(body.kind ?? "");
    const id = Number(body.id);
    const status = String(body.status ?? "");

    if (!Number.isInteger(id)) {
      return NextResponse.json({ success: false, error: "A valid id is required." }, { status: 400 });
    }

    if (kind === "order") {
      if (!VALID_ORDER_STATUSES.has(status)) {
        return NextResponse.json({ success: false, error: "Invalid order status." }, { status: 400 });
      }
      await updateSupplyOrderStatus(id, status);
    } else if (kind === "issue") {
      if (!VALID_ISSUE_STATUSES.has(status)) {
        return NextResponse.json({ success: false, error: "Invalid issue status." }, { status: 400 });
      }
      await updateSiteIssueStatus(id, status);
    } else {
      return NextResponse.json({ success: false, error: `Unknown kind "${kind}".` }, { status: 400 });
    }

    const actor = await getAdminIdentity(request);
    if (actor?.accountId) {
      await logActivity({
        actorAccountId: actor.accountId,
        actorRole: actor.role ?? "manager",
        actorName: actor.name || "",
        action: "update",
        entityType: kind === "order" ? "supply_order" : "site_issue",
        entityId: String(id),
        detail: status,
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Failed to update status." },
      { status: 500 }
    );
  }
}
