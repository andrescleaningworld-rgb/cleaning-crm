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
import { getAccountSummaryById, getAccountSummariesByIds, type AccountSummary } from "@/lib/googleSheets";

export type { AccountSummary };

export async function lookupAccountSummary(accountId: string): Promise<AccountSummary | null> {
  return getAccountSummaryById(accountId);
}

export async function lookupAccountSummaries(accountIds: string[]): Promise<Map<string, AccountSummary>> {
  return getAccountSummariesByIds(accountIds);
}
