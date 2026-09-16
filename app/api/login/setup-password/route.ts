// First-time password creation for a manager or the owner. Only succeeds
// when the target account currently has no password set (setInitialPassword
// enforces this at the DB level) — prevents anyone from overwriting an
// existing person's password here without proof of the old one; that's what
// the owner-only reset-password action (app/api/admin/manager-accounts) is
// for instead.
import { NextRequest, NextResponse } from "next/server";
import { getIronSession } from "iron-session";
import { adminSessionOptions, type AdminIdentitySession } from "@/lib/adminSession";
import { getOwnerAccount, setInitialPassword } from "@/lib/managerAccounts";
import { fetchStaff } from "@/lib/googleSheets";
import { logActivity } from "@/lib/activityLog";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      staffId?: string;
      role?: "manager" | "owner";
      newPassword?: string;
    };

    const role = body.role;
    const newPassword = String(body.newPassword || "").trim();
    if (role !== "manager" && role !== "owner") {
      return NextResponse.json({ success: false, error: "Invalid role." }, { status: 400 });
    }
    if (newPassword.length < 8) {
      return NextResponse.json({ success: false, error: "Password must be at least 8 characters." }, { status: 400 });
    }

    let name: string;
    let account;

    if (role === "manager") {
      const staffId = String(body.staffId || "").trim();
      if (!staffId) {
        return NextResponse.json({ success: false, error: "Missing manager." }, { status: 400 });
      }
      const staff = await fetchStaff();
      const staffRow = staff.find((s) => s.id === staffId);
      if (!staffRow || staffRow.role !== "Manager" || !staffRow.active) {
        return NextResponse.json({ success: false, error: "Manager not found or inactive." }, { status: 404 });
      }
      name = staffRow.name;
      account = await setInitialPassword({ staffId }, newPassword);
    } else {
      const owner = await getOwnerAccount();
      if (!owner) {
        return NextResponse.json({ success: false, error: "Owner account not found." }, { status: 404 });
      }
      name = owner.displayName || "Owner";
      account = await setInitialPassword({ role: "owner" }, newPassword);
    }

    if (!account) {
      return NextResponse.json({ success: false, error: "A password has already been set for this account." }, { status: 409 });
    }

    const finalResponse = NextResponse.json({ success: true, role, name });
    const session = await getIronSession<AdminIdentitySession>(request, finalResponse, adminSessionOptions());
    session.accountId = account.id;
    session.role = role;
    session.staffId = account.staffId ?? undefined;
    session.name = name;
    await session.save();

    await logActivity({
      actorAccountId: account.id,
      actorRole: role,
      actorName: name,
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
