// Owner-only manager-account administration (gated by proxy.ts's
// OWNER_ONLY_PATHS). Distinct from app/api/admin/managers/route.ts, which
// manages a different, unrelated Sheet roster (name/phone/status/color) and
// stays reachable by any admin; this route only touches Postgres auth state
// (password_hash) for Staff-tab Manager-role rows.
import { NextRequest, NextResponse } from "next/server";
import { getAdminIdentity } from "@/lib/adminSession";
import { getIdentityRoster, resetPasswordByStaffId } from "@/lib/managerAccounts";
import { logActivity } from "@/lib/activityLog";

export async function GET() {
  try {
    const identities = await getIdentityRoster();
    return NextResponse.json({ success: true, identities });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Failed to load managers." },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = (await request.json()) as { staffId?: string; action?: string };
    const staffId = String(body.staffId || "").trim();
    if (!staffId || body.action !== "reset-password") {
      return NextResponse.json({ success: false, error: "Missing manager or invalid action." }, { status: 400 });
    }

    await resetPasswordByStaffId(staffId);

    const actor = await getAdminIdentity(request);
    if (actor) {
      await logActivity({
        actorAccountId: actor.accountId ?? null,
        actorRole: actor.role ?? "owner",
        actorName: actor.name || "",
        action: "update",
        entityType: "manager",
        entityId: staffId,
        detail: "password reset",
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Failed to reset password." },
      { status: 500 }
    );
  }
}
