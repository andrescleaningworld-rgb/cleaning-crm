// Who holds an account's key: a typed name, linked to a sub or a staff
// member only when it is exactly one person's name. Never a guess: a name
// that matches nobody, or more than one person, is kept as typed and left
// unlinked. Shared by the save (lib/pg/accounts.ts) and the one-time key
// sheet import (scripts/import/keys-import.mts). No server-only imports.

import { normalizeSubName } from "@/lib/subAccountMatching";

export type KeyHolderPeople = {
  subs: { id: string; contactName: string; companyName: string }[];
  staff: { id: string; name: string }[];
};

export type KeyHolderLink = {
  subId: string | null;
  staffId: string | null;
  /** "sub" / "staff": linked. "none": no one by that name. "several": more than one person, so not linked. */
  match: "sub" | "staff" | "none" | "several";
  /** The matched person's name as it is on file, for the preview. */
  matchedName: string;
};

/**
 * Exact name match only (case, spaces, punctuation, "&"/"and" and
 * LLC/Inc ignored). A sub matches by contact name or company name.
 */
export function linkKeyHolder(name: string, people: KeyHolderPeople): KeyHolderLink {
  const wanted = normalizeSubName(name);
  if (!wanted) return { subId: null, staffId: null, match: "none", matchedName: "" };
  const subs = people.subs.filter((s) => normalizeSubName(s.contactName) === wanted || normalizeSubName(s.companyName) === wanted);
  const staff = people.staff.filter((s) => normalizeSubName(s.name) === wanted);
  if (subs.length + staff.length > 1) return { subId: null, staffId: null, match: "several", matchedName: "" };
  if (subs.length === 1) {
    const sub = subs[0];
    return { subId: sub.id, staffId: null, match: "sub", matchedName: sub.contactName || sub.companyName };
  }
  if (staff.length === 1) return { subId: null, staffId: staff[0].id, match: "staff", matchedName: staff[0].name };
  return { subId: null, staffId: null, match: "none", matchedName: "" };
}

/** Letters and digits; the same set the Keys tab always used. */
const KEY_CODE_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

export function randomKeyCode(length = 4): string {
  const bytes = new Uint32Array(length);
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes, (n) => KEY_CODE_CHARS[n % KEY_CODE_CHARS.length]).join("");
}
