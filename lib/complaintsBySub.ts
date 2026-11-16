// Which accounts and complaints belong to a sub. Moved out of
// app/subcontractors/[id]/page.tsx unchanged, so the Complaints page's Sub
// filter uses the same rule as the sub's page (Recent Complaints): a complaint
// that has its sub saved (subAtFiling) belongs to the sub who had the account
// when it was filed; one without it counts for the account's sub of today.
// Client-safe: no server-only imports.

import { buildSubcontractorPerformanceKey, normalizeSubName, resolveAssignedSubKey } from "./subAccountMatching";

type Row = Record<string, unknown>;

function clean(value: unknown) {
  return String(value ?? "").trim();
}

/** The first of these keys that has a value, trimmed ("" when none does). */
export function readField(row: Row, possibleKeys: string[]) {
  for (const key of possibleKeys) {
    const value = row[key];
    if (value !== undefined && value !== null && value !== "") return clean(value);
  }
  return "";
}

export function subIdOf(sub: Row) {
  return readField(sub, ["id", "ID", "subcontractorId", "Subcontractor ID"]);
}

export function subCompanyName(sub: Row) {
  return readField(sub, ["companyName", "CompanyName", "Company Name", "company", "Company", "name", "Name"]) || "Unnamed Subcontractor";
}

export function subContactName(sub: Row) {
  return readField(sub, ["contactName", "ContactName", "Contact Name"]);
}

export function accountNameOf(account: Row) {
  return readField(account, ["accountName", "Account Name", "account", "Account", "customer", "Customer", "name", "Name"]) || "-";
}

export function accountSubOf(account: Row) {
  return readField(account, [
    "subcontractor",
    "Subcontractor",
    "subContractor",
    "Sub Contractor",
    "cleaner",
    "Cleaner",
    "assignedSubcontractor",
    "Assigned Subcontractor",
  ]);
}

export function complaintAccountOf(complaint: Row) {
  return readField(complaint, ["account", "Account", "accountName", "Account Name"]);
}

function subKeyOf(sub: Row) {
  return buildSubcontractorPerformanceKey(subCompanyName(sub), subContactName(sub));
}

function subEntriesOf(subs: Row[]) {
  return subs.map((sub) => ({
    key: subKeyOf(sub),
    company: normalizeSubName(subCompanyName(sub)),
    contact: normalizeSubName(subContactName(sub)),
  }));
}

/**
 * The accounts whose Subcontractor resolves to this sub. Ambiguity-safe (see
 * lib/subAccountMatching.ts): each raw Subcontractor string resolves to at
 * most one sub, checked against ALL loaded subs, so a name two subs share is
 * left to no one rather than guessed onto both.
 */
export function accountsOfSub<A extends Row>(accounts: A[], subs: Row[], sub: Row | undefined): A[] {
  if (!sub) return [];
  const subEntries = subEntriesOf(subs);
  const currentSubKey = subKeyOf(sub);
  const resolveCache = new Map<string, string>();

  return accounts.filter((account) => {
    const raw = accountSubOf(account);
    if (!raw) return false;
    let resolvedKey = resolveCache.get(raw);
    if (resolvedKey === undefined) {
      resolvedKey = resolveAssignedSubKey(raw, subEntries);
      resolveCache.set(raw, resolvedKey);
    }
    return resolvedKey === currentSubKey;
  });
}

/**
 * The complaints filed while this sub had the account (the same rule as the
 * score). `subAccounts` is accountsOfSub(...) for this sub.
 */
export function complaintsOfSub<C extends Row>(complaints: C[], subAccounts: Row[], subs: Row[], sub: Row | undefined): C[] {
  const accountNames = new Set(subAccounts.map((account) => accountNameOf(account).toLowerCase()));
  const subEntries = subEntriesOf(subs);
  const thisSubKey = sub ? subKeyOf(sub) : "";

  return complaints.filter((complaint) => {
    const saved = (complaint as { subAtFiling?: string | null }).subAtFiling;
    if (typeof saved === "string") return saved.trim() !== "" && resolveAssignedSubKey(saved, subEntries) === thisSubKey;
    return accountNames.has(complaintAccountOf(complaint).toLowerCase());
  });
}
