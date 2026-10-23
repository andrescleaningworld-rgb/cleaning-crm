// The customer check-in link: /checkin/<token>. Opens with no login. Server
// only. Same protection as the sub packet link (lib/subPacketLink.ts):
//   - the token carries the check-in's id and an end date, signed with
//     HMAC-SHA256 (128-bit signature) under its own label, with a key from
//     PORTAL_SESSION_PASSWORD (the customer portal's secret; nothing new to
//     set up). Without the key nobody can make or change one, or guess one.
//   - it stops working after CHECKIN_LINK_DAYS.
// Id 0 is "Send me a test": it shows the pages, and nothing is saved.

import { createHmac, hkdfSync, timingSafeEqual } from "node:crypto";

export const CHECKIN_LINK_DAYS = 60;
export const CHECKIN_PATH = "/checkin";

function key(): Buffer {
  const secret = process.env.PORTAL_SESSION_PASSWORD || process.env.SUB_SESSION_PASSWORD || "";
  if (secret.length < 32) throw new Error("PORTAL_SESSION_PASSWORD must be set and at least 32 characters.");
  return Buffer.from(hkdfSync("sha256", secret, "cleaning-crm", "customer-checkin-v1", 32));
}

const sign = (body: string) => createHmac("sha256", key()).update(body).digest().subarray(0, 16).toString("base64url");

export function checkinToken(checkinId: number, now = Date.now()): string {
  const body = Buffer.from(JSON.stringify({ c: checkinId, e: Math.floor(now / 1000) + CHECKIN_LINK_DAYS * 86_400 })).toString("base64url");
  return `${body}.${sign(body)}`;
}

/** The check-in id of a good, unexpired token (0 = the test); null otherwise. */
export function readCheckinToken(token: string, now = Date.now()): number | null {
  const [body, signature, extra] = token.split(".");
  if (!body || !signature || extra !== undefined) return null;
  const expected = Buffer.from(sign(body));
  const given = Buffer.from(signature);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  try {
    const claims = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as { c?: unknown; e?: unknown };
    if (typeof claims.c !== "number" || !Number.isInteger(claims.c) || claims.c < 0 || typeof claims.e !== "number") return null;
    return claims.e * 1000 < now ? null : claims.c;
  } catch {
    return null;
  }
}

export const checkinUrl = (origin: string, token: string, action: "up" | "down" | "stop") => `${origin.replace(/\/$/, "")}${CHECKIN_PATH}/${token}?a=${action}`;
