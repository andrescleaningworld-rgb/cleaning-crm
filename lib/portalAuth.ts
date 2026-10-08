// Server helpers shared by the new customer portal's pages and routes.

import { cookies } from "next/headers";
import { getIronSession } from "iron-session";
import { newPortalOn, sessionOptions, type PortalSessionData } from "@/lib/portalSession";
import { accountsForEmail, type PortalAccount } from "@/lib/pg/portal-auth";

/** True outside production: local dev and Vercel previews. A built app with no sign of being a preview counts as production. */
export function isNonProduction(): boolean {
  // `next dev` on a developer's machine: never production, even when a
  // pulled .env.local carries VERCEL_ENV="production".
  if (process.env.NODE_ENV !== "production") return true;
  // A built app: only a Vercel preview or development deployment counts.
  const vercel = process.env.VERCEL_ENV;
  return vercel === "preview" || vercel === "development";
}

export async function readPortalSession() {
  return getIronSession<PortalSessionData>(await cookies(), sessionOptions());
}

export type PortalLogin = {
  email: string;
  /** Every location this email opens right now. */
  accounts: PortalAccount[];
  /** The location in use, or null when none is picked yet (or the picked one is no longer theirs). */
  current: PortalAccount | null;
};

/**
 * Who is logged in to the new portal, checked against the database on every
 * call: an account that was cancelled, lost portal access, or a portal that
 * was closed again stops working at once, not when the cookie runs out.
 */
export async function getPortalLogin(): Promise<PortalLogin | null> {
  const session = await readPortalSession();
  if (!session.email) return null;
  const accounts = await accountsForEmail(session.email);
  if (accounts.length === 0) return null;
  const current = accounts.find((a) => a.accountId === session.accountId) ?? null;
  return { email: session.email, accounts, current };
}

/**
 * The account a portal request is for, or null when nobody is logged in.
 * Old portals: the account in the session cookie, as before. New portal:
 * the same, but only while the logged-in email still opens that account.
 */
export async function requirePortalAccount(): Promise<{ accountId: string; accountName: string } | null> {
  const session = await readPortalSession();
  if (!session.accountId) return null;
  if (!newPortalOn()) return { accountId: session.accountId, accountName: session.accountName ?? "" };
  const login = await getPortalLogin();
  return login?.current ? { accountId: login.current.accountId, accountName: login.current.accountName } : null;
}

/** The link in a "Set your password" email. */
export function passwordLinkUrl(origin: string, token: string): string {
  return `${origin}/portal/set-password?token=${encodeURIComponent(token)}`;
}

/** The email that carries a link, in English and Spanish. */
export function passwordLinkEmail(kind: "set" | "reset", url: string): { subject: string; lines: string[] } {
  const set = kind === "set";
  return {
    subject: set ? "Cleaning World: set your password / elija su contraseña" : "Cleaning World: reset your password / cambie su contraseña",
    lines: [
      set ? "Welcome to the Cleaning World customer portal." : "You asked to reset your Cleaning World portal password.",
      "Tap this link to choose your password. It works for 24 hours, one time:",
      url,
      "If you did not ask for this, you can ignore this email.",
      "",
      set ? "Bienvenido al portal de clientes de Cleaning World." : "Usted pidió cambiar su contraseña del portal de Cleaning World.",
      "Toque este enlace para elegir su contraseña. Funciona por 24 horas, una sola vez:",
      url,
      "Si usted no pidió esto, puede ignorar este correo.",
    ],
  };
}
