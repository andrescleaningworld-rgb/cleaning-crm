import type { SessionOptions } from "iron-session";

export interface PortalSessionData {
  accountId?: string;
  accountName?: string;
  portalCode?: string;
}

export const SESSION_COOKIE = "portal_session";

export function sessionOptions(): SessionOptions {
  const password = process.env.PORTAL_SESSION_PASSWORD;
  if (!password || password.length < 32) {
    throw new Error("PORTAL_SESSION_PASSWORD must be set and at least 32 characters.");
  }
  return {
    cookieName: SESSION_COOKIE,
    password,
    cookieOptions: {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 8,
    },
  };
}
