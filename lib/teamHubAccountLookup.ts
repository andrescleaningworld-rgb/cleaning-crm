// The ONLY file in the Team Hub feature that imports from
// lib/googleSheets.ts (direction 7: "every Team Hub read of account data
// goes through ONE function ... so that when Accounts move to Postgres,
// only that function changes"). Every other Team Hub file — lib/teamHubDb.ts,
// every app/api/admin/team-hub/* route, every app/team-hub/* page — imports
// account lookups from HERE, never from lib/googleSheets.ts directly. When
// Accounts move off Sheets, only this file's implementation needs to
// change; every caller's signature stays the same.
//
// Returns name/address/manager for ADMIN display and notifications only —
// never call this from a public (no-login, crew-facing) code path. Team Hub
// tables themselves never store any of these fields (direction 8), only
// the account_id used to look them up here on demand.
import { getAccountSummaryById, getAccountSummariesByIds, getAllSubcontractorsRaw, type AccountSummary } from "@/lib/googleSheets";
import { normalizeSubName, resolveAssignedSubKeyWithCandidateCount } from "@/lib/subAccountMatching";

export type { AccountSummary };

export async function lookupAccountSummary(accountId: string): Promise<AccountSummary | null> {
  return getAccountSummaryById(accountId);
}

export async function lookupAccountSummaries(accountIds: string[]): Promise<Map<string, AccountSummary>> {
  return getAccountSummariesByIds(accountIds);
}

// Simplicity-pass admin wizard ("Who cleans here?" — see
// docs/team-hub-spec.md): resolves an account's free-text Subcontractor
// name (AccountSummary.subcontractorRaw) to a real sub, the same
// ambiguity-safe way lib/subAccountMatching.ts already resolves it
// elsewhere (ties/near-matches never get silently guessed). subId here is
// getAllSubcontractorsRaw's own `id` (usually "SUB-ROW-<n>", a row-position
// id — see that function's comment in lib/googleSheets.ts for why; this
// reuses the SAME id the rest of the app already treats as "the"
// subcontractor id, not a new scheme). "unmatched" covers both "no raw
// name at all" and "raw name present but ambiguous/no fuzzy match" — the
// wizard shows "Pick the sub" for both, so the caller doesn't need to tell
// them apart.
export type TeamHubAssignedSub =
  | { status: "matched"; subId: string; subName: string }
  | { status: "unmatched"; options: { subId: string; name: string }[] };

export async function lookupAssignedSubForAccount(accountId: string): Promise<TeamHubAssignedSub> {
  const account = await getAccountSummaryById(accountId);
  const subs = await getAllSubcontractorsRaw();
  const options = subs
    .map((s) => ({ subId: s.id, name: s.companyName || s.contactName }))
    .filter((o) => o.name);

  if (!account?.subcontractorRaw) {
    return { status: "unmatched", options };
  }

  const entries = subs.map((s) => ({ key: s.id, company: normalizeSubName(s.companyName), contact: normalizeSubName(s.contactName) }));
  const resolved = resolveAssignedSubKeyWithCandidateCount(account.subcontractorRaw, entries);

  if (resolved.candidateCount === 1) {
    const match = subs.find((s) => s.id === resolved.key);
    if (match) {
      return { status: "matched", subId: match.id, subName: match.companyName || match.contactName };
    }
  }

  return { status: "unmatched", options };
}

// Phase 6 (Sub Center read-only list): resolves hub_crews.sub_id values
// (getAllSubcontractorsRaw's own "SUB-ROW-<n>" id scheme — see that
// function's comment) back to display names, for the subIds that own a
// Team Hub crew (lib/teamHubDb.ts's listTeamHubSubCrewSites). Not scoped/filtered — a small, rarely-
// called admin list, same cost tradeoff already accepted for
// lookupAssignedSubForAccount.
export async function lookupSubcontractorNames(subIds: string[]): Promise<Map<string, string>> {
  const subs = await getAllSubcontractorsRaw();
  const byId = new Map(subs.map((s) => [s.id, s.companyName || s.contactName]));
  const result = new Map<string, string>();
  for (const subId of subIds) {
    result.set(subId, byId.get(subId) ?? subId);
  }
  return result;
}
