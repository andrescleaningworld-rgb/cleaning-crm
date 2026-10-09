// Reads compared by `npx tsx scripts/migrate/parity.mts accounts`.
// The report this writes shows field paths and values for any difference;
// every read here is either a customer-safe shape or reduced to counts /
// hashes first, so no key code, revenue or pay can land in the report.
import crypto from "node:crypto";
import type { ParityRead } from "../parity.mts";
import {
  fetchAllMainAccounts,
  fetchOnboardingChecklist,
  getAccountSummariesByIds,
  getAccountSummaryById,
  getAllAccountsForSubEnrichment,
  getMainAccountById,
  getMainAccountByName,
} from "../../../lib/data/accounts";

export const AREA = "ACCOUNTS";

const hash = (value: unknown) => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex").slice(0, 16);
const ids = async () => (await fetchAllMainAccounts()).map((a) => a.accountId);

export const reads: ParityRead[] = [
  { name: "fetchAllMainAccounts (customer-safe shape)", run: () => fetchAllMainAccounts() },
  { name: "getMainAccountById(every 10th)", run: async () => Promise.all((await ids()).filter((_, i) => i % 10 === 0).map((id) => getMainAccountById(id))) },
  { name: "getMainAccountById(padded id)", run: async () => getMainAccountById(`  ${(await ids())[0]}  `) },
  { name: "getMainAccountById(missing)", run: () => getMainAccountById("no-such-account-id") },
  {
    name: "getMainAccountByName(every 10th, odd casing)",
    run: async () => Promise.all((await fetchAllMainAccounts()).filter((_, i) => i % 10 === 0).map((a) => getMainAccountByName(` ${a.accountName.toUpperCase()} `))),
  },
  { name: "getMainAccountByName(missing)", run: () => getMainAccountByName("No Such Account Name") },
  // Sheets returns one entry per sheet row, blank rows included (443 of
  // them); those entries are all-empty and every caller skips them. Compare
  // the entries that have anything in them, in order, as hashes (they carry
  // revenue and pay).
  {
    name: "getAllAccountsForSubEnrichment (non-empty rows, hashed)",
    run: async () => (await getAllAccountsForSubEnrichment()).filter((row) => Object.values(row).some((v) => String(v).trim() !== "")).map(hash),
  },
  { name: "getAccountSummaryById(every 10th)", run: async () => Promise.all((await ids()).filter((_, i) => i % 10 === 0).map((id) => getAccountSummaryById(id))) },
  { name: "getAccountSummaryById(missing / blank)", run: async () => [await getAccountSummaryById("no-such-id"), await getAccountSummaryById("  ")] },
  {
    name: "getAccountSummariesByIds(all + a missing one)",
    run: async () => [...(await getAccountSummariesByIds([...(await ids()), "no-such-id", ""])).entries()].sort((a, b) => a[0].localeCompare(b[0])),
  },
  // Checklists: ids come from Postgres on purpose (a fixed list for both
  // sides), plus one account that has none.
  {
    name: "fetchOnboardingChecklist(each known + one without)",
    run: async () => {
      const { getSql } = await import("../../../lib/db");
      const known = (await getSql()`SELECT account_id FROM onboarding_checklists WHERE source_sheet IS NOT NULL ORDER BY source_row`) as { account_id: string }[];
      return Promise.all([...known.map((k) => k.account_id), "no-such-account-id"].map((id) => fetchOnboardingChecklist(id)));
    },
  },
];
