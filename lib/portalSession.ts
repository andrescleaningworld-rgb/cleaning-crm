import type { SessionOptions } from "iron-session";
import { isPostgres } from "@/lib/dataSource";

export interface PortalSessionData {
  accountId?: string;
  accountName?: string;
  portalCode?: string;
  /** New portal (email + password): who is logged in. accountId is the location they picked. */
  email?: string;
}

export const SESSION_COOKIE = "portal_session";

/**
 * The customer portal itself (email + password, /portal) always runs on
 * Postgres; the two older portals are gone. This switch is only about the
 * STAFF side: where it is on, Settings -> Customer Portal Access and Portal
 * Requests read Postgres too, and "Portal open to customers" can be turned
 * on. Until then no real customer can log in (only test accounts).
 */
export function newPortalOn(): boolean {
  return isPostgres("CUSTOMER_PORTAL");
}

const THIRTY_DAYS = 60 * 60 * 24 * 30;

export function sessionOptions(): SessionOptions {
  const password = process.env.PORTAL_SESSION_PASSWORD;
  if (!password || password.length < 32) {
    throw new Error("PORTAL_SESSION_PASSWORD must be set and at least 32 characters.");
  }
  // Stay logged in on this device for 30 days.
  return {
    cookieName: SESSION_COOKIE,
    password,
    ttl: THIRTY_DAYS,
    cookieOptions: {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: THIRTY_DAYS,
    },
  };
}
