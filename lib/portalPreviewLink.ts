// "Share this preview" (the View as customer bar): a private link to the
// read-only customer portal of ONE account, for someone with no login (the
// owner's boss). Server only. No table of its own:
//   - the link carries the account, when it was made and when it ends (7
//     days), signed with HMAC-SHA256 under its own label, with a key from
//     PORTAL_SESSION_PASSWORD (same protection as lib/checkinLink.ts). Without
//     the key nobody can make, change or guess one.
//   - "Turn off" on the account page writes a line in the activity log; every
//     link of that account made before that moment stops working.
//   - Made / opened / turned off are lines in the staff activity log, entity
//     "portal-preview-link" (not the customer's History).
// Opening /portal-preview?t=<link> (public) checks the link, logs the opening
// and puts it in the cw_portal_share cookie; lib/portalPreview.ts then shows
// that account, read only, with the preview bar and no account switcher.

import { createHmac, hkdfSync, timingSafeEqual } from "node:crypto";
import { getSql } from "@/lib/db";

export const PREVIEW_LINK_DAYS = 7;
export const PREVIEW_LINK_PATH = "/portal-preview";
export const PREVIEW_LINK_ENTITY = "portal-preview-link";
/** The activity-log words, so "made", "opened" and "turned off" can be read back. */
export const LINK_MADE = "Made a preview link";
export const LINK_OPENED = "Preview link opened";
export const LINKS_OFF = "Turned off preview links";

function key(): Buffer {
  const secret = process.env.PORTAL_SESSION_PASSWORD || process.env.SUB_SESSION_PASSWORD || "";
  if (secret.length < 32) throw new Error("PORTAL_SESSION_PASSWORD must be set and at least 32 characters.");
  return Buffer.from(hkdfSync("sha256", secret, "cleaning-crm", "portal-preview-link-v1", 32));
}

const sign = (body: string) => createHmac("sha256", key()).update(body).digest().subarray(0, 16).toString("base64url");

export type PreviewLinkClaims = { accountId: string; madeAt: number; endsAt: number };

/** A new link token for one account. */
export function makePreviewLinkToken(accountId: string, now = Date.now()): { token: string; endsAt: number } {
  const madeAt = Math.floor(now / 1000);
  const endsAt = madeAt + PREVIEW_LINK_DAYS * 86_400;
  const body = Buffer.from(JSON.stringify({ a: accountId, m: madeAt, e: endsAt })).toString("base64url");
  return { token: `${body}.${sign(body)}`, endsAt: endsAt * 1000 };
}

/** The claims of a good, unexpired token (not yet checked against "Turn off"); null otherwise. */
export function readPreviewLinkToken(token: string, now = Date.now()): PreviewLinkClaims | null {
  const [body, signature, extra] = String(token ?? "").split(".");
  if (!body || !signature || extra !== undefined) return null;
  let expected: Buffer;
  try {
    expected = Buffer.from(sign(body));
  } catch {
    return null;
  }
  const given = Buffer.from(signature);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  try {
    const claims = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as { a?: unknown; m?: unknown; e?: unknown };
    if (typeof claims.a !== "string" || !claims.a || typeof claims.m !== "number" || typeof claims.e !== "number") return null;
    if (claims.e * 1000 < now) return null;
    return { accountId: claims.a, madeAt: claims.m * 1000, endsAt: claims.e * 1000 };
  } catch {
    return null;
  }
}

/** When this account's links were last turned off (ms), 0 = never. */
export async function previewLinksOffAt(accountId: string): Promise<number> {
  const rows = (await getSql()`
    SELECT max(created_at) AS at FROM activity_log
    WHERE entity_type = ${PREVIEW_LINK_ENTITY} AND entity_id = ${accountId} AND detail = ${LINKS_OFF}
  `) as { at: string | Date | null }[];
  return rows[0]?.at ? new Date(rows[0].at).getTime() : 0;
}

/** The account a link opens right now: signed, not past its 7 days, and not turned off since it was made. */
export async function activePreviewLink(token: string): Promise<PreviewLinkClaims | null> {
  const claims = readPreviewLinkToken(token);
  if (!claims) return null;
  return claims.madeAt > (await previewLinksOffAt(claims.accountId)) ? claims : null;
}

export const previewLinkUrl = (origin: string, token: string) => `${origin.replace(/\/$/, "")}${PREVIEW_LINK_PATH}?t=${encodeURIComponent(token)}`;

/** For the account page: links still working (made in the last 7 days, after the last Turn off), who made the last one, and the last opening. */
export async function previewLinkStatus(accountId: string): Promise<{ active: number; lastMade: { by: string; at: string } | null; lastOpened: string | null }> {
  const since = new Date(Date.now() - PREVIEW_LINK_DAYS * 86_400_000).toISOString();
  const rows = (await getSql()`
    SELECT actor_name, detail, created_at FROM activity_log
    WHERE entity_type = ${PREVIEW_LINK_ENTITY} AND entity_id = ${accountId}
    ORDER BY created_at DESC LIMIT 200
  `) as { actor_name: string; detail: string | null; created_at: string | Date }[];
  const off = rows.find((row) => row.detail === LINKS_OFF);
  const offAt = off ? new Date(off.created_at).toISOString() : "";
  const made = rows.filter((row) => (row.detail ?? "").startsWith(LINK_MADE));
  const live = made.filter((row) => new Date(row.created_at).toISOString() > since && new Date(row.created_at).toISOString() > offAt);
  const opened = rows.find((row) => row.detail === LINK_OPENED);
  return {
    active: live.length,
    lastMade: made[0] ? { by: made[0].actor_name, at: new Date(made[0].created_at).toISOString() } : null,
    lastOpened: opened ? new Date(opened.created_at).toISOString() : null,
  };
}
