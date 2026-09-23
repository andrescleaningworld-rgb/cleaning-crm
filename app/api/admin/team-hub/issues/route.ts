// Admin-only (proxy.ts default admin gate). Phase 4: list + one-tap status
// change for one site's problem reports, plus the manual-only "promote to
// complaint" linkage (paste the complaint id back in after saving it
// through the existing /complaints/new flow — never auto-created, never
// touches the sub score). No Sheets reads/writes in this file.
import { NextRequest, NextResponse } from "next/server";
import { listTeamHubIssuesForSite, listCrewLinkIssuesForAccount, setTeamHubIssueStatus, setTeamHubIssueComplaintId } from "@/lib/teamHubDb";
import { getAdminIdentity } from "@/lib/adminSession";
import { logActivity } from "@/lib/activityLog";

export async function GET(request: NextRequest) {
  try {
    const params = new URL(request.url).searchParams;
    // Crew Link (docs/crew-link-spec.md): ?crewLinkAccountId= lists one
    // account's Crew Link problems instead of a Team Hub site's.
    const crewLinkAccountId = params.get("crewLinkAccountId")?.trim();
    if (crewLinkAccountId) {
      const issues = await listCrewLinkIssuesForAccount(crewLinkAccountId);
      return NextResponse.json({ success: true, issues });
    }
    const siteId = Number(params.get("siteId"));
    if (!Number.isInteger(siteId)) {
      return NextResponse.json({ success: false, error: "A valid siteId is required." }, { status: 400 });
    }
    const issues = await listTeamHubIssuesForSite(siteId);
    return NextResponse.json({ success: true, issues });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Failed to load problem reports." },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const action = String(body.action ?? "");
    const id = Number(body.id);
    if (!Number.isInteger(id)) {
      return NextResponse.json({ success: false, error: "A valid id is required." }, { status: 400 });
    }

    if (action === "setStatus") {
      const status = String(body.status ?? "");
      if (status !== "open" && status !== "resolved") {
        return NextResponse.json({ success: false, error: "Invalid status." }, { status: 400 });
      }
      const issue = await setTeamHubIssueStatus(id, status);
      if (!issue) return NextResponse.json({ success: false, error: "Issue not found." }, { status: 404 });

      const actor = await getAdminIdentity(request);
      if (actor?.accountId) {
        await logActivity({
          actorAccountId: actor.accountId,
          actorRole: actor.role ?? "manager",
          actorName: actor.name || "",
          action: "update",
          entityType: "team-hub-issue",
          entityId: String(id),
          detail: status,
        });
      }
      return NextResponse.json({ success: true, issue });
    }

    if (action === "setComplaintId") {
      const complaintId = String(body.complaintId ?? "").trim();
      if (!complaintId) {
        return NextResponse.json({ success: false, error: "A complaint id is required." }, { status: 400 });
      }
      const issue = await setTeamHubIssueComplaintId(id, complaintId);
      if (!issue) return NextResponse.json({ success: false, error: "Issue not found." }, { status: 404 });

      const actor = await getAdminIdentity(request);
      if (actor?.accountId) {
        await logActivity({
          actorAccountId: actor.accountId,
          actorRole: actor.role ?? "manager",
          actorName: actor.name || "",
          action: "update",
          entityType: "team-hub-issue",
          entityId: String(id),
          detail: `promoted to complaint ${complaintId}`,
        });
      }
      return NextResponse.json({ success: true, issue });
    }

    return NextResponse.json({ success: false, error: `Unknown action "${action}".` }, { status: 400 });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Failed to update issue." },
      { status: 500 }
    );
  }
}
