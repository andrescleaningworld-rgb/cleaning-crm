"use client";

import { useEffect, useMemo, useState } from "react";
import { BigButton, Card, CardList, EmptyState, ErrorBox, Screen, SearchBar, SelectField, SkeletonList } from "@/app/ui";

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

  const cleanerSelect = (account: RawAccount, isSaving: boolean) => (
    <SelectField
      label="Cleaner"
      value={clean(account.subcontractor)}
      disabled={isSaving}
      onChange={(e) => handleCleanerChange(account, e.target.value)}
    >
      <option value="">Unassigned</option>
      {subcontractorOptions.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </SelectField>
  );

  const copyCheck = (account: RawAccount, isSaving: boolean) => (
    <label className="ui-check">
      <input type="checkbox" checked={getHasCopy(account)} disabled={isSaving} onChange={(e) => handleCopyToggle(account, e.target.checked)} />
      <span>Copy</span>
    </label>
  );

  const keyCodeCell = (account: RawAccount, isSaving: boolean) =>
    getKeyCode(account) ? (
      <span className="ui-strong" style={{ fontFamily: "ui-monospace, monospace" }}>
        {getKeyCode(account)}
      </span>
    ) : (
      <BigButton kind="second" busy={isSaving} busyLabel="Generating…" onClick={() => handleGenerateCode(account)}>
        Generate code
      </BigButton>
    );

  return (
    <Screen title="Keys" subtitle="Key codes, the cleaner holding each physical copy, and account access info.">
      <SearchBar value={search} onChange={setSearch} label="Search by account name" placeholder="Search by account name" />

      {error ? <ErrorBox title="The keys did not load." text={error} onRetry={() => void loadData()} /> : null}

      {loading ? (
        <SkeletonList rows={4} />
      ) : filteredAccounts.length === 0 ? (
        error ? null : (
          <EmptyState icon="search" title="No accounts found" text="Try a shorter search." />
        )
      ) : (
        <CardList
          label="Keys by account"
          items={filteredAccounts}
          getKey={(account) => getAccountId(account) || clean(account.accountName)}
          renderCard={(account) => {
            const accountId = getAccountId(account);
            const isSaving = savingId === accountId;
            return (
              <Card title={clean(account.accountName) || "No name"}>
                {rowErrors[accountId] ? <p className="ui-field-error">{rowErrors[accountId]}</p> : null}
                <div className="ui-stack">
                  <div>
                    <p className="ui-label">Key code</p>
                    {keyCodeCell(account, isSaving)}
                  </div>
                  {cleanerSelect(account, isSaving)}
                  {copyCheck(account, isSaving)}
                  <div>
                    <p className="ui-label">Key / Alarm / Access Info</p>
                    <p className="ui-card-text">{clean(account.keyAlarmAccessInfo) || "None"}</p>
                  </div>
                </div>
              </Card>
            );
          }}
          columns={[
            { header: "Key Code", cell: (account) => keyCodeCell(account, savingId === getAccountId(account)) },
            {
              header: "Account",
              cell: (account) => (
                <>
                  <p className="ui-strong">{clean(account.accountName) || "No name"}</p>
                  {rowErrors[getAccountId(account)] ? <p className="ui-field-error">{rowErrors[getAccountId(account)]}</p> : null}
                </>
              ),
            },
            { header: "Cleaner", cell: (account) => cleanerSelect(account, savingId === getAccountId(account)) },
            { header: "Copy", cell: (account) => copyCheck(account, savingId === getAccountId(account)) },
            { header: "Key / Alarm / Access Info", cell: (account) => clean(account.keyAlarmAccessInfo) || "None" },
          ]}
        />
      )}
    </Screen>
  );
}
