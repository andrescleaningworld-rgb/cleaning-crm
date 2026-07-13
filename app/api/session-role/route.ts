import { NextRequest, NextResponse } from "next/server";
import { getIronSession } from "iron-session";
import { sessionOptions, type PortalSessionData } from "@/lib/portalSession";

const ADMIN_SESSION_TOKEN = process.env.ADMIN_SESSION_TOKEN || "";

const ADMIN_COOKIE_NAMES = [
  "admin_session",
  "cw_admin_session",
  "cleaning_world_admin_session",
];

function hasValidAdminSession(request: NextRequest) {
  return ADMIN_COOKIE_NAMES.some(
    (cookieName) => request.cookies.get(cookieName)?.value === ADMIN_SESSION_TOKEN
  );
}

// Read-only: reports which session (if any) is active so client pages like
// /help can decide what to show. Never sets or modifies any cookie.
export async function GET(request: NextRequest) {
  const isAdmin = Boolean(ADMIN_SESSION_TOKEN) && hasValidAdminSession(request);

  let isCustomer = false;
  try {
    const response = NextResponse.json({});
    const session = await getIronSession<PortalSessionData>(request, response, sessionOptions());
    isCustomer = Boolean(session.accountId && session.portalCode);
  } catch {
    isCustomer = false;
  }

  return NextResponse.json({ isAdmin, isCustomer });
}
