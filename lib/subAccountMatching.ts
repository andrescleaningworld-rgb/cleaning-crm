// Ambiguity-safe subcontractor-name matching. Extracted out of
// lib/googleSheets.ts unchanged so it can also be imported by
// app/subcontractors/[id]/page.tsx, a client component — this module must
// stay free of server-only imports (googleapis, process.env secrets) so it's
// safe to bundle for the browser.

export function normalizeSubName(value: unknown): string {
  return String(value ?? "")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/\bllc\b/g, "")
    .replace(/\binc\b/g, "")
    .replace(/\bcorp\b/g, "")
    .replace(/\bcorporation\b/g, "")
    .replace(/\bcompany\b/g, "")
    .replace(/\bco\b/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Base match shape is the same as namesMatch (app/api/subcontractors/route.ts)
// and subcontractorAccounts (app/subcontractors/[id]/page.tsx) — substring
// match both directions against company name AND contact name, length-guarded
// so a short fragment (e.g. "co") doesn't loosely match everything. But
// unlike those two (which each test one known subcontractor in isolation),
// this is resolved globally across ALL subcontractors per distinct raw
// Accounts-tab value below, because the roster has real contact-name
// prefix collisions (e.g. "Cesar" vs "Cesar Decarvalho", "Giovanna" vs
// "Alonso & Giovanna Mendoza"): an account whose field is literally "Cesar"
// is a substring-match against both, and resolving each subcontractor
// independently — the first version of this fix did — silently
// double-counted every one of that subcontractor's accounts, visits, and
// complaints onto the unrelated one too. An exact match always wins over a
// substring one; if either the exact or the fallback substring pass still
// resolves to more than one subcontractor, the account is left unassigned
// rather than guessed.
function subAssignmentMatches(assignedSub: string, candidate: string): boolean {
  if (!assignedSub || !candidate) return false;
  if (assignedSub === candidate) return true;
  if (assignedSub.length >= 4 && candidate.includes(assignedSub)) return true;
  if (candidate.length >= 4 && assignedSub.includes(candidate)) return true;
  return false;
}

export type ResolvedSubKey = {
  key: string;
  // How many subcontractors the raw name plausibly refers to at whichever
  // tier (exact/fuzzy) produced the result: 0 = no match at all, 1 = the
  // resolved match, >1 = ambiguous (key is "" in that case). Exists so a
  // caller that needs to log/report an unresolved or ambiguous lookup (e.g.
  // findSubcontractorPhoneByName/EmailByName) doesn't have to re-run its own
  // copy of the exact/fuzzy matching to find out why it got "".
  candidateCount: number;
};

function resolveAssignedSub(
  assignedSubRaw: string,
  subEntries: { key: string; company: string; contact: string }[]
): ResolvedSubKey {
  const assignedSub = normalizeSubName(assignedSubRaw);
  if (!assignedSub) return { key: "", candidateCount: 0 };

  const exact = subEntries.filter((e) => assignedSub === e.company || assignedSub === e.contact);
  if (exact.length === 1) return { key: exact[0].key, candidateCount: 1 };
  if (exact.length > 1) return { key: "", candidateCount: exact.length };

  const fuzzy = subEntries.filter(
    (e) => subAssignmentMatches(assignedSub, e.company) || subAssignmentMatches(assignedSub, e.contact)
  );
  return { key: fuzzy.length === 1 ? fuzzy[0].key : "", candidateCount: fuzzy.length };
}

export function resolveAssignedSubKey(
  assignedSubRaw: string,
  subEntries: { key: string; company: string; contact: string }[]
): string {
  return resolveAssignedSub(assignedSubRaw, subEntries).key;
}

// Same resolution as resolveAssignedSubKey, plus the candidate count behind
// an unresolved ("") result — for callers that need to distinguish "no
// match" from "ambiguous" for logging (see ResolvedSubKey's comment).
export function resolveAssignedSubKeyWithCandidateCount(
  assignedSubRaw: string,
  subEntries: { key: string; company: string; contact: string }[]
): ResolvedSubKey {
  return resolveAssignedSub(assignedSubRaw, subEntries);
}

// Join key for merging this map onto the Apps Script's getSubcontractors
// list. NOT the Subcontractors sheet's own "Subcontractor ID" column
// (confirmed live: the sheet also has a defunct duplicate "ID" header at
// column P, blank on most rows; the Apps Script's own id lookup checks
// "ID" before "Subcontractor ID" and — because of how its header-map
// building silently lets a later duplicate header win — picks up that
// blank column first, so its id/subcontractorId fields are actually
// "SUB-ROW-<n>" row-position fallbacks for most rows, not the real
// Subcontractor ID, and unpredictably the real one for a handful of others
// with legacy data in column P. Company name + contact name are each
// read via a single unambiguous header on both sides, so composing a key
// from both (handles the few subcontractors that share a company name
// across multiple contacts, e.g. "Cleaning World") is the reliable join.
export function buildSubcontractorPerformanceKey(companyName: unknown, contactName: unknown): string {
  return `${normalizeSubName(companyName)}|${normalizeSubName(contactName)}`;
}
