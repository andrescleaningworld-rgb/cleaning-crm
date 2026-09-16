import { NextRequest, NextResponse } from "next/server";
import { getIronSession } from "iron-session";
import { adminSessionOptions, type AdminIdentitySession } from "@/lib/adminSession";
import { logActivity } from "@/lib/activityLog";

const COOKIE_NAME = "cw_admin_session";

export async function POST(request: NextRequest) {
  const response = NextResponse.json({
    success: true,
    message: "Logged out.",
  });

  // Legacy shared-secret cookie — cleared defensively during the transition
  // off ADMIN_PASSWORD/ADMIN_SESSION_TOKEN; harmless once retired. Must run
  // BEFORE session.destroy() below: NextResponse's response.cookies.set()
  // rebuilds the entire Set-Cookie header from its own tracked cookie map
  // (see next/dist/compiled/@edge-runtime/cookies' replace()), which would
  // silently wipe out a cookie iron-session had already appended directly
  // via response.headers.append() if this ran afterward.
  response.cookies.set(COOKIE_NAME, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });

  // Read identity before destroying so the logout event is attributed
  // correctly, then destroy the session regardless of whether that read
  // succeeds (a missing/corrupt session should still log out cleanly).
  try {
    const session = await getIronSession<AdminIdentitySession>(request, response, adminSessionOptions());
    if (session.accountId && session.role) {
      await logActivity({
        actorAccountId: session.accountId,
        actorRole: session.role,
        actorName: session.name || "",
        action: "logout",
        entityType: "session",
      });
    }
    session.destroy();
  } catch {
    // ignore — ADMIN_SESSION_PASSWORD missing or cookie unreadable; still
    // logs out cleanly since the legacy cookie was already cleared above.
  }

  return response;
}
