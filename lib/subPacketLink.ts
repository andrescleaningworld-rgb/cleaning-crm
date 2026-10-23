// The Sub Packet as a link (/sub-packet/<token>): opens with no login, like
// the packet email. Server only. Used by "Send Sub Packet" (Text / Copy link
// / QR) and read by app/sub-packet/[token].
//
// How the link is protected (no database row):
//   - The token carries the account, the sub it was made for, the language
//     and an end date, signed with HMAC-SHA256. The key comes from
//     SUB_SESSION_PASSWORD (a secret already set; nothing new to set up),
//     under its own label, so it is no use for anything else.
//   - Without the key nobody can make or change a token, and it cannot be
//     guessed: the signature is 128 bits.
//   - It stops working after SUB_PACKET_LINK_DAYS, when the account gets
//     another sub, or when the account is deleted. Changing
//     SUB_SESSION_PASSWORD ends every link (and logs every sub out).
//   - Each opening reads the account fresh, so it always shows the packet
//     as it is now, never the revenue, the margin or the internal Notes.

import { createHmac, hkdfSync, timingSafeEqual } from "node:crypto";
import { loadSubPacketInfo, subPacketData } from "@/lib/pg/sub-packet";
import { isSubPacketLang, type SubPacketData, type SubPacketLang } from "@/lib/subPacket";

export const SUB_PACKET_LINK_DAYS = 90;
export const SUB_PACKET_LINK_PATH = "/sub-packet";

type Claims = { a: string; s: string; l: SubPacketLang; e: number };

function key(): Buffer {
  const secret = process.env.SUB_SESSION_PASSWORD ?? "";
  if (secret.length < 32) throw new Error("SUB_SESSION_PASSWORD must be set and at least 32 characters.");
  return Buffer.from(hkdfSync("sha256", secret, "cleaning-crm", "sub-packet-link-v1", 32));
}

const sign = (body: string) => createHmac("sha256", key()).update(body).digest().subarray(0, 16).toString("base64url");

/** Who the packet is for: the sub's id, or its name when the account has only a name on file. */
export const subKeyOf = (info: { subId: string; subName: string }) => info.subId || `name:${info.subName.trim().toLowerCase()}`;

export function subPacketToken(accountId: string, subKey: string, lang: SubPacketLang, now = Date.now()): string {
  const claims: Claims = { a: accountId, s: subKey, l: lang, e: Math.floor(now / 1000) + SUB_PACKET_LINK_DAYS * 86_400 };
  const body = Buffer.from(JSON.stringify(claims)).toString("base64url");
  return `${body}.${sign(body)}`;
}

/** The claims of a good, unexpired token; null otherwise. The caller still checks the account's sub. */
export function readSubPacketToken(token: string, now = Date.now()): Claims | null {
  const [body, signature, extra] = token.split(".");
  if (!body || !signature || extra !== undefined) return null;
  const expected = Buffer.from(sign(body));
  const given = Buffer.from(signature);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  try {
    const claims = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as Partial<Claims>;
    if (typeof claims.a !== "string" || typeof claims.s !== "string" || !isSubPacketLang(claims.l) || typeof claims.e !== "number") return null;
    if (claims.e * 1000 < now) return null;
    return claims as Claims;
  } catch {
    return null;
  }
}

export const subPacketLinkUrl = (origin: string, token: string) => `${origin.replace(/\/$/, "")}${SUB_PACKET_LINK_PATH}/${token}`;

/**
 * The packet a link opens, filled from the account as it is now. null when the
 * link is bad or ended, the account is gone, or the account has another sub.
 */
export async function subPacketForToken(token: string, origin: string): Promise<SubPacketData | null> {
  const claims = readSubPacketToken(token);
  if (!claims) return null;
  const info = await loadSubPacketInfo(claims.a);
  if (!info || !info.subName || subKeyOf(info) !== claims.s) return null;
  return subPacketData(info, claims.l, origin);
}

/** The link pages are never cached or indexed, and the token is not passed on to the map or other links. */
export const PACKET_PAGE_HEADERS = {
  "Cache-Control": "private, no-store",
  "X-Robots-Tag": "noindex, nofollow",
  "Referrer-Policy": "no-referrer",
};

const GONE_HTML =
  `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" />` +
  `<title>Cleaning World</title></head><body style="margin:0;padding:32px 20px;font-family:Arial,Helvetica,sans-serif;color:#0f172a;background:#ffffff;line-height:1.6;">` +
  `<p><strong>This link no longer works.</strong> Ask your Cleaning World manager for a new one.</p>` +
  `<p><strong>Este enlace ya no funciona.</strong> Pida uno nuevo a su gerente de Cleaning World.</p>` +
  `<p><strong>Este link não funciona mais.</strong> Peça um novo ao seu gerente da Cleaning World.</p>` +
  `</body></html>`;

/** What a bad, ended or no longer valid link shows (the same in all three languages). */
export function packetLinkGone(status = 404): Response {
  return new Response(GONE_HTML, { status, headers: { ...PACKET_PAGE_HEADERS, "Content-Type": "text/html; charset=utf-8" } });
}
