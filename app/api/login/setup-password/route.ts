// First-time password creation — one unified flow for every manager,
// including whoever is provisioned as the owner. Body is just
// { staffId, newPassword }; there is no "role" field here, by design — the
// role a person ends up with is whatever their manager_accounts row already
// holds (see lib/managerAccounts.ts), never something the client can
// choose. Only succeeds when the target account currently has no password
// set (setInitialPassword enforces this at the DB level) — prevents
// anyone from overwriting an existing person's password here without proof
// of the old one; that's what the owner-only reset-password action
// (app/api/admin/manager-accounts) is for instead.
import { NextRequest, NextResponse } from "next/server";
import { getIronSession } from "iron-session";
import { adminSessionOptions, type AdminIdentitySession } from "@/lib/adminSession";
import { setInitialPassword } from "@/lib/managerAccounts";
import { fetchStaff } from "@/lib/googleSheets";
import { logActivity } from "@/lib/activityLog";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { staffId?: string; newPassword?: string };

    const staffId = String(body.staffId || "").trim();
    const newPassword = String(body.newPassword || "").trim();
    if (!staffId) {
      return NextResponse.json({ success: false, error: "Missing manager." }, { status: 400 });
    }
    if (newPassword.length < 8) {
      return NextResponse.json({ success: false, error: "Password must be at least 8 characters." }, { status: 400 });
    }

    const staff = await fetchStaff();
    const staffRow = staff.find((s) => s.id === staffId);
    if (!staffRow || staffRow.role !== "Manager" || !staffRow.active) {
      return NextResponse.json({ success: false, error: "Manager not found or inactive." }, { status: 404 });
    }

    const account = await setInitialPassword(staffId, newPassword);
    if (!account) {
      return NextResponse.json({ success: false, error: "A password has already been set for this account." }, { status: 409 });
    }

    const finalResponse = NextResponse.json({ success: true, role: account.role, name: staffRow.name });
    const session = await getIronSession<AdminIdentitySession>(request, finalResponse, adminSessionOptions());
    session.accountId = account.id;
    session.role = account.role;
    session.staffId = staffId;
    session.name = staffRow.name;
    await session.save();

    await logActivity({
      actorAccountId: account.id,
      actorRole: account.role,
      actorName: staffRow.name,
      action: "login",
      entityType: "session",
      detail: "first-time password setup",
    });

    return finalResponse;
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Could not set up password." },
      { status: 500 }
    );
  }
}
