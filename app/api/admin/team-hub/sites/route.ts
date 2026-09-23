// Admin-only (proxy.ts's default admin gate — this path isn't in
// PUBLIC_PATHS/SUB_PATHS/SUB_OR_ADMIN_PATHS). Create/deactivate/edit a
// hub_sites row for one account. Sheets touch: createTeamHubSite (via
// lib/teamHubDb.ts) validates the account exists through
// lib/teamHubAccountLookup.ts's lookupAccountSummary — the only Sheets read
// in this file, and indirect (it's inside lib/teamHubDb.ts, not called
// directly here).
import { NextRequest, NextResponse } from "next/server";
import { getTeamHubSiteByAccountId, createTeamHubSite, updateTeamHubSite, setTeamHubSiteActive } from "@/lib/teamHubDb";
import { lookupAssignedSubForAccount } from "@/lib/teamHubAccountLookup";

// Simplicity-pass addition: assignedSub rides along on the same GET the
// admin tab already calls on load (accountId is already the query param),
// rather than a separate round trip — see lookupAssignedSubForAccount's
// comment for what "matched" vs "unmatched" means.
export async function GET(request: NextRequest) {
  try {
    const accountId = new URL(request.url).searchParams.get("accountId")?.trim();
    if (!accountId) {
      return NextResponse.json({ success: false, error: "accountId is required." }, { status: 400 });
    }

    const [site, assignedSub] = await Promise.all([getTeamHubSiteByAccountId(accountId), lookupAssignedSubForAccount(accountId)]);
    return NextResponse.json({ success: true, site, assignedSub });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Failed to load Team Hub site." },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const action = String(body.action ?? "");

    if (action === "create") {
      const accountId = String(body.accountId ?? "").trim();
      const label = String(body.label ?? "").trim();
      const supervisorPhone = body.supervisorPhone ? String(body.supervisorPhone).trim() : null;

      if (!accountId || !label) {
        return NextResponse.json(
          { success: false, error: "accountId and label are required." },
          { status: 400 }
        );
      }

      const site = await createTeamHubSite({ accountId, label, supervisorPhone });
      return NextResponse.json({ success: true, site });
    }

    const id = Number(body.id);
    if (!Number.isInteger(id)) {
      return NextResponse.json({ success: false, error: "A valid id is required." }, { status: 400 });
    }

    if (action === "update") {
      const site = await updateTeamHubSite(id, {
        label: typeof body.label === "string" ? body.label.trim() : undefined,
        supervisorPhone: body.supervisorPhone !== undefined ? (body.supervisorPhone ? String(body.supervisorPhone).trim() : null) : undefined,
      });
      if (!site) return NextResponse.json({ success: false, error: "Site not found." }, { status: 404 });
      return NextResponse.json({ success: true, site });
    }

    if (action === "setActive") {
      const site = await setTeamHubSiteActive(id, Boolean(body.active));
      if (!site) return NextResponse.json({ success: false, error: "Site not found." }, { status: 404 });
      return NextResponse.json({ success: true, site });
    }

    return NextResponse.json({ success: false, error: `Unknown action "${action}".` }, { status: 400 });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Failed to save Team Hub site." },
      { status: 500 }
    );
  }
}
