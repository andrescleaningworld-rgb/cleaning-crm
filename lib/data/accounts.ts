// Accounts and the onboarding checklist. DATA_SOURCE_ACCOUNTS decides
// whether a call goes to Google Sheets (default, today's behavior) or to
// Postgres. Function names and return shapes are identical on both sides,
// and so is which fields each one may return: the customer-safe shape never
// carries key/alarm info, revenue, pay or margin.

import { isPostgres } from "@/lib/dataSource";
import * as sheets from "@/lib/googleSheets";
import * as pg from "@/lib/pg/accounts";

export type { AccountFieldsUpdateResult, AccountSummary, RawAccountForSubEnrichment } from "@/lib/googleSheets";

const source = () => (isPostgres("ACCOUNTS") ? pg : sheets);

/** True when account reads and writes are handled by Postgres instead of Sheets / Apps Script. */
export const accountsOnPostgres = () => isPostgres("ACCOUNTS");

export const getMainAccountById: typeof sheets.getMainAccountById = (...args) => source().getMainAccountById(...args);
export const fetchAllMainAccounts: typeof sheets.fetchAllMainAccounts = () => source().fetchAllMainAccounts();
export const getMainAccountByName: typeof sheets.getMainAccountByName = (...args) => source().getMainAccountByName(...args);
export const setAccountChecklistNeeded: typeof sheets.setAccountChecklistNeeded = (...args) =>
  source().setAccountChecklistNeeded(...args);

export const getAllAccountsForSubEnrichment: typeof sheets.getAllAccountsForSubEnrichment = () =>
  source().getAllAccountsForSubEnrichment();
export const getAccountSummaryById: typeof sheets.getAccountSummaryById = (...args) => source().getAccountSummaryById(...args);
export const getAccountSummariesByIds: typeof sheets.getAccountSummariesByIds = (...args) =>
  source().getAccountSummariesByIds(...args);
export const updateAccountFieldsDirect: typeof sheets.updateAccountFieldsDirect = (...args) =>
  source().updateAccountFieldsDirect(...args);

export const fetchOnboardingChecklist: typeof sheets.fetchOnboardingChecklist = (...args) =>
  source().fetchOnboardingChecklist(...args);
export const setOnboardingChecklistItem: typeof sheets.setOnboardingChecklistItem = (...args) =>
  source().setOnboardingChecklistItem(...args);
export const markOnboardingAutoStableApplied: typeof sheets.markOnboardingAutoStableApplied = (...args) =>
  source().markOnboardingAutoStableApplied(...args);

// Postgres-only: the Apps Script account lists and saves, rebuilt (see
// lib/pg/accounts.ts). Callers use them only when accountsOnPostgres();
// otherwise they keep calling Apps Script as before.
export const getAccountsAppsScriptShape = pg.getAccountsAppsScriptShape;
export const addAccount = pg.addAccount;
export const updateAccountFromPayload = pg.updateAccountFromPayload;
