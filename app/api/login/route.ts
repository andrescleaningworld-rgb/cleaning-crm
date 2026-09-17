// Unified manager/owner login — one flow for everyone. Body is
// { staffId, password } where staffId is a Staff-tab id (role must be
// exactly "Manager" and active — this is what the picker at /login shows).
// Whether the granted session is "manager" or "owner" comes entirely from
// the existing manager_accounts row for this staffId (see
// lib/managerAccounts.ts) — there is no separate owner login path, and this
// route never decides or accepts a role from the request. A manager with no
// password set yet gets a distinct `needsSetup: true` response (200, not
// 401) so the client can switch to the create-password form instead of
// showing "Incorrect password" for someone who was never wrong.
import { NextRequest, NextResponse } from "next/server";
import { getIronSession } from "iron-session";
import { adminSessionOptions, type AdminIdentitySession } from "@/lib/adminSession";
import { getAccountByStaffId, touchLastLogin, verifyManagerPassword } from "@/lib/managerAccounts";
import { fetchStaff } from "@/lib/googleSheets";
import { logActivity } from "@/lib/activityLog";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { staffId?: string; password?: string };
    const staffId = String(body.staffId || "").trim();
    const password = String(body.password || "").trim();

    if (!staffId) {
      return NextResponse.json({ success: false, error: "Choose your name." }, { status: 400 });
    }

    const staff = await fetchStaff();
    const staffRow = staff.find((s) => s.id === staffId);
    if (!staffRow || staffRow.role !== "Manager" || !staffRow.active) {
      return NextResponse.json({ success: false, error: "Manager not found or inactive." }, { status: 404 });
    }

    const account = await getAccountByStaffId(staffId);
    if (!account || !account.passwordHash) {
      return NextResponse.json({ success: false, needsSetup: true, error: "No password set yet." });
    }

    const valid = await verifyManagerPassword(account, password);
    if (!valid) {
      return NextResponse.json({ success: false, error: "Incorrect password." }, { status: 401 });
    }

    const finalResponse = NextResponse.json({ success: true, name: staffRow.name, role: account.role });
    const session = await getIronSession<AdminIdentitySession>(request, finalResponse, adminSessionOptions());
    session.accountId = account.id;
    session.role = account.role;
    session.staffId = staffId;
    session.name = staffRow.name;
    await session.save();

    await touchLastLogin(account.id);
    await logActivity({
      actorAccountId: account.id,
      actorRole: account.role,
      actorName: staffRow.name,
      action: "login",
      entityType: "session",
    });

    return finalResponse;
  } catch {
    return NextResponse.json({ success: false, error: "Login failed." }, { status: 500 });
  }
}
