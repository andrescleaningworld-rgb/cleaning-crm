"use client";

// The one account picker for staff forms (Pin Board notes and "Pin
// something", to-dos and account updates on the board, complaint edit, Account
// Health, New visit, equipment check out). Type part of a name, street or
// town ("ridge" finds "Ridgewood ..."), or tap the empty field for every
// account A to Z, then tap one. It hands back the account's ID and name, so
// the record links to the account page.
//
// An older record that has only a name: it shows that name as it is ("Not
// linked to an account"), and links it by itself only when exactly one
// account has exactly that name.

import { useEffect, useMemo, useState } from "react";
import { AutocompleteField, type SearchOption } from "@/app/sub-schedules/autocomplete";

export type PickedAccount = { id: string; name: string };

type AccountOption = { id: string; name: string; address: string; city: string; cancelled: boolean };

const pick = (row: Record<string, unknown>, keys: string[]) => {
  for (const key of keys) {
    const value = row[key];
    if (value !== undefined && value !== null && String(value).trim() !== "") return String(value).trim();
  }
  return "";
};

// One account list for every picker on the page, kept for a minute.
let cache: { rows: AccountOption[]; at: number } | null = null;
let loading: Promise<AccountOption[]> | null = null;

function loadAccounts(): Promise<AccountOption[]> {
  if (cache && Date.now() - cache.at < 60_000) return Promise.resolve(cache.rows);
  if (loading) return loading;
  loading = fetch("/api/accounts", { cache: "no-store" })
    .then((response) => response.json())
    .then((data: { accounts?: Record<string, unknown>[]; data?: Record<string, unknown>[] }) => {
      const rows = (data.accounts ?? data.data ?? [])
        .map((row) => ({
          id: pick(row, ["accountId", "id", "Account ID"]),
          name: pick(row, ["accountName", "Account Name", "name"]),
          address: pick(row, ["address", "Address"]),
          city: pick(row, ["city", "City"]),
          cancelled: /cancel/i.test(pick(row, ["status", "Status"])),
        }))
        .filter((row) => row.id && row.name)
        .sort((a, b) => a.name.localeCompare(b.name));
      cache = { rows, at: Date.now() };
      return rows;
    })
    .finally(() => {
      loading = null;
    });
  return loading;
}

const optionOf = (entry: AccountOption): SearchOption => ({ id: entry.id, label: entry.name, detail: [entry.address, entry.city && !entry.address.toLowerCase().includes(entry.city.toLowerCase()) ? entry.city : ""].filter(Boolean).join(", ") });

/** How many matches show while typing. With nothing typed, every account shows (the list scrolls). */
const MATCHES = 8;

/** Accounts whose name, address or town has the typed words anywhere in it; names that start with them first. */
export function matchAccounts<T extends { name: string; address: string; city: string }>(accounts: T[], query: string): T[] {
  const q = query.trim().toLowerCase();
  if (!q) return accounts;
  const rank = (entry: T) => {
    const name = entry.name.toLowerCase();
    if (name.startsWith(q)) return 0;
    if (name.includes(q)) return 1;
    return `${entry.address} ${entry.city}`.toLowerCase().includes(q) ? 2 : -1;
  };
  return accounts
    .map((entry) => ({ entry, rank: rank(entry) }))
    .filter((match) => match.rank >= 0)
    .sort((a, b) => a.rank - b.rank)
    .slice(0, MATCHES)
    .map((match) => match.entry);
}

export default function AccountPickerField({
  label,
  value,
  onChange,
  onQueryChange,
  hint,
  includeCancelled = false,
}: {
  label: string;
  /** null = none picked. An ID of "" = an older record's name that is not linked to an account. */
  value: PickedAccount | null;
  onChange: (next: PickedAccount | null) => void;
  /** The words typed and not picked yet, so a form can say "pick from the list" instead of losing them. */
  onQueryChange?: (query: string) => void;
  hint?: string;
  /** Cancelled accounts in the list too (editing an old record). */
  includeCancelled?: boolean;
}) {
  const [accounts, setAccounts] = useState<AccountOption[] | null>(cache?.rows ?? null);
  const [failed, setFailed] = useState(false);
  const [query, setQuery] = useState("");

  useEffect(() => {
    let alive = true;
    loadAccounts()
      .then((rows) => {
        if (alive) setAccounts(rows);
      })
      .catch(() => {
        if (alive) setFailed(true);
      });
    return () => {
      alive = false;
    };
  }, []);

  // An older record with only a name: linked by itself when exactly one account has exactly that name.
  useEffect(() => {
    if (!accounts || !value || value.id || !value.name.trim()) return;
    const same = accounts.filter((entry) => entry.name.trim().toLowerCase() === value.name.trim().toLowerCase());
    if (same.length === 1) onChange({ id: same[0].id, name: same[0].name });
  }, [accounts, value, onChange]);

  const list = useMemo(() => (accounts ? accounts.filter((entry) => includeCancelled || !entry.cancelled) : []), [accounts, includeCancelled]);
  const options = useMemo(() => (value ? [] : matchAccounts(list, query).map(optionOf)), [list, query, value]);

  const selected: SearchOption | null = !value
    ? null
    : value.id
      ? (() => {
          const found = accounts?.find((entry) => entry.id === value.id);
          return found ? optionOf(found) : { id: value.id, label: value.name || value.id, detail: "" };
        })()
      : { id: `name:${value.name}`, label: value.name, detail: "Not linked to an account. Pick one to link it." };

  const setTyped = (text: string) => {
    setQuery(text);
    onQueryChange?.(text);
  };

  return (
    <AutocompleteField
      label={label}
      placeholder="Type a name, street or town"
      hint={failed ? "The account list did not load. Close this and try again." : accounts ? hint : "Loading the accounts…"}
      query={query}
      onQueryChange={setTyped}
      options={options}
      loading={!accounts && !failed}
      selected={selected}
      onSelect={(option) => {
        const found = accounts?.find((entry) => entry.id === option.id);
        onChange({ id: option.id, name: found?.name ?? option.label });
        setTyped("");
      }}
      onClear={() => {
        onChange(null);
        setTyped("");
      }}
      // A tap on the empty field shows the whole list.
      minChars={0}
      emptyText="No accounts found"
    />
  );
}
