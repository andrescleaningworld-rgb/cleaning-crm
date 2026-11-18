"use client";

// Settings -> Activity Log (owner only, proxy.ts). Everything that happened,
// in three tabs:
//   Admin      what staff did in the CRM; filter by staff member
//   Subs       what subs did: their portal (logins, pages, issues, insurance,
//              schedules), CW Now crews, the team hub; filter by sub
//   Customers  what customers did: the customer portal (logins, problems,
//              requests, opening it), check-in answers; filter by account
// Every tab keeps the date range. Newest first, 50 at a time ("Load more").
// The tab badges count what is new since this device last opened that tab.
// The last tab opened is remembered; ?tab=admin|subs|customers opens one,
// with ?sub=<sub id> or ?account=<account id>[&accountName=] to filter.

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { BigButton, Card, EmptyState, ErrorBox, Field, Screen, SelectField, SkeletonList, Tabs } from "@/app/ui";
import { AutocompleteField, useCustomerSearch } from "@/app/sub-schedules/autocomplete";

type Tab = "admin" | "subs" | "customers";
type ApiTab = "admin" | "sub" | "customer";
const API_TAB: Record<Tab, ApiTab> = { admin: "admin", subs: "sub", customers: "customer" };
const TAB_WORDS: Record<Tab, string> = { admin: "Admin", subs: "Subs", customers: "Customers" };
const BADGE: Record<ApiTab, { text: string; style: React.CSSProperties }> = {
  admin: { text: "", style: { background: "#e2e8f0", color: "#334155" } },
  sub: { text: "SUB", style: { background: "#dbeafe", color: "#1e3a8a" } },
  customer: { text: "CUSTOMER", style: { background: "#dcfce7", color: "#14532d" } },
};

type ManagerOption = { staffId: string; name: string; accountId?: string };
type SubOption = { id: string; name: string };
type Entry = {
  key: string;
  source: ApiTab;
  actorRole: string;
  actorName: string;
  action: string;
  entityType: string;
  entityId: string | null;
  detail: string | null;
  accountId: string | null;
  subId: string | null;
  createdAt: string;
};

const LAST_TAB_KEY = "activity-log:tab";
const seenKey = (tab: Tab) => `activity-log:seen:${tab}`;
const isTab = (value: unknown): value is Tab => value === "admin" || value === "subs" || value === "customers";

function readStore(key: string): string {
  try {
    return localStorage.getItem(key) ?? "";
  } catch {
    return "";
  }
}
function writeStore(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // private window: the page still works, it just forgets
  }
}

function formatTimestamp(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
}

/** The line under the name: "update account #123 — detail", or the sub portal's "Viewed Schedule — detail". */
function whatHappened(entry: Entry): string {
  if (entry.entityType === "sub portal") return `${entry.action}${entry.detail ? ` — ${entry.detail}` : ""}`;
  return `${entry.action} ${entry.entityType}${entry.entityId ? ` #${entry.entityId}` : ""}${entry.detail ? ` — ${entry.detail}` : ""}`;
}

function RoleBadge({ entry }: { entry: Entry }) {
  const badge = BADGE[entry.source] ?? BADGE.admin;
  // Admin rows keep the staff role (OWNER / MANAGER); sub and customer rows say SUB / CUSTOMER.
  const text = entry.source === "admin" ? entry.actorRole : badge.text;
  return (
    <span className="rounded-full px-2 py-0.5 text-base font-bold uppercase tracking-wide" style={badge.style}>
      {text}
    </span>
  );
}

export default function ActivityLogPage() {
  return (
    <Suspense fallback={<Screen title="Activity Log" backHref="/settings"><SkeletonList rows={4} /></Screen>}>
      <ActivityLog />
    </Suspense>
  );
}

function ActivityLog() {
  const params = useSearchParams();
  const [tab, setTab] = useState<Tab>(() => {
    const fromUrl = params.get("tab");
    if (isTab(fromUrl)) return fromUrl;
    const kept = readStore(LAST_TAB_KEY);
    return isTab(kept) ? kept : "admin";
  });
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  // Filters, one per tab.
  const [managers, setManagers] = useState<ManagerOption[]>([]);
  const [managerFilter, setManagerFilter] = useState("");
  const [subs, setSubs] = useState<SubOption[]>([]);
  const [subFilter, setSubFilter] = useState(() => params.get("sub") ?? "");
  const account = useCustomerSearch();
  const [entries, setEntries] = useState<Entry[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");
  const [counts, setCounts] = useState<Record<ApiTab, number>>({ admin: 0, sub: 0, customer: 0 });

  // ?account=<id>[&accountName=]: the Customers tab opens on that account.
  const presetDone = useRef(false);
  useEffect(() => {
    if (presetDone.current) return;
    presetDone.current = true;
    const presetAccount = params.get("account");
    if (presetAccount) account.select({ id: presetAccount, label: params.get("accountName") || presetAccount });
  }, [params, account]);
  const accountFilter = account.selected?.id ?? "";

  useEffect(() => {
    fetch("/api/admin/manager-accounts", { cache: "no-store" })
      .then((response) => response.json())
      .then((data: { identities?: ManagerOption[] }) => setManagers(data.identities ?? []))
      .catch(() => undefined);
    fetch("/api/admin/audit-log?options=subs", { cache: "no-store" })
      .then((response) => response.json())
      .then((data: { subs?: SubOption[] }) => setSubs(data.subs ?? []))
      .catch(() => undefined);
    // New since this device last opened each tab (no badge the first time).
    const since = new URLSearchParams({ counts: "1" });
    for (const each of ["admin", "subs", "customers"] as Tab[]) {
      const at = readStore(seenKey(each));
      if (at) since.set(API_TAB[each], at);
    }
    fetch(`/api/admin/audit-log?${since.toString()}`, { cache: "no-store" })
      .then((response) => response.json())
      .then((data: { counts?: Record<ApiTab, number> }) => {
        if (data.counts) setCounts(data.counts);
      })
      .catch(() => undefined);
  }, []);

  // Opening a tab: remembered, and its "new" badge is cleared.
  useEffect(() => {
    writeStore(LAST_TAB_KEY, tab);
    writeStore(seenKey(tab), new Date().toISOString());
    setCounts((current) => ({ ...current, [API_TAB[tab]]: 0 }));
    const url = new URL(window.location.href);
    url.searchParams.set("tab", tab);
    window.history.replaceState(null, "", url.toString());
  }, [tab]);

  const query = useMemo(() => {
    const q = new URLSearchParams({ tab: API_TAB[tab] });
    if (startDate) q.set("start", startDate);
    if (endDate) {
      // "end" is exclusive: the start of the next day, so the end day is included.
      const inclusiveEnd = new Date(`${endDate}T00:00:00`);
      inclusiveEnd.setDate(inclusiveEnd.getDate() + 1);
      q.set("end", inclusiveEnd.toISOString());
    }
    if (tab === "admin" && managerFilter) q.set("managerAccountId", managerFilter);
    if (tab === "subs" && subFilter) q.set("sub", subFilter);
    if (tab === "customers" && accountFilter) q.set("account", accountFilter);
    return q.toString();
  }, [tab, startDate, endDate, managerFilter, subFilter, accountFilter]);

  const load = useCallback(
    async (offset: number) => {
      const response = await fetch(`/api/admin/audit-log?${query}&offset=${offset}`, { cache: "no-store" });
      const data = (await response.json()) as { success?: boolean; entries?: Entry[]; hasMore?: boolean; error?: string };
      if (data.success === false) throw new Error(data.error || "Could not load the activity log.");
      return { entries: data.entries ?? [], hasMore: data.hasMore === true };
    },
    [query]
  );

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError("");
    load(0)
      .then((page) => {
        if (!alive) return;
        setEntries(page.entries);
        setHasMore(page.hasMore);
      })
      .catch((err: unknown) => alive && setError(err instanceof Error ? err.message : "Could not load the activity log."))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [load]);

  async function loadMore() {
    setLoadingMore(true);
    try {
      const page = await load(entries.length);
      setEntries((current) => [...current, ...page.entries]);
      setHasMore(page.hasMore);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load more.");
    } finally {
      setLoadingMore(false);
    }
  }

  const tabLabel = (each: Tab) => {
    const n = counts[API_TAB[each]];
    return n > 0 && each !== tab ? `${TAB_WORDS[each]} (${n} new)` : TAB_WORDS[each];
  };

  return (
    <Screen title="Activity Log" subtitle="What staff, subs and customers did." backHref="/settings">
      <Tabs
        label="Activity Log"
        tabs={(["admin", "subs", "customers"] as Tab[]).map((each) => ({ value: each, label: tabLabel(each) }))}
        value={tab}
        onChange={setTab}
      />

      <Card>
        <div className="ui-stack">
          {tab === "admin" ? (
            <SelectField label="Staff member" value={managerFilter} onChange={(event) => setManagerFilter(event.target.value)} required={false}>
              <option value="">Everyone</option>
              {managers
                .filter((m) => m.accountId)
                .map((m) => (
                  <option key={m.accountId} value={m.accountId}>
                    {m.name}
                  </option>
                ))}
            </SelectField>
          ) : tab === "subs" ? (
            <SelectField label="Sub" value={subFilter} onChange={(event) => setSubFilter(event.target.value)} required={false}>
              <option value="">All subs</option>
              {subFilter && !subs.some((s) => s.id === subFilter) ? <option value={subFilter}>{subFilter}</option> : null}
              {subs.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </SelectField>
          ) : (
            <AutocompleteField
              label="Account"
              placeholder="Type an account name"
              query={account.query}
              onQueryChange={account.setQuery}
              options={account.options}
              loading={account.loading}
              selected={account.selected}
              onSelect={account.select}
              onClear={account.clear}
            />
          )}
          <div className="flex flex-wrap items-end gap-2">
            <Field label="From" type="date" optional value={startDate} onChange={(event) => setStartDate(event.target.value)} />
            <Field label="To" type="date" optional value={endDate} onChange={(event) => setEndDate(event.target.value)} />
          </div>
        </div>
      </Card>

      {error ? <ErrorBox title={error} /> : null}

      {loading ? (
        <SkeletonList rows={4} />
      ) : entries.length === 0 ? (
        <EmptyState icon="inbox" title="No activity for these filters." />
      ) : (
        <div className="space-y-2">
          {entries.map((entry) => (
            <div key={entry.key} className="ui-card">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="ui-strong">
                  {entry.actorName || "Someone"} <RoleBadge entry={entry} />
                </p>
                <p className="ui-muted">{formatTimestamp(entry.createdAt)}</p>
              </div>
              <p className="ui-muted">{whatHappened(entry)}</p>
            </div>
          ))}
          {hasMore ? (
            <BigButton kind="second" busy={loadingMore} busyLabel="Loading…" onClick={() => void loadMore()}>
              Load more
            </BigButton>
          ) : null}
        </div>
      )}
    </Screen>
  );
}
