// "Invite to portal" on a sub's page. Admin only: /api/subcontractors is not
// in proxy.ts's public or sub paths, so the admin login gate applies.
//
//   GET                       the sub's name and email on file, and its last invites
//   POST { method }           records an invite (text, copy, print); "email"
//                             also sends it to the email on file
//
// The email address is always read here, never taken from the screen. Each
// invite is a line in the audit log (lib/subPortalInvite.ts); no table of its own.
import { NextRequest, NextResponse } from "next/server";
import { getAdminIdentity } from "@/lib/adminSession";
import { listActivityForEntity, logActivity } from "@/lib/activityLog";
import { getAllSubcontractorsRaw } from "@/lib/data/subs";
import { SUB_INVITE_ENTITY, SUB_PORTAL_PATH, inviteDetail, inviteMethodOf, isInviteMethod, type InviteRecord } from "@/lib/subPortalInvite";
import { sendSubInviteEmail } from "@/lib/subPortalInviteEmail";

type RouteContext = { params: Promise<{ id: string }> };

const clean = (value: unknown) => String(value ?? "").trim();
const refuse = (error: string, status = 400) => NextResponse.json({ success: false, error }, { status });

async function findSub(id: string) {
  const rows = await getAllSubcontractorsRaw();
  const row = rows.find((sub) => clean(sub.id) === id);
  return row ? { email: clean(row.email), name: clean(row.contactName) || clean(row.companyName) } : null;
}

async function recentInvites(id: string): Promise<InviteRecord[]> {
  const entries = await listActivityForEntity(SUB_INVITE_ENTITY, id, 20);
  return entries.flatMap((entry) => {
    const method = inviteMethodOf(entry.detail);
    return method ? [{ at: entry.createdAt, by: entry.actorName, method }] : [];
  });
}

export async function GET(_request: NextRequest, { params }: RouteContext) {
  try {
    const id = clean(decodeURIComponent((await params).id));
    const sub = await findSub(id);
    if (!sub) return refuse("Could not find this subcontractor.", 404);
    return NextResponse.json({ success: true, email: sub.email, name: sub.name, invites: await recentInvites(id) });
  } catch (error) {
    console.error("[subcontractors invite GET]", error instanceof Error ? error.message : error);
    return refuse("The invites did not load. Try again.", 500);
  }
}

export async function POST(request: NextRequest, { params }: RouteContext) {
  try {
    const id = clean(decodeURIComponent((await params).id));
    const body = (await request.json().catch(() => ({}))) as { method?: unknown };
    if (!isInviteMethod(body.method)) return refuse("method must be text, copy, print or email.");
    const method = body.method;
    const sub = await findSub(id);
    if (!sub) return refuse("Could not find this subcontractor.", 404);
    if (!sub.email) return refuse("Add an email for this sub first.");

    if (method === "email") {
      const url = `${new URL(request.url).origin}${SUB_PORTAL_PATH}`;
      const identity = await getAdminIdentity(request);
      const sent = await sendSubInviteEmail({ email: sub.email, url, subName: sub.name, log: { type: "Sub portal invite", subId: id, subName: sub.name, sentBy: identity?.name || "Someone" } });
      if (!sent) return refuse("The email was not sent: email is not set up on this server.", 503);
    }

    const identity = await getAdminIdentity(request);
    await logActivity({
      actorAccountId: identity?.accountId ?? null,
      actorRole: identity?.role ?? "manager",
      actorName: identity?.name || "Someone",
      action: "create",
      entityType: SUB_INVITE_ENTITY,
      entityId: id,
      detail: inviteDetail(method),
    });
    return NextResponse.json({ success: true, invites: await recentInvites(id) });
  } catch (error) {
    console.error("[subcontractors invite POST]", error instanceof Error ? error.message : error);
    return refuse(error instanceof Error && error.message.startsWith("Resend") ? "The email was not sent. Try again." : "That did not work. Try again.", 500);
  }
}
