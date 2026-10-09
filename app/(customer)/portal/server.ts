// Server helpers for the new customer portal's pages.

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getPortalLogin, type PortalLogin } from "@/lib/portalAuth";
import { newPortalOn } from "@/lib/portalSession";
import type { PortalAccount } from "@/lib/pg/portal-auth";
import { asPortalLang, PORTAL_LANG_COOKIE, PORTAL_WORDS, type PortalLang, type PortalWords } from "./words";

export async function portalLang(): Promise<PortalLang> {
  return asPortalLang((await cookies()).get(PORTAL_LANG_COOKIE)?.value);
}

export async function portalWords(): Promise<{ lang: PortalLang; words: PortalWords }> {
  const lang = await portalLang();
  return { lang, words: PORTAL_WORDS[lang] };
}

/**
 * For every screen behind the login: the logged-in customer and the
 * location in use. Sends the visitor to the old portal where the new one is
 * not running, to the login when nobody is logged in, and to "Which
 * location?" when no location is picked.
 */
export async function requireCustomer(): Promise<{ login: PortalLogin; account: PortalAccount; lang: PortalLang; words: PortalWords }> {
  if (!newPortalOn()) redirect("/portal/dashboard");
  const login = await getPortalLogin();
  if (!login) redirect("/portal/login");
  if (!login.current) redirect("/portal/locations");
  return { login, account: login.current, ...(await portalWords()) };
}
