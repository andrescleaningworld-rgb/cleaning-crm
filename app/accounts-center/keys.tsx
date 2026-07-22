"use client";

import { useEffect, useMemo, useState } from "react";

// Raw pass-through account shape — kept loose (index signature) so a save
// can spread the full record back to /api/accounts without dropping fields
// the Apps Script backend expects on every write (see handleSubmit in
// app/accounts/[id]/edit/page.tsx, which does the same full-object spread).
type RawAccount = {
  accountId?: string;
  id?: string;
  rowNumber?: string | number;
  accountName?: string;
  subcontractor?: string;
  keyAlarmAccessInfo?: string;
  [key: string]: unknown;
};

type Subcontractor = {
  id?: string;
  subcontractorId?: string;
  name?: string;
  subcontractor?: string;
  subcontractorName?: string;
  companyName?: string;
  contactName?: string;
  displayName?: string;
  dropdownLabel?: string;
  email?: string;
};

type SubcontractorOption = { value: string; label: string };

function clean(value: unknown): string {
  return String(value ?? "").trim();
}

function getAccountId(account: RawAccount): string {
  return clean(account.accountId ?? account.id ?? account.rowNumber);
}

// KeyCode is a new column that may not exist in the backend yet — read/write
// under a few common key-name variants for the best chance of round-tripping
// once it does, matching the redundant-key convention already used in
// app/api/complaints/route.ts for the same reason.
function getKeyCode(account: RawAccount): string {
  return clean(account.KeyCode ?? account.keyCode ?? account["Key Code"]);
}

function getHasCopy(account: RawAccount): boolean {
  const value = clean(account.Copy ?? account.copy ?? account["Has Copy"]).toLowerCase();
  return value === "yes" || value === "true" || value === "1";
}

const KEY_CODE_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

function generateKeyCode(): string {
  let code = "";
  for (let i = 0; i < 4; i++) {
    code += KEY_CODE_CHARS[Math.floor(Math.random() * KEY_CODE_CHARS.length)];
  }
  return code;
}

// Mirrors app/accounts/[id]/edit/page.tsx's subcontractor dropdown helpers
// exactly (same display format, same dropdown-value vs. submitted-name
// split) since that's the only place a "Cleaner"-equivalent field already
// saves successfully — those helpers aren't exported, so the minimal logic
// is duplicated here rather than importing the whole edit page.
function getSubcontractorDisplayName(sub: Subcontractor): string {
  const contactName = clean(sub.contactName || sub.name || sub.subcontractorName);
  const companyName = clean(sub.companyName || sub.subcontractor);
  if (contactName && companyName) return `${contactName} — ${companyName}`;
  return clean(sub.displayName) || clean(sub.dropdownLabel) || contactName || companyName || clean(sub.email);
}

function getSubcontractorDropdownValue(sub: Subcontractor): string {
  return clean(sub.id || sub.subcontractorId || sub.email || getSubcontractorDisplayName(sub));
}

function getSubcontractorSubmitName(sub: Subcontractor): string {
  const contactName = clean(sub.contactName || sub.name || sub.subcontractorName);
  return contactName || getSubcontractorDisplayName(sub);
}

function resolveSubcontractorForSubmit(selectedValue: string, subcontractors: Subcontractor[]): string {
  const trimmed = clean(selectedValue);
  if (!trimmed) return trimmed;
  const match = subcontractors.find((sub) => getSubcontractorDropdownValue(sub) === trimmed);
  return match ? getSubcontractorSubmitName(match) : trimmed;
}

async function readJson<T>(response: Response): Promise<T> {
  const text = await response.text();
  if (!text.trim()) return {} as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    return {} as T;
  }
}

export default function AccountsCenterKeys() {
  const [accounts, setAccounts] = useState<RawAccount[]>([]);
  const [subcontractors, setSubcontractors] = useState<Subcontractor[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [savingId, setSavingId] = useState("");
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({});

  async function loadData() {
    setLoading(true);
    setError("");
    try {
      const [accountsResponse, subsResponse] = await Promise.all([
        fetch("/api/accounts", { cache: "no-store" }),
        fetch("/api/subcontractors", { cache: "no-store" }),
      ]);

      const accountsData = await readJson<{ success?: boolean; accounts?: RawAccount[]; data?: RawAccount[] }>(
        accountsResponse
      );
      if (!accountsResponse.ok || accountsData.success === false) {
        throw new Error("Could not load accounts.");
      }
      setAccounts(accountsData.accounts ?? accountsData.data ?? []);

      const subsData = await readJson<{
        success?: boolean;
        subcontractors?: Subcontractor[];
        subs?: Subcontractor[];
        data?: Subcontractor[];
      }>(subsResponse);
      setSubcontractors(subsData.subcontractors ?? subsData.subs ?? subsData.data ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong loading keys.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  const subcontractorOptions = useMemo<SubcontractorOption[]>(() => {
    return subcontractors
      .map((sub) => ({ value: getSubcontractorDropdownValue(sub), label: getSubcontractorDisplayName(sub) }))
      .filter((option) => option.value)
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [subcontractors]);

  const filteredAccounts = useMemo(() => {
    const q = search.toLowerCase().trim();
    const filtered = q ? accounts.filter((account) => clean(account.accountName).toLowerCase().includes(q)) : accounts;
    return [...filtered].sort((a, b) => clean(a.accountName).localeCompare(clean(b.accountName)));
  }, [accounts, search]);

  async function saveAccountFields(account: RawAccount, fields: Record<string, unknown>) {
    const accountId = getAccountId(account);
    setSavingId(accountId);
    setRowErrors((prev) => ({ ...prev, [accountId]: "" }));
    try {
      const response = await fetch("/api/accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "updateAccountFields",
          accountId,
          fields,
        }),
      });
      const data = await readJson<{ success?: boolean; error?: string }>(response);
      if (!response.ok || data.success === false) {
        throw new Error(data.error || "Could not save changes.");
      }
      setAccounts((prev) => prev.map((a) => (getAccountId(a) === accountId ? { ...a, ...fields } : a)));
    } catch (err) {
      setRowErrors((prev) => ({
        ...prev,
        [accountId]: err instanceof Error ? err.message : "Could not save changes.",
      }));
    } finally {
      setSavingId("");
    }
  }

  function handleGenerateCode(account: RawAccount) {
    const code = generateKeyCode();
    void saveAccountFields(account, { KeyCode: code, keyCode: code, "Key Code": code });
  }

  function handleCleanerChange(account: RawAccount, selectedValue: string) {
    const submitName = resolveSubcontractorForSubmit(selectedValue, subcontractors);
    void saveAccountFields(account, { subcontractor: submitName });
  }

  function handleCopyToggle(account: RawAccount, nextChecked: boolean) {
    const value = nextChecked ? "Yes" : "No";
    void saveAccountFields(account, { Copy: value, copy: value, "Has Copy": value });
  }

  return (
    <main className="min-h-screen bg-gray-50 p-4 text-gray-900 sm:p-6">
      <div className="mx-auto max-w-7xl space-y-6">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-blue-600">Cleaning World</p>
          <h1 className="mt-2 text-3xl font-bold sm:text-4xl">Keys</h1>
          <p className="mt-2 text-sm leading-6 text-gray-500 sm:text-base">
            Key codes, the cleaner holding each physical copy, and account access info.
          </p>
        </div>

        <section className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by account name..."
            className="w-full max-w-sm rounded-xl border border-gray-300 px-4 py-2.5 text-sm outline-none focus:border-blue-500"
          />
        </section>

        {error ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-5 font-bold text-red-700">{error}</div>
        ) : null}

        <section className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm sm:p-5">
          {loading ? (
            <p className="text-sm text-gray-600">Loading keys...</p>
          ) : filteredAccounts.length === 0 ? (
            <p className="text-sm text-gray-600">No accounts found.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
                    <th className="p-3">Key Code</th>
                    <th className="p-3">Account</th>
                    <th className="p-3">Cleaner</th>
                    <th className="p-3">Copy</th>
                    <th className="p-3">Key / Alarm / Access Info</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredAccounts.map((account) => {
                    const accountId = getAccountId(account);
                    const keyCode = getKeyCode(account);
                    const hasCopy = getHasCopy(account);
                    const isSaving = savingId === accountId;
                    const rowError = rowErrors[accountId];

                    return (
                      <tr key={accountId || clean(account.accountName)} className="border-b align-top last:border-b-0">
                        <td className="p-3 font-mono font-bold">
                          {keyCode ? (
                            keyCode
                          ) : (
                            <button
                              type="button"
                              disabled={isSaving}
                              onClick={() => handleGenerateCode(account)}
                              className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-blue-700 disabled:opacity-60"
                            >
                              {isSaving ? "Generating..." : "Generate code"}
                            </button>
                          )}
                        </td>
                        <td className="p-3">
                          <div className="font-semibold">{clean(account.accountName) || "-"}</div>
                          {rowError ? <div className="mt-1 text-xs font-semibold text-red-600">{rowError}</div> : null}
                        </td>
                        <td className="p-3">
                          <select
                            value={clean(account.subcontractor)}
                            disabled={isSaving}
                            onChange={(e) => handleCleanerChange(account, e.target.value)}
                            className="w-full min-w-[180px] rounded-lg border border-gray-300 px-2 py-1.5 text-sm outline-none focus:border-blue-500"
                          >
                            <option value="">Unassigned</option>
                            {subcontractorOptions.map((option) => (
                              <option key={option.value} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="p-3 text-center">
                          <input
                            type="checkbox"
                            checked={hasCopy}
                            disabled={isSaving}
                            onChange={(e) => handleCopyToggle(account, e.target.checked)}
                            className="h-4 w-4"
                          />
                        </td>
                        <td className="min-w-[220px] p-3">{clean(account.keyAlarmAccessInfo) || "-"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
