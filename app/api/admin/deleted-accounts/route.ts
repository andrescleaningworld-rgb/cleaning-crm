// Settings → Deleted accounts (lib/pg/account-delete.ts). Admin area
// (proxy.ts default gate), and only a signed-in owner or manager.
//
// GET: every deleted account (name, who deleted it, when, why).
// POST { accountId }: Restore. Written on the account's History.
import { NextRequest, NextResponse } from "next/server";
import { getAdminIdentity } from "@/lib/adminSession";
import { logActivity } from "@/lib/activityLog";
import { accountsOnPostgres } from "@/lib/data/accounts";
import { accountDeleteReady, listDeletedAccounts, restoreAccount } from "@/lib/pg/account-delete";
import { invalidateAccountLists } from "@/app/api/accounts/route";

function refuse(error: string, status: number) {
  return NextResponse.json({ success: false, error }, { status });
}

async function check(request: NextRequest) {
  const identity = await getAdminIdentity(request);
  if (!identity || (identity.role !== "owner" && identity.role !== "manager")) {
    return { refused: refuse("Only the owner and managers can see and restore deleted accounts.", 403) };
  }
  if (!accountsOnPostgres() || !(await accountDeleteReady())) return { ready: false as const, identity };
  return { ready: true as const, identity };
}

export async function GET(request: NextRequest) {
  try {
    const gate = await check(request);
    if ("refused" in gate) return gate.refused;
    if (!gate.ready) return NextResponse.json({ success: true, ready: false, accounts: [] });
    return NextResponse.json({ success: true, ready: true, accounts: await listDeletedAccounts() });
  } catch (error) {
    console.error("[admin/deleted-accounts GET]", error);
    return refuse("Could not load the deleted accounts.", 500);
  }
}

export async function POST(request: NextRequest) {
  try {
    const gate = await check(request);
    if ("refused" in gate) return gate.refused;
    if (!gate.ready) return refuse("Deleting accounts is not set up on this database yet.", 400);
    const body = (await request.json().catch(() => ({}))) as { accountId?: unknown };
    const accountId = String(body.accountId ?? "").trim();
    if (!accountId) return refuse("accountId is required.", 400);

    const restored = await restoreAccount(accountId);
    if (!restored) return refuse("This account is not deleted (it may have been restored already).", 404);
    await invalidateAccountLists();

    const by = gate.identity.name || "Someone";
    await logActivity({
      actorAccountId: gate.identity.accountId ?? null,
      actorRole: gate.identity.role ?? "manager",
      actorName: by,
      action: "update",
      entityType: "account",
      entityId: accountId,
      detail: `Restored the account: ${restored.accountName}`,
    });

    return NextResponse.json({ success: true, accountName: restored.accountName });
  } catch (error) {
    console.error("[admin/deleted-accounts POST]", error);
    return refuse("The account was not restored. Try again.", 500);
  }
}
