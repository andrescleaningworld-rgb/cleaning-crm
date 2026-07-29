"use client";

import { useMemo, useState } from "react";

export type AccountMultiSelectOption = {
  name: string;
  status?: string;
};

type StatusScope = "Active" | "All" | "Cancelled";

const SCOPE_OPTIONS: StatusScope[] = ["Active", "All", "Cancelled"];

// Simplified version of app/accounts/page.tsx's getStatusCategory — this
// picker only needs a 3-way Active/All/Cancelled split, not the full
// Paused/Over 90 Days/Other breakdown the Accounts page uses, so "Active"
// here just means "not cancelled".
function isCancelled(status: string | undefined): boolean {
  const clean = (status ?? "").trim().toLowerCase();
  return (
    clean.includes("cancel") ||
    clean.includes("lost") ||
    clean.includes("terminated") ||
    clean.includes("closed")
  );
}

/**
 * Searchable multi-select for accounts, modeled on the MultiSelectFilter
 * dropdown in app/sub-schedules/full-calendar.tsx but adapted for form use:
 * `selected` is an ordered string[] of account names driving form state,
 * not a filter Set narrowing a table.
 *
 * Pass `singleSelect` to constrain it to one active choice at a time (picking
 * a new option replaces the previous one) while keeping the same search +
 * status-scope UI — used for the regular one-account-per-to-do case.
 */
export default function AccountMultiSelect({
  accounts,
  selected,
  onChange,
  singleSelect = false,
  loading = false,
  placeholder = "Select account(s)",
}: {
  accounts: AccountMultiSelectOption[];
  selected: string[];
  onChange: (next: string[]) => void;
  singleSelect?: boolean;
  loading?: boolean;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [scope, setScope] = useState<StatusScope>("Active");

  const selectedSet = useMemo(() => new Set(selected), [selected]);

  const uniqueAccounts = useMemo(() => {
    const seen = new Set<string>();
    const out: AccountMultiSelectOption[] = [];
    for (const account of accounts) {
      if (!account.name || seen.has(account.name)) continue;
      seen.add(account.name);
      out.push(account);
    }
    return out.sort((a, b) => a.name.localeCompare(b.name));
  }, [accounts]);

  const scopedAccounts = useMemo(() => {
    return uniqueAccounts.filter((account) => {
      // Never hide an already-checked account just because it falls outside
      // the current status scope — switching the filter after picking a
      // cancelled account must not silently drop that selection.
      if (selectedSet.has(account.name)) return true;
      if (scope === "All") return true;
      return scope === "Cancelled"
        ? isCancelled(account.status)
        : !isCancelled(account.status);
    });
  }, [uniqueAccounts, scope, selectedSet]);

  const visibleAccounts = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return scopedAccounts;
    return scopedAccounts.filter((account) =>
      account.name.toLowerCase().includes(normalizedQuery)
    );
  }, [scopedAccounts, query]);

  function toggle(name: string) {
    if (singleSelect) {
      onChange(selectedSet.has(name) ? [] : [name]);
      setOpen(false);
      return;
    }

    const next = selectedSet.has(name)
      ? selected.filter((n) => n !== name)
      : [...selected, name];
    onChange(next);
  }

  function remove(name: string) {
    onChange(selected.filter((n) => n !== name));
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        disabled={loading}
        className="flex min-h-[42px] w-full flex-wrap items-center gap-1 rounded-xl border border-slate-300 bg-white px-3 py-2 text-left text-sm disabled:opacity-60"
      >
        {selected.length === 0 ? (
          <span className="text-slate-400">
            {loading ? "Loading accounts..." : placeholder}
          </span>
        ) : (
          selected.map((name) => (
            <span
              key={name}
              className="flex items-center gap-1 rounded-full bg-blue-100 px-2 py-0.5 text-xs font-semibold text-blue-800"
            >
              {name}
              <span
                role="button"
                aria-label={`Remove ${name}`}
                tabIndex={-1}
                onClick={(event) => {
                  event.stopPropagation();
                  remove(name);
                }}
                className="cursor-pointer text-blue-600 hover:text-blue-900"
              >
                ×
              </span>
            </span>
          ))
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute z-20 mt-1 w-full min-w-[280px] rounded-xl border border-slate-200 bg-white p-2 shadow-lg">
            <div className="mb-2 flex gap-1">
              {SCOPE_OPTIONS.map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setScope(option)}
                  className={`rounded-lg px-2 py-1 text-xs font-semibold ${
                    scope === option
                      ? "bg-blue-700 text-white"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}
                >
                  {option}
                </button>
              ))}
            </div>

            <input
              type="text"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search accounts..."
              className="mb-2 w-full rounded-md border border-slate-300 px-2 py-1 text-sm outline-none focus:border-blue-600"
            />

            {!singleSelect && selected.length > 0 ? (
              <button
                type="button"
                onClick={() => onChange([])}
                className="mb-1 text-xs font-semibold text-blue-700 hover:underline"
              >
                Clear all
              </button>
            ) : null}

            <div className="max-h-64 overflow-y-auto">
              {visibleAccounts.length === 0 ? (
                <p className="px-1 py-1 text-sm text-slate-500">No matches.</p>
              ) : (
                visibleAccounts.map((account) => (
                  <label
                    key={account.name}
                    className="flex items-center gap-2 rounded px-1 py-1 text-sm hover:bg-slate-50"
                  >
                    <input
                      type="checkbox"
                      checked={selectedSet.has(account.name)}
                      onChange={() => toggle(account.name)}
                    />
                    <span className="truncate">{account.name}</span>
                  </label>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
