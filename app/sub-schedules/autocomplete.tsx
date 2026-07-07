"use client";

import { useEffect, useRef, useState } from "react";

export type SearchOption = { id: string; label: string };

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
  accounts?: Array<{ accountId?: string; id?: string; accountName?: string }>;
};

// Debounced customer-name search against /api/accounts?q=, gated at 2+
// characters — the same pattern already used for the Accounts page's own
// search box (200ms debounce there, not the 300ms sometimes assumed).
export function useCustomerSearch() {
  const [query, setQuery] = useState("");
  const debouncedQuery = useDebounce(query, SEARCH_DEBOUNCE_MS);
  const [options, setOptions] = useState<SearchOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<SearchOption | null>(null);
  const requestIdRef = useRef(0);

  useEffect(() => {
    const q = debouncedQuery.trim();
    if (selected) return;
    if (q.length < 2) {
      setOptions([]);
      setLoading(false);
      return;
    }
    const requestId = ++requestIdRef.current;
    setLoading(true);
    (async () => {
      try {
        const res = await fetch(`/api/accounts?q=${encodeURIComponent(q)}`, { cache: "no-store" });
        const data = (await res.json()) as AccountsApiResponse;
        if (requestId !== requestIdRef.current) return;
        if (!res.ok || data.success === false) {
          setOptions([]);
          return;
        }
        const results = (data.accounts ?? [])
          .map((account) => ({
            id: account.accountId || account.id || "",
            label: account.accountName || "Unnamed Account",
          }))
          .filter((option) => option.id)
          .slice(0, 8);
        setOptions(results);
      } catch {
        if (requestId === requestIdRef.current) setOptions([]);
      } finally {
        if (requestId === requestIdRef.current) setLoading(false);
      }
    })();
  }, [debouncedQuery, selected]);

  function select(option: SearchOption) {
    setSelected(option);
    setQuery(option.label);
  }

  function clear() {
    setSelected(null);
    setQuery("");
  }

  return { query, setQuery, options, loading, selected, select, clear };
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
