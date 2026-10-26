"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { BigButton, Card, CardList, EmptyState, ErrorBox, Field, Screen, SearchBar, SkeletonList, showToast } from "@/app/ui";
import AccountLink from "../components/AccountLink";
import PrintSheet from "../components/print-sheet";
import tagStyles from "./key-tags.module.css";

// The account as /api/accounts (getAllAccounts) sends it. Key code, key
// holder and keysReady come from migration 060 (lib/pg/accounts.ts).
// Whether there is a copy is the existing Has Key field ("Yes" / "No").
type RawAccount = {
  accountId?: string;
  id?: string;
  rowNumber?: string | number;
  accountName?: string;
  hasKey?: string;
  keyAlarmAccessInfo?: string;
  /** The account's existing Alarm Code field (the same one the account page shows). */
  alarmCode?: string;
  keyCode?: string;
  keyHolder?: string;
  /** "sub" / "staff" when the holder's name is linked to one person, "" when kept as typed. */
  keyHolderLinked?: string;
  keysReady?: string;
  [key: string]: unknown;
};

type Subcontractor = { contactName?: string; companyName?: string; name?: string };
type StaffMember = { name?: string; active?: boolean };

const HOLDER_LIST_ID = "keys-holder-names";

/** Tags per letter page: 6 across (7.5") by 13 down (9.75") inside the half-inch margin. */
const TAGS_PER_PAGE = 78;
const pagesOf = (codes: string[]) => Array.from({ length: Math.ceil(codes.length / TAGS_PER_PAGE) }, (_, i) => codes.slice(i * TAGS_PER_PAGE, (i + 1) * TAGS_PER_PAGE));

function clean(value: unknown): string {
  return String(value ?? "").trim();
}

function getAccountId(account: RawAccount): string {
  return clean(account.accountId ?? account.id ?? account.rowNumber);
}

function getHasCopy(account: RawAccount): boolean {
  return clean(account.hasKey).toLowerCase() === "yes";
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
  const [holderNames, setHolderNames] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [savingId, setSavingId] = useState("");
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({});
  // Accounts ticked for "Print tags", by Account ID.
  const [selected, setSelected] = useState<Set<string>>(new Set());
  // The codes on the sheet being printed; null when nothing is printing.
  const [printCodes, setPrintCodes] = useState<string[] | null>(null);
  const [preparingPrint, setPreparingPrint] = useState(false);
  const [printError, setPrintError] = useState("");
  const endPrint = useCallback(() => setPrintCodes(null), []);

  async function loadData() {
    setLoading(true);
    setError("");
    try {
      const [accountsResponse, subsResponse, staffResponse] = await Promise.all([
        fetch("/api/accounts", { cache: "no-store" }),
        fetch("/api/subcontractors", { cache: "no-store" }),
        fetch("/api/staff", { cache: "no-store" }),
      ]);

      const accountsData = await readJson<{ success?: boolean; accounts?: RawAccount[]; data?: RawAccount[] }>(accountsResponse);
      if (!accountsResponse.ok || accountsData.success === false) {
        throw new Error("Could not load accounts.");
      }
      setAccounts(accountsData.accounts ?? accountsData.data ?? []);

      // Names offered in the Key holder box: every sub and active staff
      // member. Any other name can still be typed.
      const subsData = await readJson<{ subcontractors?: Subcontractor[]; subs?: Subcontractor[]; data?: Subcontractor[] }>(subsResponse);
      const staffData = await readJson<{ staff?: StaffMember[] }>(staffResponse);
      const names = new Set<string>();
      for (const sub of subsData.subcontractors ?? subsData.subs ?? subsData.data ?? []) {
        const name = clean(sub.contactName || sub.name) || clean(sub.companyName);
        if (name) names.add(name);
      }
      for (const person of staffData.staff ?? []) {
        if (person.active !== false && clean(person.name)) names.add(clean(person.name));
      }
      setHolderNames([...names].sort((a, b) => a.localeCompare(b)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong loading keys.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadData();
  }, []);

  const keysReady = accounts.some((account) => account.keysReady === "true");

  const filteredAccounts = useMemo(() => {
    const q = search.toLowerCase().trim();
    const filtered = q
      ? accounts.filter(
          (account) =>
            clean(account.accountName).toLowerCase().includes(q) ||
            clean(account.keyCode).toLowerCase() === q ||
            clean(account.keyHolder).toLowerCase().includes(q)
        )
      : accounts;
    return [...filtered].sort((a, b) => clean(a.accountName).localeCompare(clean(b.accountName)));
  }, [accounts, search]);

  async function post(account: RawAccount, body: Record<string, unknown>): Promise<Record<string, unknown> | null> {
    const accountId = getAccountId(account);
    setSavingId(accountId);
    setRowErrors((prev) => ({ ...prev, [accountId]: "" }));
    try {
      const response = await fetch("/api/accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...body, accountId }),
      });
      const data = await readJson<{ success?: boolean; error?: string } & Record<string, unknown>>(response);
      if (!response.ok || data.success === false) throw new Error(data.error || "Could not save changes.");
      return data;
    } catch (err) {
      setRowErrors((prev) => ({ ...prev, [accountId]: err instanceof Error ? err.message : "Could not save changes." }));
      return null;
    } finally {
      setSavingId("");
    }
  }

  function patchAccount(account: RawAccount, patch: Partial<RawAccount>) {
    const accountId = getAccountId(account);
    setAccounts((prev) => prev.map((a) => (getAccountId(a) === accountId ? { ...a, ...patch } : a)));
  }

  async function handleGenerateCode(account: RawAccount): Promise<string> {
    const data = await post(account, { action: "generateKeyCode" });
    if (data && typeof data.keyCode === "string") {
      patchAccount(account, { keyCode: data.keyCode });
      return data.keyCode;
    }
    return "";
  }

  // Print tags for these accounts. One with no code yet gets one first. A tag
  // carries only the code and "Cleaning World": never a name, address or alarm info.
  async function printTags(list: RawAccount[]) {
    if (list.length === 0 || preparingPrint) return;
    setPreparingPrint(true);
    setPrintError("");
    const codes: string[] = [];
    const failed: string[] = [];
    for (const account of list) {
      const code = clean(account.keyCode) || (await handleGenerateCode(account));
      if (code) codes.push(code);
      else failed.push(clean(account.accountName) || "No name");
    }
    setPreparingPrint(false);
    // Never a blank page: no code, no print. A tag that could not get a code
    // is named here (its own card says why); the rest still print.
    if (failed.length > 0) {
      const message =
        codes.length === 0
          ? `Nothing printed. No key code could be made for ${failed.join(", ")}.`
          : `Printed ${codes.length}. No key code could be made for ${failed.join(", ")}.`;
      setPrintError(message);
      showToast(message, "bad");
    }
    if (codes.length > 0) setPrintCodes(codes);
  }

  function toggleSelected(account: RawAccount, on: boolean) {
    const accountId = getAccountId(account);
    setSelected((prev) => {
      const next = new Set(prev);
      if (on) next.add(accountId);
      else next.delete(accountId);
      return next;
    });
  }

  async function handleAlarmSave(account: RawAccount, typed: string) {
    const value = typed.trim();
    if (value === clean(account.alarmCode)) return;
    const data = await post(account, { action: "updateAccountFields", fields: { alarmCode: value } });
    if (data) patchAccount(account, { alarmCode: value });
  }

  async function handleHolderSave(account: RawAccount, typed: string) {
    const value = typed.trim().replace(/\s+/g, " ");
    if (value === clean(account.keyHolder)) return;
    const data = await post(account, { action: "updateAccountFields", fields: { keyHolder: value } });
    // Whether the name was linked to a sub or staff member shows after the next load.
    if (data) patchAccount(account, { keyHolder: value, keyHolderLinked: "" });
  }

  async function handleCopyToggle(account: RawAccount, nextChecked: boolean) {
    const value = nextChecked ? "Yes" : "No";
    const data = await post(account, { action: "updateAccountFields", fields: { hasKey: value } });
    if (data) patchAccount(account, { hasKey: value });
  }

  const holderInput = (account: RawAccount, isSaving: boolean) => (
    <Field
      // A new key remounts the box after a save or reload, so it shows the saved name.
      key={`${getAccountId(account)}:${clean(account.keyHolder)}`}
      label="Key holder"
      optional
      list={HOLDER_LIST_ID}
      defaultValue={clean(account.keyHolder)}
      placeholder="Pick or type a name"
      disabled={isSaving || !keysReady}
      hint={clean(account.keyHolder) && !account.keyHolderLinked ? "Not on the sub or staff list" : undefined}
      onBlur={(e) => void handleHolderSave(account, e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
      }}
    />
  );

  const copyCheck = (account: RawAccount, isSaving: boolean) => (
    <label className="ui-check">
      <input type="checkbox" checked={getHasCopy(account)} disabled={isSaving} onChange={(e) => void handleCopyToggle(account, e.target.checked)} />
      <span>Copy</span>
    </label>
  );

  // The account's Alarm Code, saved to the same field the account page edits.
  const alarmInput = (account: RawAccount, isSaving: boolean) => (
    <Field
      key={`${getAccountId(account)}:alarm:${clean(account.alarmCode)}`}
      label="Alarm code"
      optional
      defaultValue={clean(account.alarmCode)}
      placeholder="None"
      autoComplete="off"
      disabled={isSaving}
      onBlur={(e) => void handleAlarmSave(account, e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
      }}
    />
  );

  const selectCheck = (account: RawAccount) => (
    <label className="ui-check">
      <input type="checkbox" checked={selected.has(getAccountId(account))} onChange={(e) => toggleSelected(account, e.target.checked)} />
      <span>Select for tags</span>
    </label>
  );

  const keyCodeCell = (account: RawAccount, isSaving: boolean) => (
    <div className="ui-stack">
      {clean(account.keyCode) ? (
        <span className="ui-strong" style={{ fontFamily: "ui-monospace, monospace" }}>
          {clean(account.keyCode)}
        </span>
      ) : (
        <BigButton kind="second" busy={isSaving} busyLabel="Generating…" disabled={!keysReady} onClick={() => void handleGenerateCode(account)}>
          Generate code
        </BigButton>
      )}
      <BigButton kind="second" busy={preparingPrint && isSaving} busyLabel="Getting ready…" disabled={!keysReady || preparingPrint} onClick={() => void printTags([account])}>
        Print tag
      </BigButton>
    </div>
  );

  const selectedAccounts = accounts.filter((account) => selected.has(getAccountId(account)));

  return (
    <Screen title="Keys" subtitle="Key codes, who holds each key, and account access info.">
      <SearchBar value={search} onChange={setSearch} label="Search by account, key code or key holder" placeholder="Search by account, key code or key holder" />

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <BigButton
          busy={preparingPrint}
          busyLabel="Getting tags ready…"
          disabled={!keysReady || selectedAccounts.length === 0}
          onClick={() => void printTags(selectedAccounts)}
        >
          {`Print tags (${selectedAccounts.length})`}
        </BigButton>
        {selectedAccounts.length > 0 ? (
          <BigButton kind="second" onClick={() => setSelected(new Set())}>
            Clear selection
          </BigButton>
        ) : null}
      </div>

      {printError ? <p className="ui-field-error" role="alert">{printError}</p> : null}
      {/* Paper only: the key tags. Code and "Cleaning World", nothing else. */}
      <PrintSheet active={printCodes !== null} onDone={endPrint}>
        {/* One letter page per 78 tags (6 across, 13 down), each with its own margin. */}
        {pagesOf(printCodes ?? []).map((page, pageIndex) => (
          <div key={pageIndex} className={tagStyles.page} style={pageIndex > 0 ? { breakBefore: "page" } : undefined}>
            <div className={tagStyles.sheet}>
              {page.map((code, index) => (
                <div key={`${code}-${index}`} className={tagStyles.tag}>
                  <span className={tagStyles.code}>{code}</span>
                  <span className={tagStyles.brand}>Cleaning World</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </PrintSheet>

      <datalist id={HOLDER_LIST_ID}>
        {holderNames.map((name) => (
          <option key={name} value={name} />
        ))}
      </datalist>

      {error ? <ErrorBox title="The keys did not load." text={error} onRetry={() => void loadData()} /> : null}
      {!loading && !error && accounts.length > 0 && !keysReady ? (
        <p className="ui-field-error">Key codes and key holders cannot be saved until their database update has run.</p>
      ) : null}

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
              <Card title={<AccountLink known accountId={accountId} name={clean(account.accountName) || "No name"} />}>
                {rowErrors[accountId] ? <p className="ui-field-error">{rowErrors[accountId]}</p> : null}
                <div className="ui-stack">
                  {selectCheck(account)}
                  <div>
                    <p className="ui-label">Key code</p>
                    {keyCodeCell(account, isSaving)}
                  </div>
                  {holderInput(account, isSaving)}
                  {copyCheck(account, isSaving)}
                  <div>
                    <p className="ui-label">Key / Alarm / Access Info</p>
                    <p className="ui-card-text" style={{ whiteSpace: "pre-line" }}>{clean(account.keyAlarmAccessInfo) || "None"}</p>
                  </div>
                  {alarmInput(account, isSaving)}
                </div>
              </Card>
            );
          }}
          columns={[
            {
              header: "Tag",
              cell: (account) => (
                <input
                  type="checkbox"
                  aria-label={`Select ${clean(account.accountName) || "this account"} for tags`}
                  checked={selected.has(getAccountId(account))}
                  onChange={(e) => toggleSelected(account, e.target.checked)}
                />
              ),
            },
            { header: "Key Code", cell: (account) => keyCodeCell(account, savingId === getAccountId(account)) },
            {
              header: "Account",
              cell: (account) => (
                <>
                  <p className="ui-strong">
                    <AccountLink known accountId={getAccountId(account)} name={clean(account.accountName) || "No name"} />
                  </p>
                  {rowErrors[getAccountId(account)] ? <p className="ui-field-error">{rowErrors[getAccountId(account)]}</p> : null}
                </>
              ),
            },
            { header: "Key holder", cell: (account) => holderInput(account, savingId === getAccountId(account)) },
            { header: "Copy", cell: (account) => copyCheck(account, savingId === getAccountId(account)) },
            {
              header: "Key / Alarm / Access Info",
              cell: (account) => <span style={{ whiteSpace: "pre-line" }}>{clean(account.keyAlarmAccessInfo) || "None"}</span>,
            },
            { header: "Alarm code", cell: (account) => alarmInput(account, savingId === getAccountId(account)) },
          ]}
        />
      )}
    </Screen>
  );
}
