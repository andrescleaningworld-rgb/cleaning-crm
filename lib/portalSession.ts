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
 * The new customer portal (email + password, one portal, big buttons) runs
 * only where the customer-portal data is on Postgres: its logins live in
 * Postgres tables. Everywhere else the two older portals work as before.
 */
export function newPortalOn(): boolean {
  return isPostgres("CUSTOMER_PORTAL");
}

const EIGHT_HOURS = 60 * 60 * 8;
const THIRTY_DAYS = 60 * 60 * 24 * 30;

export function sessionOptions(): SessionOptions {
  const password = process.env.PORTAL_SESSION_PASSWORD;
  if (!password || password.length < 32) {
    throw new Error("PORTAL_SESSION_PASSWORD must be set and at least 32 characters.");
  }
  // New portal: stay logged in on this device for 30 days. Old portal: 8 hours, as before.
  const seconds = newPortalOn() ? THIRTY_DAYS : EIGHT_HOURS;
  return {
    cookieName: SESSION_COOKIE,
    password,
    ...(newPortalOn() ? { ttl: THIRTY_DAYS } : {}),
    cookieOptions: {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: seconds,
    },
  };
}
