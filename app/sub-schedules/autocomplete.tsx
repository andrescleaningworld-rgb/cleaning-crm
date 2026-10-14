"use client";

import { useEffect, useMemo, useRef, useState, useId, type KeyboardEvent } from "react";

/** `detail` is an optional second line under the label (e.g. the address). */
export type SearchOption = { id: string; label: string; manager?: string; detail?: string };

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
// cached account list client-side (same approach as the Subcontractor field)
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
  /** How many letters before the list opens. Default 2. */
  minChars?: number;
  /** Shown when nothing matches. Default "No matches." */
  emptyText?: string;
  /** A small line under the label, like the other fields' hints. */
  hint?: string;
};

// Arrow keys move through the list, Enter picks, Esc closes the list (and only
// the list: inside a Sheet the Sheet stays open). A tap or click picks too.
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
  minChars = 2,
  emptyText = "No matches.",
  hint,
}: AutocompleteFieldProps) {
  const [focused, setFocused] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const inputId = useId();
  const listId = `${inputId}-list`;
  const showDropdown = focused && !dismissed && !selected && query.trim().length >= minChars;
  const canPick = showDropdown && !loading && options.length > 0;

  // The highlighted match; typing starts it back at the top (see onChange).
  const current = Math.min(active, Math.max(options.length - 1, 0));

  // Keep the highlighted match in view while arrowing through a long list.
  useEffect(() => {
    if (!canPick) return;
    listRef.current?.querySelector<HTMLElement>(`[data-index="${current}"]`)?.scrollIntoView({ block: "nearest" });
  }, [current, canPick]);

  function pick(option: SearchOption) {
    onSelect(option);
    setDismissed(false);
  }

  function clear() {
    onClear();
    setDismissed(false);
    // The input comes back in place of the picked name; put the cursor in it.
    requestAnimationFrame(() => inputRef.current?.focus());
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      if (!showDropdown) {
        setDismissed(false);
        return;
      }
      if (!canPick) return;
      event.preventDefault();
      const step = event.key === "ArrowDown" ? 1 : -1;
      setActive((current + step + options.length) % options.length);
    } else if (event.key === "Enter") {
      if (!canPick) return;
      event.preventDefault();
      pick(options[current]);
    } else if (event.key === "Escape") {
      if (!showDropdown) return;
      // Stops a surrounding <dialog> from closing on the same Esc.
      event.preventDefault();
      event.stopPropagation();
      setDismissed(true);
    }
  }

  return (
    <div className={`ui-field ${className ?? ""}`} style={{ position: "relative" }}>
      <label className="ui-label" htmlFor={inputId}>
        {label}
      </label>
      {hint ? (
        <span className="ui-hint" id={`${inputId}-hint`}>
          {hint}
        </span>
      ) : null}
      {selected ? (
        <div className="ui-picker-option" style={{ cursor: "default" }}>
          <span style={{ minWidth: 0, overflowWrap: "anywhere" }}>
            <span className="ui-strong">{selected.label}</span>
            {selected.detail ? (
              <span className="ui-muted" style={{ display: "block", fontSize: "0.9em" }}>
                {selected.detail}
              </span>
            ) : null}
          </span>
          <button type="button" onClick={clear} className="ui-btn ui-btn-quiet ui-btn-icon" aria-label={`Clear ${label}`}>
            ×
          </button>
        </div>
      ) : (
        <input
          ref={inputRef}
          id={inputId}
          type="text"
          value={query}
          onChange={(e) => {
            onQueryChange(e.target.value);
            setDismissed(false);
            setActive(0);
          }}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
          autoComplete="off"
          className="ui-input"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={showDropdown}
          aria-controls={listId}
          aria-activedescendant={canPick ? `${listId}-${current}` : undefined}
          aria-describedby={hint ? `${inputId}-hint` : undefined}
        />
      )}

      {showDropdown && (
        <div ref={listRef} id={listId} role="listbox" aria-label={label} className="ui-picker-list ui-autocomplete-list">
          {loading ? (
            <p className="ui-muted" style={{ padding: "10px 14px", margin: 0 }}>
              Searching…
            </p>
          ) : options.length === 0 ? (
            <p className="ui-muted" style={{ padding: "10px 14px", margin: 0 }}>
              {emptyText}
            </p>
          ) : (
            options.map((option, index) => (
              <button
                key={option.id}
                id={`${listId}-${index}`}
                data-index={index}
                type="button"
                role="option"
                aria-selected={index === current}
                tabIndex={-1}
                style={index === current ? { borderColor: "var(--ui-brand)", background: "var(--ui-brand-soft)" } : undefined}
                onMouseDown={(event) => {
                  // Picks before the input's blur closes the list.
                  event.preventDefault();
                  pick(option);
                }}
                onMouseEnter={() => setActive(index)}
                className="ui-picker-option"
              >
                <span style={{ minWidth: 0, textAlign: "left", overflowWrap: "anywhere" }}>
                  {option.label}
                  {option.detail ? (
                    <span className="ui-muted" style={{ display: "block", fontSize: "0.9em", fontWeight: 400 }}>
                      {option.detail}
                    </span>
                  ) : null}
                </span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
