// "Delete account" on the account page (lib/pg/account-delete.ts). Admin
// area (proxy.ts default gate), and only a signed-in owner or manager.
//
// GET: what the confirm window shows (the name and how many visits,
// complaints, supply orders and checklist items the account has).
// POST { reason }: the soft delete, written on the account's History.
import { NextRequest, NextResponse } from "next/server";
import { getAdminIdentity } from "@/lib/adminSession";
import { logActivity } from "@/lib/activityLog";
import { accountsOnPostgres } from "@/lib/data/accounts";
import { accountDeleteReady, deleteAccount, deleteImpact } from "@/lib/pg/account-delete";
import { invalidateAccountLists } from "@/app/api/accounts/route";

type RouteContext = { params: Promise<{ id: string }> };

const MAX_REASON = 500;

function refuse(error: string, status: number) {
  return NextResponse.json({ success: false, error }, { status });
}

async function check(request: NextRequest) {
  const identity = await getAdminIdentity(request);
  if (!identity || (identity.role !== "owner" && identity.role !== "manager")) {
    return { refused: refuse("Only the owner and managers can delete an account.", 403) };
  }
  if (!accountsOnPostgres() || !(await accountDeleteReady())) {
    return { refused: refuse("Deleting accounts is not set up on this database yet.", 400) };
  }
  return { identity };
}

export async function GET(request: NextRequest, { params }: RouteContext) {
  try {
    const gate = await check(request);
    if (gate.refused) return gate.refused;
    const { id } = await params;
    const impact = await deleteImpact(decodeURIComponent(id));
    if (!impact) return refuse("Could not find this account.", 404);
    return NextResponse.json({ success: true, impact });
  } catch (error) {
    console.error("[accounts/[id]/delete GET]", error);
    return refuse("Could not load this account.", 500);
  }
}

export async function POST(request: NextRequest, { params }: RouteContext) {
  try {
    const gate = await check(request);
    if (gate.refused) return gate.refused;
    const identity = gate.identity!;
    const { id } = await params;
    const accountId = decodeURIComponent(id).trim();
    const body = (await request.json().catch(() => ({}))) as { reason?: unknown };
    const reason = String(body.reason ?? "").trim().slice(0, MAX_REASON);
    if (!reason) return refuse("Say why this account is being deleted.", 400);

    const by = identity.name || "Someone";
    const deleted = await deleteAccount({ accountId, by, reason });
    if (!deleted) return refuse("This account was not found, or it is already deleted.", 404);
    await invalidateAccountLists();

    await logActivity({
      actorAccountId: identity.accountId ?? null,
      actorRole: identity.role ?? "manager",
      actorName: by,
      action: "delete",
      entityType: "account",
      entityId: accountId,
      detail: [`Deleted the account: ${deleted.accountName}`, `Reason: ${reason}`].join("\n"),
    });

    return NextResponse.json({ success: true, accountName: deleted.accountName });
  } catch (error) {
    console.error("[accounts/[id]/delete POST]", error);
    return refuse("The account was not deleted. Try again.", 500);
  }
}
