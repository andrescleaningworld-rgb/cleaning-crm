// Admin (proxy.ts default admin gate — same people who can open the account
// page). One account's change history from activity_log (entity_type
// "account"): who, when, and old → new for each changed field. A filtered
// read only — the full audit log stays owner-only at /settings/activity-log.
import { NextRequest, NextResponse } from "next/server";
import { listActivityForEntity } from "@/lib/activityLog";

export async function GET(request: NextRequest) {
  try {
    const accountId = new URL(request.url).searchParams.get("accountId")?.trim() ?? "";
    if (!accountId) return NextResponse.json({ success: false, error: "accountId is required." }, { status: 400 });
    const entries = await listActivityForEntity("account", accountId);
    return NextResponse.json({
      success: true,
      entries: entries.map((e) => ({ id: e.id, action: e.action, actorName: e.actorName, detail: e.detail, createdAt: e.createdAt })),
    });
  } catch (error) {
    console.error("[account-history GET]", error);
    return NextResponse.json({ success: false, error: "Could not load history." }, { status: 500 });
  }
}
