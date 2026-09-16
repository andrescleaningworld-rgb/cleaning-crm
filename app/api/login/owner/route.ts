// Owner login — a single password, no name picker (there's one owner row,
// seeded by scripts/setup-manager-auth-db.js). Reached only via the hidden,
// unlinked /login/owner page; never advertised in the manager picker.
import { NextRequest, NextResponse } from "next/server";
import { getIronSession } from "iron-session";
import { adminSessionOptions, type AdminIdentitySession } from "@/lib/adminSession";
import { getOwnerAccount, touchLastLogin, verifyManagerPassword } from "@/lib/managerAccounts";
import { logActivity } from "@/lib/activityLog";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { password?: string };
    const password = String(body.password || "").trim();

    const owner = await getOwnerAccount();
    if (!owner) {
      return NextResponse.json({ success: false, error: "Owner account not found." }, { status: 404 });
    }
    if (!owner.passwordHash) {
      return NextResponse.json({ success: false, needsSetup: true, error: "No password set yet." });
    }

    const valid = await verifyManagerPassword(owner, password);
    if (!valid) {
      return NextResponse.json({ success: false, error: "Incorrect password." }, { status: 401 });
    }

    const name = owner.displayName || "Owner";
    const finalResponse = NextResponse.json({ success: true, name });
    const session = await getIronSession<AdminIdentitySession>(request, finalResponse, adminSessionOptions());
    session.accountId = owner.id;
    session.role = "owner";
    session.name = name;
    await session.save();

    await touchLastLogin(owner.id);
    await logActivity({
      actorAccountId: owner.id,
      actorRole: "owner",
      actorName: name,
      action: "login",
      entityType: "session",
    });

    return finalResponse;
  } catch {
    return NextResponse.json({ success: false, error: "Login failed." }, { status: 500 });
  }
}
