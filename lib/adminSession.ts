import { getIronSession, type SessionOptions } from "iron-session";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

export interface AdminIdentitySession {
  accountId?: string;
  role?: "manager" | "owner";
  staffId?: string;
  name?: string;
}

export const ADMIN_IDENTITY_COOKIE = "cw_admin_identity";

export function adminSessionOptions(): SessionOptions {
  const password = process.env.ADMIN_SESSION_PASSWORD;
  if (!password || password.length < 32) {
    throw new Error("ADMIN_SESSION_PASSWORD must be set and at least 32 characters.");
  }
  return {
    cookieName: ADMIN_IDENTITY_COOKIE,
    password,
    cookieOptions: {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 12,
    },
  };
}

// Read-only convenience for route handlers that just need to know who's
// acting (audit-log stamping) without themselves needing to save/destroy the
// session — building a throwaway response mirrors proxy.ts's
// hasValidSubSession, since getIronSession needs somewhere to write a
// refreshed cookie even when the caller only reads.
export async function getAdminIdentity(request: NextRequest): Promise<AdminIdentitySession | null> {
  try {
    const response = NextResponse.next();
    const session = await getIronSession<AdminIdentitySession>(request, response, adminSessionOptions());
    if (!session.accountId || !session.role) return null;
    return session;
  } catch {
    return null;
  }
}
