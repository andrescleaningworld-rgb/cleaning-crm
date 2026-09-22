// Admin-only (protected by proxy.ts's default admin gate — this path is
// not in PUBLIC_PATHS/SUB_PATHS/SUB_OR_ADMIN_PATHS). Manages site_links:
// list (with resolved account names), create, revoke/reactivate,
// regenerate token, relabel.
import { NextRequest, NextResponse } from "next/server";
import {
  listSiteLinks,
  createSiteLink,
  setSiteLinkActive,
  regenerateSiteLinkToken,
  updateSiteLinkLabel,
  getSiteLinkAllowedItemIds,
  setSiteLinkAllowedItems,
} from "@/lib/siteLinkDb";
import { getAccountSummariesByIds } from "@/lib/googleSheets";
import { getAdminIdentity } from "@/lib/adminSession";
import { logActivity } from "@/lib/activityLog";

export async function GET() {
  try {
    const links = await listSiteLinks();
    const accountMap = await getAccountSummariesByIds(links.map((l) => l.accountId));

    const enriched = links.map((link) => ({
      ...link,
      accountName: accountMap.get(link.accountId)?.accountName ?? "(unknown account)",
    }));

    return NextResponse.json({ success: true, links: enriched });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Failed to load site links." },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const action = String(body.action ?? "");
    const actor = await getAdminIdentity(request);

    if (action === "create") {
      const accountId = String(body.accountId ?? "").trim();
      const subId = body.subId ? String(body.subId).trim() : null;
      const label = String(body.label ?? "").trim();

      if (!accountId || !label) {
        return NextResponse.json(
          { success: false, error: "accountId and label are required." },
          { status: 400 }
        );
      }

      const link = await createSiteLink({ accountId, subId, label });

      if (actor?.accountId) {
        await logActivity({
          actorAccountId: actor.accountId,
          actorRole: actor.role ?? "manager",
          actorName: actor.name || "",
          action: "create",
          entityType: "site_link",
          entityId: String(link.id),
          detail: label,
        });
      }

      return NextResponse.json({ success: true, link });
    }

    const id = Number(body.id);
    if (!Number.isInteger(id)) {
      return NextResponse.json({ success: false, error: "A valid id is required." }, { status: 400 });
    }

    if (action === "setActive") {
      const link = await setSiteLinkActive(id, Boolean(body.active));
      if (!link) {
        return NextResponse.json({ success: false, error: "Link not found." }, { status: 404 });
      }
      if (actor?.accountId) {
        await logActivity({
          actorAccountId: actor.accountId,
          actorRole: actor.role ?? "manager",
          actorName: actor.name || "",
          action: "update",
          entityType: "site_link",
          entityId: String(id),
          detail: link.active ? "reactivated" : "revoked",
        });
      }
      return NextResponse.json({ success: true, link });
    }

    if (action === "regenerateToken") {
      const link = await regenerateSiteLinkToken(id);
      if (!link) {
        return NextResponse.json({ success: false, error: "Link not found." }, { status: 404 });
      }
      if (actor?.accountId) {
        await logActivity({
          actorAccountId: actor.accountId,
          actorRole: actor.role ?? "manager",
          actorName: actor.name || "",
          action: "update",
          entityType: "site_link",
          entityId: String(id),
          detail: "regenerated token",
        });
      }
      return NextResponse.json({ success: true, link });
    }

    if (action === "updateLabel") {
      const label = String(body.label ?? "").trim();
      if (!label) {
        return NextResponse.json({ success: false, error: "label is required." }, { status: 400 });
      }
      const link = await updateSiteLinkLabel(id, label);
      if (!link) {
        return NextResponse.json({ success: false, error: "Link not found." }, { status: 404 });
      }
      return NextResponse.json({ success: true, link });
    }

    if (action === "setAllowedItems") {
      const itemIds = Array.isArray(body.itemIds) ? body.itemIds.map(Number).filter(Number.isInteger) : [];
      await setSiteLinkAllowedItems(id, itemIds);
      return NextResponse.json({ success: true });
    }

    if (action === "getAllowedItems") {
      const itemIds = await getSiteLinkAllowedItemIds(id);
      return NextResponse.json({ success: true, itemIds });
    }

    return NextResponse.json({ success: false, error: `Unknown action "${action}".` }, { status: 400 });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Failed to update site link." },
      { status: 500 }
    );
  }
}
