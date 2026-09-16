// Individual manager login — replaces the old single shared-ADMIN_PASSWORD
// check. Body is { sheetManagerId, password }; the owner logs in via the
// separate app/api/login/owner route instead. A manager with no password set
// yet gets a distinct `needsSetup: true` response (200, not 401) so the
// client can switch to the create-password form instead of showing
// "Incorrect password" for someone who was never wrong.
import { NextRequest, NextResponse } from "next/server";
import { getIronSession } from "iron-session";
import { adminSessionOptions, type AdminIdentitySession } from "@/lib/adminSession";
import { getAccountBySheetManagerId, touchLastLogin, verifyManagerPassword } from "@/lib/managerAccounts";
import { fetchManagers } from "@/lib/googleSheets";
import { logActivity } from "@/lib/activityLog";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { sheetManagerId?: string; password?: string };
    const sheetManagerId = String(body.sheetManagerId || "").trim();
    const password = String(body.password || "").trim();

    if (!sheetManagerId) {
      return NextResponse.json({ success: false, error: "Choose your name." }, { status: 400 });
    }

    const managers = await fetchManagers();
    const managerRow = managers.find((m) => m.managerId === sheetManagerId);
    if (!managerRow || (managerRow.status && managerRow.status !== "Active")) {
      return NextResponse.json({ success: false, error: "Manager not found or inactive." }, { status: 404 });
    }

    const account = await getAccountBySheetManagerId(sheetManagerId);
    if (!account || !account.passwordHash) {
      return NextResponse.json({ success: false, needsSetup: true, error: "No password set yet." });
    }

    const valid = await verifyManagerPassword(account, password);
    if (!valid) {
      return NextResponse.json({ success: false, error: "Incorrect password." }, { status: 401 });
    }

    const finalResponse = NextResponse.json({ success: true, name: managerRow.name });
    const session = await getIronSession<AdminIdentitySession>(request, finalResponse, adminSessionOptions());
    session.accountId = account.id;
    session.role = "manager";
    session.sheetManagerId = sheetManagerId;
    session.name = managerRow.name;
    await session.save();

    await touchLastLogin(account.id);
    await logActivity({
      actorAccountId: account.id,
      actorRole: "manager",
      actorName: managerRow.name,
      action: "login",
      entityType: "session",
    });

    return finalResponse;
  } catch {
    return NextResponse.json({ success: false, error: "Login failed." }, { status: 500 });
  }
}
