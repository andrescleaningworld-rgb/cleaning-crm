"use client";

// Check-ins (Accounts center → Check-ins): send the customer check-in to
// many accounts, and see everything sent.
//
//   Send     every account, with the usual filters (Manager, Sub, Town, Last
//            visited, Near account) and the check-in ones (Not answered,
//            Needs attention, Never checked in, Last check-in more than
//            30 / 60 / 90 days ago). Tick accounts, or "Select all filtered",
//            then Send. A saved list ("Drew's accounts") picks its accounts
//            in one tap; lists can be saved, changed and deleted. Every send
//            shows the email and who is skipped (and why) first
//            (CheckinSendSheet).
//   History  one line per send: when, the account (or the first one and
//            "+N more", tap for the list), who, which list, how many sent /
//            skipped / viewed / answered. Tap one: every account in it,
//            Sent → 👁 Viewed → ✅ / ⚠️ Responded, the answer, comment, best
//            way to reach them and photos, and the email that was sent.
//
// Nothing is sent by itself: only Send sends. More than 90 in a day wait in
// the queue and go over the next days.

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  BigButton,
  Card,
  CardList,
  EmptyState,
  ErrorBox,
  Field,
  Screen,
  SearchBar,
  SelectField,
  Sheet,
  SkeletonList,
  Tabs,
  showToast,
} from "@/app/ui";
import { CheckinAnswer, CheckinEmailSheet, CheckinProgress, CheckinSendSheet, whenText } from "@/app/components/checkins";
import { LastVisitedField, easternTodayIso, lastVisitText, matchesLastVisited, useLastVisits, type LastVisitedFilter } from "@/app/components/last-visited";
import { ManagerOptions, useManagerNames } from "@/app/components/manager-options";
import { AutocompleteField, useCustomerSearch } from "@/app/sub-schedules/autocomplete";
import { distanceInMiles } from "@/app/lib/distance";
import { managerMatches } from "@/lib/managerNames";
import { BATCH_KIND_TEXT, CHECKIN_VIEWED_NOTE, ratingOf, ratingText, type CheckinBatch, type CheckinLast, type CheckinList, type CheckinRow, type CheckinSkip } from "@/lib/customerCheckin";

type RawAccount = Record<string, unknown>;

type Row = {
  id: string;
  name: string;
  manager: string;
  sub: string;
  town: string;
  status: string;
  email: string;
  lat: number | null;
  lng: number | null;
  search: string;
};

type CheckinFilter = "any" | "not_answered" | "attention" | "never" | "30" | "60" | "90";

const CHECKIN_FILTERS: { value: CheckinFilter; label: string }[] = [
  { value: "any", label: "Any" },
  { value: "not_answered", label: "Not answered" },
  { value: "attention", label: "Needs attention" },
  { value: "never", label: "Never checked in" },
  { value: "30", label: "Last check-in more than 30 days ago" },
  { value: "60", label: "Last check-in more than 60 days ago" },
  { value: "90", label: "Last check-in more than 90 days ago" },
];

const RADIUS_OPTIONS = [2, 5, 10, 15, 25];

const text = (value: unknown) => String(value ?? "").trim();
const coordinate = (value: unknown) => {
  const n = Number(value);
  return text(value) !== "" && Number.isFinite(n) ? n : null;
};

function townOf(account: RawAccount): string {
  const city = text(account.city);
  if (city) return city;
  const parts = text(account.address)
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length < 3) return "";
  const town = parts[parts.length - 2];
  return /\d/.test(town) ? "" : town;
}

function toRow(account: RawAccount): Row | null {
  const id = text(account.accountId ?? account.id);
  if (!id) return null;
  const name = text(account.accountName) || id;
  const row: Row = {
    id,
    name,
    manager: text(account.manager),
    sub: text(account.subcontractor),
    town: townOf(account),
    status: text(account.status),
    email: text(account.email),
    lat: coordinate(account.latitude),
    lng: coordinate(account.longitude),
    search: "",
  };
  row.search = [row.name, row.manager, row.sub, row.town, text(account.address), row.email].join(" ").toLowerCase();
  return row;
}

const isActive = (status: string) => ["active", "active account", "current"].includes(status.toLowerCase());
const isCancelled = (status: string) => /^cancel/i.test(status);

function daysAgo(isoValue: string): number | null {
  if (!isoValue) return null;
  const then = new Date(isoValue).getTime();
  return Number.isNaN(then) ? null : Math.floor((Date.now() - then) / 86_400_000);
}

function matchesCheckin(filter: CheckinFilter, last: CheckinLast | undefined): boolean {
  if (filter === "any") return true;
  if (filter === "never") return !last;
  if (!last) return filter === "30" || filter === "60" || filter === "90";
  if (filter === "not_answered") return last.lastStatus === "sent" && !ratingOf(last.lastAnswer);
  if (filter === "attention") return ratingOf(last.lastAnswer) === "attention";
  const days = daysAgo(last.lastSentAt);
  return days !== null && days > Number(filter);
}

function lastCheckinText(last: CheckinLast | undefined): string {
  if (!last) return "Never";
  const when = last.lastSentAt ? new Date(last.lastSentAt).toLocaleDateString("en-US", { timeZone: "America/New_York", month: "short", day: "numeric", year: "numeric" }) : "";
  if (last.lastStatus === "queued") return `Queued ${when}`;
  return `${when} · ${ratingOf(last.lastAnswer) ? ratingText(last.lastAnswer) : "No answer"}`;
}

export default function CheckinsPage() {
  const [tab, setTab] = useState<"send" | "history">("send");
  const [rows, setRows] = useState<Row[]>([]);
  const [last, setLast] = useState<Record<string, CheckinLast>>({});
  const [optedOut, setOptedOut] = useState<Set<string>>(new Set());
  // Who has an email a check-in can go to: the account's own, or its main contact's (from the server, the same rule as sending).
  const [withEmail, setWithEmail] = useState<Set<string> | null>(null);
  const hasEmail = useCallback((r: Row) => (withEmail ? withEmail.has(r.id) : Boolean(r.email)), [withEmail]);
  const [lists, setLists] = useState<CheckinList[]>([]);
  const [ready, setReady] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Filters
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"active" | "all">("active");
  const [managerFilter, setManagerFilter] = useState("All");
  const [subFilter, setSubFilter] = useState("All");
  const [townFilter, setTownFilter] = useState("");
  const [emailOnly, setEmailOnly] = useState(true);
  const [lastVisitedFilter, setLastVisitedFilter] = useState<LastVisitedFilter>("any");
  const [checkinFilter, setCheckinFilter] = useState<CheckinFilter>("any");
  const near = useCustomerSearch();
  const [radius, setRadius] = useState(10);
  const [showFilters, setShowFilters] = useState(false);
  const { lastVisits, failed: lastVisitsFailed } = useLastVisits();
  const { names: managerNames } = useManagerNames();
  const today = easternTodayIso();

  // Selection and lists
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [listId, setListId] = useState<number | null>(null);
  const [listOnly, setListOnly] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);
  const [saveName, setSaveName] = useState("");
  const [saveAsNew, setSaveAsNew] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [sendOpen, setSendOpen] = useState(false);
  const [sendIds, setSendIds] = useState<string[]>([]);
  const [sendList, setSendList] = useState<CheckinList | null>(null);

  const currentList = lists.find((list) => list.id === listId) ?? null;

  const loadChecks = useCallback(async () => {
    const [lastRes, listRes] = await Promise.all([
      fetch("/api/customer-checkin?view=last", { cache: "no-store" }).then((r) => r.json()),
      fetch("/api/customer-checkin?view=lists", { cache: "no-store" }).then((r) => r.json()),
    ]);
    const lastData = lastRes as { success?: boolean; ready?: boolean; last?: Record<string, CheckinLast>; optedOut?: string[]; withEmail?: string[] };
    setReady(lastData.ready !== false);
    setLast(lastData.last ?? {});
    setOptedOut(new Set(lastData.optedOut ?? []));
    setWithEmail(lastData.withEmail ? new Set(lastData.withEmail) : null);
    setLists((listRes as { lists?: CheckinList[] }).lists ?? []);
  }, []);

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const response = await fetch("/api/accounts", { cache: "no-store" });
        const data = (await response.json()) as { accounts?: RawAccount[]; data?: RawAccount[] } | RawAccount[];
        const list = Array.isArray(data) ? data : (data.accounts ?? data.data ?? []);
        if (!alive) return;
        setRows(list.map(toRow).filter((row): row is Row => row !== null).sort((a, b) => a.name.localeCompare(b.name)));
        await loadChecks();
      } catch {
        if (alive) setError("The accounts did not load. Refresh the page to try again.");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [loadChecks]);

  const subs = useMemo(() => [...new Set(rows.map((r) => r.sub).filter(Boolean))].sort((a, b) => a.localeCompare(b)), [rows]);
  const towns = useMemo(() => [...new Set(rows.map((r) => r.town).filter(Boolean))].sort((a, b) => a.localeCompare(b)), [rows]);
  const nearRow = near.selected ? rows.find((r) => r.id === near.selected!.id) ?? null : null;

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    const listIds = listOnly && currentList ? new Set(currentList.accountIds) : null;
    return rows.filter((r) => {
      if (listIds && !listIds.has(r.id)) return false;
      if (term && !r.search.includes(term)) return false;
      if (statusFilter === "active" ? !isActive(r.status) : isCancelled(r.status)) return false;
      if (managerFilter !== "All" && !managerMatches(r.manager, managerFilter)) return false;
      if (subFilter !== "All" && r.sub !== subFilter) return false;
      if (townFilter && r.town !== townFilter) return false;
      if (emailOnly && !hasEmail(r)) return false;
      if (!matchesLastVisited(lastVisitedFilter, lastVisits, r.id, today)) return false;
      if (!matchesCheckin(checkinFilter, last[r.id])) return false;
      if (nearRow) {
        if (r.id === nearRow.id || nearRow.lat === null || nearRow.lng === null) return false;
        const miles = distanceInMiles({ latitude: nearRow.lat, longitude: nearRow.lng }, { latitude: r.lat, longitude: r.lng });
        if (miles === null || miles > radius) return false;
      }
      return true;
    });
  }, [rows, search, statusFilter, managerFilter, subFilter, townFilter, emailOnly, hasEmail, lastVisitedFilter, lastVisits, today, checkinFilter, last, nearRow, radius, listOnly, currentList]);

  const filtersOn =
    (statusFilter !== "active" ? 1 : 0) +
    (managerFilter !== "All" ? 1 : 0) +
    (subFilter !== "All" ? 1 : 0) +
    (townFilter ? 1 : 0) +
    (!emailOnly ? 1 : 0) +
    (lastVisitedFilter !== "any" ? 1 : 0) +
    (checkinFilter !== "any" ? 1 : 0) +
    (nearRow ? 1 : 0);

  function clearFilters() {
    setSearch("");
    setStatusFilter("active");
    setManagerFilter("All");
    setSubFilter("All");
    setTownFilter("");
    setEmailOnly(true);
    setLastVisitedFilter("any");
    setCheckinFilter("any");
    near.clear();
    setListOnly(false);
  }

  function toggle(id: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const allFilteredSelected = filtered.length > 0 && filtered.every((r) => selected.has(r.id));
  function selectAllFiltered() {
    setSelected((current) => {
      const next = new Set(current);
      if (allFilteredSelected) for (const r of filtered) next.delete(r.id);
      else for (const r of filtered) next.add(r.id);
      return next;
    });
  }

  function pickList(value: string) {
    const id = Number(value) || null;
    setListId(id);
    const list = lists.find((entry) => entry.id === id);
    setSelected(new Set(list?.accountIds ?? []));
    setListOnly(Boolean(list));
  }

  /** `list`: sending to a saved list as it is saved (History shows its name). */
  function openSend(ids: string[], list: CheckinList | null = null) {
    setSendIds(ids);
    setSendList(list);
    setSendOpen(true);
  }

  async function saveList() {
    setSaving(true);
    try {
      const response = await fetch("/api/customer-checkin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "saveList", id: saveAsNew ? null : listId, name: saveName, accountIds: [...selected] }),
      });
      const data = (await response.json()) as { success?: boolean; error?: string; id?: number };
      if (!data.success) {
        showToast(data.error || "The list was not saved.", "bad");
        return;
      }
      showToast(`Saved "${saveName.trim()}" ✓`);
      setSaveOpen(false);
      await loadChecks();
      setListId(data.id ?? null);
    } finally {
      setSaving(false);
    }
  }

  async function deleteList() {
    if (!currentList) return;
    const response = await fetch("/api/customer-checkin", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "deleteList", id: currentList.id }) });
    const data = (await response.json()) as { success?: boolean; error?: string };
    if (!data.success) {
      showToast(data.error || "The list was not deleted.", "bad");
      return;
    }
    showToast(`Deleted "${currentList.name}"`);
    setDeleteOpen(false);
    setListId(null);
    setListOnly(false);
    setSelected(new Set());
    await loadChecks();
  }

  const selectedCount = selected.size;
  const listChanged = currentList ? currentList.accountIds.length !== selected.size || currentList.accountIds.some((id) => !selected.has(id)) : false;

  return (
    <Screen title="Check-ins" subtitle="How is your cleaning going? Ask customers, see their answers." backHref="/accounts-center">
      <Tabs
        label="Check-ins"
        tabs={[
          { value: "send", label: "Send" },
          { value: "history", label: "History" },
        ]}
        value={tab}
        onChange={setTab}
      />

      {!ready ? <ErrorBox title="Not ready yet" text="Check-ins need migration 079 before anything can be sent." /> : null}
      {error ? <ErrorBox title="That did not work." text={error} /> : null}

      {tab === "history" ? (
        <HistoryTab />
      ) : (
        <>
          <SearchBar value={search} onChange={setSearch} label="Find an account" placeholder="Find an account" />

          <Card title="Saved lists">
            <div className="ui-stack">
              <SelectField label="List" value={listId ? String(listId) : ""} onChange={(e) => pickList(e.target.value)}>
                <option value="">No list (pick accounts below)</option>
                {lists.map((list) => (
                  <option key={list.id} value={list.id}>
                    {list.name} ({list.accountIds.length})
                  </option>
                ))}
              </SelectField>
              {currentList ? (
                <>
                  <label className="ui-actions-row" style={{ alignItems: "center", gap: 8 }}>
                    <input type="checkbox" className="h-6 w-6" checked={listOnly} onChange={(e) => setListOnly(e.target.checked)} />
                    <span>Show only this list&apos;s accounts (untick to add others)</span>
                  </label>
                  <div className="ui-actions-row">
                    <BigButton disabled={!ready || currentList.accountIds.length === 0} onClick={() => openSend(currentList.accountIds, currentList)}>
                      Send to &quot;{currentList.name}&quot; ({currentList.accountIds.length})
                    </BigButton>
                    <BigButton
                      kind="second"
                      onClick={() => {
                        setSaveName(currentList.name);
                        setSaveAsNew(false);
                        setSaveOpen(true);
                      }}
                    >
                      {listChanged ? `Save changes (${selectedCount} accounts)` : "Rename list"}
                    </BigButton>
                    <BigButton kind="quiet" onClick={() => setDeleteOpen(true)}>
                      Delete list
                    </BigButton>
                  </div>
                  <p className="ui-muted">Tick or untick accounts below, then Save changes. Created by {currentList.createdBy || "someone"}.</p>
                </>
              ) : null}
            </div>
          </Card>

          <div className="ui-actions-row">
            <BigButton kind="second" onClick={() => setShowFilters(true)}>
              {filtersOn ? `Filters (${filtersOn} on)` : "Filters"}
            </BigButton>
            <BigButton kind="quiet" onClick={clearFilters}>
              Clear filters
            </BigButton>
            <BigButton kind="second" disabled={filtered.length === 0} onClick={selectAllFiltered}>
              {allFilteredSelected ? "Unselect all filtered" : `Select all filtered (${filtered.length})`}
            </BigButton>
          </div>

          <p className="ui-muted" role="status">
            {loading ? "Loading accounts…" : `Showing ${filtered.length} of ${rows.length} · ${selectedCount} selected`}
          </p>

          <div className="ui-actions-row">
            <BigButton disabled={!ready || selectedCount === 0} onClick={() => openSend([...selected])}>
              {selectedCount === 1 ? "Send check-in to 1 account" : `Send check-in to ${selectedCount} accounts`}
            </BigButton>
            <BigButton
              kind="second"
              disabled={!ready || selectedCount === 0}
              onClick={() => {
                setSaveName("");
                setSaveAsNew(true);
                setSaveOpen(true);
              }}
            >
              Save as list
            </BigButton>
            {selectedCount > 0 ? (
              <BigButton kind="quiet" onClick={() => setSelected(new Set())}>
                Clear selection
              </BigButton>
            ) : null}
          </div>

          {loading ? (
            <SkeletonList rows={4} />
          ) : filtered.length === 0 ? (
            <EmptyState title="No accounts here" text="Tap Clear filters to see them all." />
          ) : (
            <CardList
              label="Accounts"
              items={filtered}
              getKey={(r) => r.id}
              renderCard={(r) => (
                <Card
                  title={
                    <label style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <input type="checkbox" className="h-7 w-7 shrink-0" checked={selected.has(r.id)} onChange={() => toggle(r.id)} aria-label={`Select ${r.name}`} />
                      <span>{r.name}</span>
                    </label>
                  }
                >
                  <p className="ui-card-text">
                    {[r.manager || "No manager", r.town, hasEmail(r) ? "" : "No email", optedOut.has(r.id) ? "Stopped emails" : ""].filter(Boolean).join(" · ")}
                  </p>
                  <p className="ui-card-text">Last visited: {lastVisitText(lastVisits?.[r.id], today)}</p>
                  <p className="ui-card-text">Last check-in: {lastCheckinText(last[r.id])}</p>
                </Card>
              )}
              columns={[
                {
                  header: "",
                  cell: (r) => <input type="checkbox" className="h-6 w-6" checked={selected.has(r.id)} onChange={() => toggle(r.id)} aria-label={`Select ${r.name}`} />,
                },
                {
                  header: "Account",
                  cell: (r) => (
                    <Link className="ui-link" href={`/accounts/${encodeURIComponent(r.id)}`}>
                      {r.name}
                    </Link>
                  ),
                },
                { header: "Manager", cell: (r) => r.manager || "None" },
                { header: "Town", cell: (r) => r.town || "-" },
                { header: "Email", cell: (r) => (optedOut.has(r.id) ? "Stopped emails" : hasEmail(r) ? "Yes" : "No email") },
                { header: "Last visited", cell: (r) => lastVisitText(lastVisits?.[r.id], today) },
                { header: "Last check-in", cell: (r) => lastCheckinText(last[r.id]) },
              ]}
            />
          )}
        </>
      )}

      <Sheet open={showFilters} title="Filters" onClose={() => setShowFilters(false)} closeLabel="Done">
        <SelectField label="Status" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as "active" | "all")}>
          <option value="active">Active</option>
          <option value="all">All but cancelled</option>
        </SelectField>
        <SelectField label="Manager" value={managerFilter} onChange={(e) => setManagerFilter(e.target.value)}>
          <option value="All">All</option>
          <ManagerOptions names={managerNames} current={managerFilter === "All" ? "" : managerFilter} />
        </SelectField>
        <SelectField label="Sub" value={subFilter} onChange={(e) => setSubFilter(e.target.value)}>
          <option value="All">All</option>
          {subs.map((sub) => (
            <option key={sub} value={sub}>
              {sub}
            </option>
          ))}
        </SelectField>
        <SelectField label="Town" value={townFilter} onChange={(e) => setTownFilter(e.target.value)}>
          <option value="">All</option>
          {towns.map((town) => (
            <option key={town} value={town}>
              {town}
            </option>
          ))}
        </SelectField>
        <LastVisitedField value={lastVisitedFilter} onChange={setLastVisitedFilter} loaded={lastVisits !== null} failed={lastVisitsFailed} />
        <SelectField label="Last check-in" value={checkinFilter} onChange={(e) => setCheckinFilter(e.target.value as CheckinFilter)}>
          {CHECKIN_FILTERS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </SelectField>
        <AutocompleteField
          label="Near account"
          placeholder="Type an account name"
          query={near.query}
          onQueryChange={near.setQuery}
          options={near.options}
          loading={near.loading}
          selected={near.selected}
          onSelect={near.select}
          onClear={near.clear}
        />
        {near.selected ? (
          <SelectField label="Within" value={String(radius)} onChange={(e) => setRadius(Number(e.target.value))}>
            {RADIUS_OPTIONS.map((miles) => (
              <option key={miles} value={miles}>
                {miles} miles
              </option>
            ))}
          </SelectField>
        ) : null}
        <label className="ui-actions-row" style={{ alignItems: "center", gap: 8 }}>
          <input type="checkbox" className="h-6 w-6" checked={emailOnly} onChange={(e) => setEmailOnly(e.target.checked)} />
          <span>Hide accounts with no email</span>
        </label>
        <p className="ui-muted" role="status">
          {filtered.length} of {rows.length}
        </p>
        <div>
          <BigButton kind="quiet" onClick={clearFilters}>
            Clear filters
          </BigButton>
        </div>
      </Sheet>

      <Sheet
        open={saveOpen}
        title={saveAsNew ? "Save as list" : "Save list"}
        text={`${selectedCount} account${selectedCount === 1 ? "" : "s"} selected.`}
        onClose={() => setSaveOpen(false)}
        busy={saving}
        actions={
          <BigButton busy={saving} busyLabel="Saving…" disabled={!saveName.trim()} onClick={() => void saveList()}>
            Save
          </BigButton>
        }
      >
        <Field label="List name" placeholder="Drew's accounts" value={saveName} onChange={(e) => setSaveName(e.target.value)} />
        {currentList && !saveAsNew ? (
          <div>
            <BigButton kind="quiet" onClick={() => setSaveAsNew(true)}>
              Save as a new list instead
            </BigButton>
          </div>
        ) : null}
      </Sheet>

      <Sheet
        open={deleteOpen}
        title="Delete list?"
        text={currentList ? `"${currentList.name}" goes away. The accounts and the check-ins already sent stay.` : undefined}
        onClose={() => setDeleteOpen(false)}
        actions={
          <BigButton onClick={() => void deleteList()}>
            Delete list
          </BigButton>
        }
      />

      <CheckinSendSheet
        open={sendOpen}
        accountIds={sendIds}
        kind={sendList ? "list" : "picked"}
        listId={sendList?.id ?? null}
        listName={sendList?.name ?? ""}
        onClose={() => setSendOpen(false)}
        onSent={() => {
          setSendOpen(false);
          setSelected(new Set());
          void loadChecks();
        }}
      />
    </Screen>
  );
}

/* ---------- History ---------- */

const accountHref = (id: string) => `/accounts/${encodeURIComponent(id)}`;

/** The send's account(s): one is a link; more is the first + "+N more" (hover for the names, tap for the list of links). */
function SendAccounts({ accounts }: { accounts: CheckinBatch["accounts"] }) {
  const [open, setOpen] = useState(false);
  if (accounts.length === 0) return <span className="ui-muted">—</span>;
  const link = (a: CheckinBatch["accounts"][number]) => (
    <Link className="ui-link" href={accountHref(a.id)}>
      {a.name}
    </Link>
  );
  if (accounts.length === 1) return link(accounts[0]);
  const rest = accounts.slice(1);
  return (
    <span>
      {link(accounts[0])}{" "}
      <button type="button" className="ui-link" title={rest.map((a) => a.name).join(", ")} aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        +{rest.length} more
      </button>
      {open ? (
        <ul className="ui-card-text" style={{ margin: "4px 0 0", paddingLeft: 18 }}>
          {rest.map((a) => (
            <li key={a.id}>{link(a)}</li>
          ))}
        </ul>
      ) : null}
    </span>
  );
}

type BatchDetail = { batch: CheckinBatch; rows: CheckinRow[]; skipped: CheckinSkip[] };

function HistoryTab() {
  const [batches, setBatches] = useState<CheckinBatch[] | null>(null);
  const [openId, setOpenId] = useState<number | null>(null);
  const [detail, setDetail] = useState<BatchDetail | null>(null);
  const [viewId, setViewId] = useState<number | null>(null);
  const [search, setSearch] = useState("");

  useEffect(() => {
    let alive = true;
    fetch("/api/customer-checkin?view=batches", { cache: "no-store" })
      .then((r) => r.json())
      .then((data: { batches?: CheckinBatch[] }) => alive && setBatches(data.batches ?? []))
      .catch(() => alive && setBatches([]));
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!openId) return;
    let alive = true;
    fetch(`/api/customer-checkin?batch=${openId}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((data: { success?: boolean } & BatchDetail) => alive && setDetail(data.success ? data : null))
      .catch(() => alive && setDetail(null));
    return () => {
      alive = false;
    };
  }, [openId]);

  const how = (b: CheckinBatch) => (b.kind === "list" && b.listName ? `List: ${b.listName}` : BATCH_KIND_TEXT[b.kind]);

  if (!batches) return <SkeletonList rows={3} />;
  if (batches.length === 0) return <EmptyState title="Nothing sent yet" text="Check-ins you send show here." />;

  // Search by account name: a send matches when any of its accounts does.
  const query = search.trim().toLowerCase();
  const shown = query ? batches.filter((b) => b.accounts.some((a) => a.name.toLowerCase().includes(query))) : batches;
  const openButton = (b: CheckinBatch) => (
    <button type="button" className="ui-link" onClick={() => setOpenId(b.id)}>
      {whenText(b.createdAt)}
    </button>
  );

  return (
    <>
      <SearchBar value={search} onChange={setSearch} label="Search by account" placeholder="Search by account" />
      <p className="ui-muted">{CHECKIN_VIEWED_NOTE}</p>
      {shown.length === 0 ? <EmptyState title="No sends for that account" text="Check the spelling, or clear the search." /> : null}
      <CardList
        label="Check-in sends"
        items={shown}
        getKey={(b) => String(b.id)}
        renderCard={(b) => (
          // Not a whole-card button: the account names inside are links. The date opens the send.
          <Card title={openButton(b)}>
            <p className="ui-card-text">
              <SendAccounts accounts={b.accounts} />
            </p>
            <p className="ui-card-text">
              {how(b)} · by {b.createdBy || "Office"}
            </p>
            <p className="ui-card-text">
              Sent {b.sent}
              {b.queued ? ` · Queued ${b.queued}` : ""}
              {b.failed ? ` · Failed ${b.failed}` : ""} · Skipped {b.skipped} · 👁 Viewed {b.viewed} · Answered {b.answered}
              {b.attention ? ` · 😟 ${b.attention}` : ""}
            </p>
          </Card>
        )}
        columns={[
          { header: "When", cell: (b) => openButton(b) },
          { header: "Account", cell: (b) => <SendAccounts accounts={b.accounts} /> },
          { header: "Who", cell: (b) => b.createdBy || "Office" },
          { header: "List", cell: (b) => how(b) },
          { header: "Sent", cell: (b) => String(b.sent) },
          { header: "Queued", cell: (b) => String(b.queued) },
          { header: "Failed", cell: (b) => String(b.failed) },
          { header: "Skipped", cell: (b) => String(b.skipped) },
          { header: "👁 Viewed", cell: (b) => String(b.viewed) },
          { header: "Answered", cell: (b) => `${b.answered}${b.attention ? ` (😟 ${b.attention})` : ""}` },
        ]}
      />

      <Sheet
        open={openId !== null}
        title={detail ? `Sent ${whenText(detail.batch.createdAt)}` : "Check-in send"}
        text={detail ? `${how(detail.batch)} · by ${detail.batch.createdBy || "Office"}` : undefined}
        onClose={() => {
          setOpenId(null);
          setDetail(null);
        }}
      >
        {!detail ? (
          <p className="ui-muted">Loading…</p>
        ) : (
          <div className="ui-stack">
            <p className="ui-muted">{CHECKIN_VIEWED_NOTE} Hover a step for its date and time.</p>
            {detail.rows.map((row) => (
              <div key={row.id} style={{ borderTop: "1px solid #dbeafe", paddingTop: 10 }}>
                <div className="ui-actions-row" style={{ justifyContent: "space-between" }}>
                  <Link className="ui-link ui-strong" href={`/accounts/${encodeURIComponent(row.accountId)}`}>
                    {row.accountName || row.accountId}
                  </Link>
                  <CheckinProgress row={row} />
                </div>
                <p className="ui-muted">
                  {row.sentAt ? `Sent ${whenText(row.sentAt)}` : `Queued ${whenText(row.createdAt)}`}
                  {row.sentTo ? ` · to ${row.sentTo}` : ""}
                  {row.error ? ` · ${row.error}` : ""}
                </p>
                {row.status === "sent" ? <CheckinAnswer row={row} /> : null}
                {row.hasCopy ? (
                  <div style={{ marginTop: 6 }}>
                    <BigButton kind="quiet" onClick={() => setViewId(row.id)}>
                      View email
                    </BigButton>
                  </div>
                ) : null}
              </div>
            ))}
            {detail.skipped.length ? (
              <div style={{ borderTop: "1px solid #dbeafe", paddingTop: 10 }}>
                <p className="ui-strong">Skipped ({detail.skipped.length})</p>
                <ul className="ui-card-text" style={{ margin: 0, paddingLeft: 18 }}>
                  {detail.skipped.map((skip) => (
                    <li key={skip.accountId}>
                      {skip.accountName} — {skip.reason}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        )}
      </Sheet>
      <CheckinEmailSheet checkinId={viewId} onClose={() => setViewId(null)} />
    </>
  );
}
