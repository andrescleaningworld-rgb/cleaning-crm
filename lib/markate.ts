// Markate Connect API: the login (OAuth), the token encryption and the rule
// that says which estimates come into the CRM. Server only. The database side
// is lib/pg/markate.ts.
//
// Never log a token or the client secret: errors here carry Markate's own
// error text only.

import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";

export const MARKATE_BASE = "https://www.markate.com";
export const MARKATE_VERSION = "20260929";
/** The one redirect address Markate has on file for us. Connect only works from this app address. */
export const MARKATE_REDIRECT_URI = "https://cleaning-crm-xi.vercel.app/api/markate/oauth/callback";
export const MARKATE_SCOPE = "read_only";

export function markateConfigured(): boolean {
  return Boolean(process.env.MARKATE_CLIENT_ID && process.env.MARKATE_CLIENT_SECRET);
}

function credentials(): { clientId: string; clientSecret: string } {
  const clientId = process.env.MARKATE_CLIENT_ID ?? "";
  const clientSecret = process.env.MARKATE_CLIENT_SECRET ?? "";
  if (!clientId || !clientSecret) throw new Error("Markate is not set up here (the app keys are missing).");
  return { clientId, clientSecret };
}

/* ---------- token encryption ---------- */

// The key comes from the client secret, so no extra setting is needed. If the
// secret is ever changed, the saved tokens cannot be read: connect again.
function tokenKey(): Buffer {
  return Buffer.from(hkdfSync("sha256", credentials().clientSecret, "cleaning-crm", "markate-token-v1", 32));
}

export function encryptToken(token: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", tokenKey(), iv);
  const body = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), body.toString("base64url")].join(".");
}

export function decryptToken(stored: string): string {
  const [version, iv, tag, body] = stored.split(".");
  if (version !== "v1" || !iv || !tag || !body) throw new Error("The saved Markate login cannot be read. Connect Markate again.");
  try {
    const decipher = createDecipheriv("aes-256-gcm", tokenKey(), Buffer.from(iv, "base64url"));
    decipher.setAuthTag(Buffer.from(tag, "base64url"));
    return Buffer.concat([decipher.update(Buffer.from(body, "base64url")), decipher.final()]).toString("utf8");
  } catch {
    throw new Error("The saved Markate login cannot be read. Connect Markate again.");
  }
}

/* ---------- OAuth ---------- */

export function authorizeUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: credentials().clientId,
    scope: MARKATE_SCOPE,
    response_type: "code",
    redirect_uri: MARKATE_REDIRECT_URI,
    state,
  });
  return `${MARKATE_BASE}/connect/oauth/authorize?${params.toString()}`;
}

export type MarkateTokens = { accessToken: string; refreshToken: string; expiresAt: Date; markateUserId: string; scope: string };

async function tokenCall(params: Record<string, string>): Promise<MarkateTokens> {
  const { clientId, clientSecret } = credentials();
  const response = await fetch(`${MARKATE_BASE}/connect/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", "Markate-Version": MARKATE_VERSION },
    body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, ...params }).toString(),
    cache: "no-store",
  });
  const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  const accessToken = String(data.access_token ?? "");
  const refreshToken = String(data.refresh_token ?? "");
  if (!response.ok || !accessToken || !refreshToken) {
    throw new Error(`Markate said no: ${String(data.error_description ?? data.error ?? response.status)}`);
  }
  const seconds = Number(data.expires_in);
  const expiresOn = Date.parse(String(data.expires_on ?? ""));
  const expiresAt = Number.isFinite(seconds) && seconds > 0 ? new Date(Date.now() + seconds * 1000) : Number.isFinite(expiresOn) ? new Date(expiresOn) : new Date(Date.now() + 6 * 86_400_000);
  return { accessToken, refreshToken, expiresAt, markateUserId: String(data.markate_user_id ?? ""), scope: String(data.scope ?? MARKATE_SCOPE) };
}

export function exchangeCode(code: string): Promise<MarkateTokens> {
  return tokenCall({ grant_type: "authorization_code", code, redirect_uri: MARKATE_REDIRECT_URI });
}

export function refreshTokens(refreshToken: string): Promise<MarkateTokens> {
  return tokenCall({ grant_type: "refresh_token", refresh_token: refreshToken });
}

/** Disconnect: Markate forgets this login. A failure here does not stop the disconnect on our side. */
export async function revokeTokens(refreshToken: string): Promise<void> {
  const { clientId, clientSecret } = credentials();
  await fetch(`${MARKATE_BASE}/connect/oauth/revoke`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", "Markate-Version": MARKATE_VERSION },
    body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, token: refreshToken, token_hint: "refresh_token" }).toString(),
    cache: "no-store",
  });
}

/* ---------- API ---------- */

export class MarkateApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    /** From Markate's Retry-After header on "Too many requests" (0 = not given). */
    readonly retryAfterSeconds = 0
  ) {
    super(message);
  }
}

export async function markateGet<T>(accessToken: string, path: string, query: Record<string, string> = {}): Promise<T> {
  const url = new URL(`${MARKATE_BASE}/connect/api/v1/${path}`);
  for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value);
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}`, "Markate-Version": MARKATE_VERSION },
    cache: "no-store",
  });
  if (!response.ok) {
    const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    const why = response.status === 429 ? "Too many requests" : String(data.error_description ?? data.error ?? data.message ?? "");
    const retryAfter = Number(response.headers.get("retry-after"));
    throw new MarkateApiError(`Markate ${path.split("?")[0]}: ${response.status}${why ? ` ${why}` : ""}`, response.status, Number.isFinite(retryAfter) && retryAfter > 0 ? Math.min(retryAfter, 120) : 0);
  }
  return (await response.json()) as T;
}

/* ---------- which estimates come in ---------- */

export type MarkateItem = { name?: unknown; description?: unknown; total?: unknown };
export type MarkateEstimate = {
  id?: unknown;
  custom_number?: unknown;
  customer_id?: unknown;
  customer?: { id?: unknown; name?: unknown } | null;
  status?: unknown;
  total?: unknown;
  date_issued?: unknown;
  date_accepted?: unknown;
  datetime_added?: unknown;
  datetime_updated?: unknown;
  url_public?: unknown;
  items?: MarkateItem[] | null;
};
export type MarkateCustomer = Record<string, unknown> & { id?: unknown; type_service?: unknown };

export const text = (value: unknown) => (value === null || value === undefined ? "" : String(value)).trim();
const money = (value: unknown) => {
  const n = Number(text(value).replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
};

/** The name key the recurring list compares on: trimmed, any case. Exact match only, never "contains". */
export const itemKey = (name: string) => name.trim().replace(/\s+/g, " ").toLowerCase();

export type RecurringMatch = { item: string; why: "name" | "per month"; recurringTotal: number };

/**
 * The line items that make an estimate recurring: the name is exactly on the
 * list (so "1x Office Cleaning" is not "Office Cleaning"), or the description
 * says "per month". null when no line item is recurring.
 */
export function recurringMatch(items: MarkateItem[], recurringNames: Set<string>): RecurringMatch | null {
  let first: { item: string; why: "name" | "per month" } | null = null;
  let recurringTotal = 0;
  for (const line of items) {
    const name = text(line.name);
    const why = name && recurringNames.has(itemKey(name)) ? "name" : /per\s+month/i.test(text(line.description)) ? "per month" : null;
    if (!why) continue;
    first ??= { item: name || text(line.description).slice(0, 80), why };
    recurringTotal += money(line.total);
  }
  return first ? { ...first, recurringTotal: Math.round(recurringTotal * 100) / 100 } : null;
}

/** Commercial in Markate is type_service 2. */
export const isCommercial = (customer: MarkateCustomer) => text(customer.type_service) === "2";

export const estimateTotal = (estimate: MarkateEstimate) => money(estimate.total);
