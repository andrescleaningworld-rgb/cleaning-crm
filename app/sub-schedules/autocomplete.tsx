"use client";

import { useEffect, useMemo, useState } from "react";

export type SearchOption = { id: string; label: string; manager?: string };

export const SEARCH_DEBOUNCE_MS = 200;

export function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

type AccountsApiResponse = {
  success?: boolean;
  error?: string;
  accounts?: Array<{ accountId?: string; id?: string; accountName?: string; manager?: string }>;
};

const ACCOUNTS_CACHE_TTL_MS = 60_000;

// Module-level cache shared by every consumer in the browser (the page's
// Customer field, the Exceptions tab's name resolution, and the New
// Exception modal's own Customer field) so a full account list is fetched
// at most once per TTL window instead of once per component instance —
// this redundancy across independent fetches was part of what overwhelmed
// the shared Apps Script backend in production.
let accountsCache: { options: SearchOption[]; expiresAt: number } | null = null;
let accountsFetchPromise: Promise<SearchOption[]> | null = null;

async function fetchAllAccountOptions(): Promise<SearchOption[]> {
  if (accountsCache && Date.now() <= accountsCache.expiresAt) return accountsCache.options;
  if (accountsFetchPromise) return accountsFetchPromise;

  accountsFetchPromise = (async () => {
    try {
      const res = await fetch("/api/accounts");
      const data = (await res.json()) as AccountsApiResponse;
      if (!res.ok || data.success === false) return accountsCache?.options ?? [];
      const options = (data.accounts ?? [])
        .map((account) => ({
          id: account.accountId || account.id || "",
          label: account.accountName || "Unnamed Account",
          manager: (account.manager || "").trim(),
        }))
        .filter((option) => option.id);
      accountsCache = { options, expiresAt: Date.now() + ACCOUNTS_CACHE_TTL_MS };
      return options;
    } finally {
      accountsFetchPromise = null;
    }
  })();

  return accountsFetchPromise;
}

// Read-only access to the same shared account list, for consumers that just
// need to resolve AccountID -> name (e.g. the Exceptions table) rather than
// drive a search field.
export function useAllAccountOptions(): { options: SearchOption[]; loading: boolean } {
  const [options, setOptions] = useState<SearchOption[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let cancelled = false;
    fetchAllAccountOptions().then((result) => {
      if (cancelled) return;
      setOptions(result);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  return { options, loading };
}

// Customer-name search, gated at 2+ characters — filters the shared,
// cached account list client-side (same approach as the Team Leader field)
// instead of each instance independently querying /api/accounts?q=.
export function useCustomerSearch() {
  const { options: allAccounts, loading } = useAllAccountOptions();
  const [query, setQuery] = useState("");
  const debouncedQuery = useDebounce(query, SEARCH_DEBOUNCE_MS);
  const [selected, setSelected] = useState<SearchOption | null>(null);

  const options = useMemo(() => {
    if (selected) return [];
    const q = debouncedQuery.trim().toLowerCase();
    if (q.length < 2) return [];
    return allAccounts.filter((option) => option.label.toLowerCase().includes(q)).slice(0, 8);
  }, [allAccounts, debouncedQuery, selected]);

  function select(option: SearchOption) {
    setSelected(option);
    setQuery(option.label);
  }

  function clear() {
    setSelected(null);
    setQuery("");
  }

  return { query, setQuery, options, loading: loading && !selected, selected, select, clear };
}

type AutocompleteFieldProps = {
  label: string;
  placeholder: string;
  query: string;
  onQueryChange: (value: string) => void;
  options: SearchOption[];
  loading: boolean;
  selected: SearchOption | null;
  onSelect: (option: SearchOption) => void;
  onClear: () => void;
  className?: string;
};

export function AutocompleteField({
  label,
  placeholder,
  query,
  onQueryChange,
  options,
  loading,
  selected,
  onSelect,
  onClear,
  className,
}: AutocompleteFieldProps) {
  const [focused, setFocused] = useState(false);
  const showDropdown = focused && !selected && query.trim().length >= 2;

  return (
    <div className={`relative ${className ?? ""}`}>
      <label className="text-xs font-bold uppercase text-slate-500">{label}</label>
      {selected ? (
        <div className="mt-1 flex items-center justify-between rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm font-semibold text-blue-900 sm:w-64">
          <span className="truncate">{selected.label}</span>
          <button
            type="button"
            onClick={onClear}
            className="ml-2 shrink-0 text-blue-700 hover:text-blue-900"
            aria-label={`Clear ${label}`}
          >
            ×
          </button>
        </div>
      ) : (
        <input
          type="text"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder={placeholder}
          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-600 sm:w-64"
        />
      )}

      {showDropdown && (
        <div className="absolute z-10 mt-1 max-h-64 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg sm:w-64">
          {loading ? (
            <p className="px-3 py-2 text-sm text-slate-500">Searching...</p>
          ) : options.length === 0 ? (
            <p className="px-3 py-2 text-sm text-slate-500">No matches.</p>
          ) : (
            options.map((option) => (
              <button
                key={option.id}
                type="button"
                onMouseDown={() => onSelect(option)}
                className="block w-full truncate px-3 py-2 text-left text-sm text-slate-800 hover:bg-blue-50"
              >
                {option.label}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
