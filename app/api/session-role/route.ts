import { NextRequest, NextResponse } from "next/server";
import { getIronSession } from "iron-session";
import { sessionOptions, type PortalSessionData } from "@/lib/portalSession";
import { adminSessionOptions, type AdminIdentitySession } from "@/lib/adminSession";

// Read-only: reports which session (if any) is active so client pages like
// /help and Settings can decide what to show. Never sets or modifies any
// cookie. Kept in lockstep with proxy.ts's admin-session check — both read
// the same AdminIdentitySession now, so update both together.
export async function GET(request: NextRequest) {
  let isAdmin = false;
  let role: "manager" | "owner" | null = null;
  let name = "";
  try {
    const response = NextResponse.json({});
    const session = await getIronSession<AdminIdentitySession>(request, response, adminSessionOptions());
    if (session.accountId && session.role) {
      isAdmin = true;
      role = session.role;
      name = session.name || "";
    }
  } catch {
    isAdmin = false;
  }

  let isCustomer = false;
  try {
    const response = NextResponse.json({});
    const session = await getIronSession<PortalSessionData>(request, response, sessionOptions());
    isCustomer = Boolean(session.accountId && session.portalCode);
  } catch {
    isCustomer = false;
  }

  return NextResponse.json({ isAdmin, isCustomer, role, name });
}
