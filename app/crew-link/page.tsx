"use client";

// CW Now (Crew Link) home (side menu → CW Now): every account at a glance,
// with a big colored status, and the account's CW Now card one tap away.
//   ⚪ Not set up  ·  🟡 Sent, not used yet  ·  🟢 In use  ·  🔴 Not used in
//   2+ service days (app/api/crew-link/accounts). Filters: status, manager.
//   "Set up" on a Not set up account opens its card with the setup wizard.
// Tap an account: the SAME card the account page shows (ChecklistTemplateEditor:
// Send, Crew list, Edit checklist, More options), plus the account's History.
// Submitted checklists are one tap away (all accounts at the top, one account
// on each card).
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import ChecklistTemplateEditor from "@/app/components/ChecklistTemplateEditor";
import AccountHistory from "@/app/components/AccountHistory";
import AccountLink from "@/app/components/AccountLink";
import { CREW_USAGE, whenShort, type CrewUsage } from "@/lib/crewLinkPeople";
import { checklistStatusWords } from "@/lib/cwNowHelp";

type CrewLinkAccount = {
  accountId: string;
  accountName: string;
  address: string;
  status: string;
  manager: string;
  checklistNeeded: boolean;
  supplyOrders: boolean;
  problemReports: boolean;
  tabCount: number;
  itemCount: number;
  lastSubmittedAt: string | null;
  usage: CrewUsage;
  missedDays: number;
  checklistLive: boolean;
  checklistMissedDays: number | null;
  crewCount: number;
  lastSentAt: string;
};

type StatusFilter = "all" | CrewUsage;
const STATUS_ORDER: CrewUsage[] = ["stopped", "notUsedYet", "inUse", "notSetUp"];
const isActive = (a: CrewLinkAccount) => a.status.trim().toLowerCase() === "active";

/** The line under the status: when it was last used or sent, and the crew. */
function detailLine(a: CrewLinkAccount): string {
  if (a.usage === "notSetUp") return "";
  // The plain status line already says the crew and when it was last done.
  if (a.checklistLive) return a.lastSentAt ? `Sent ${whenShort(a.lastSentAt)}` : "";
  const parts = [
    a.lastSubmittedAt ? `Last used ${whenShort(a.lastSubmittedAt)}` : "",
    a.usage === "stopped" && a.missedDays ? `${a.missedDays} service days with no checklist` : "",
    a.crewCount ? `${a.crewCount} on the crew list` : "No crew list",
    a.lastSentAt ? `sent ${whenShort(a.lastSentAt)}` : "",
  ].filter(Boolean);
  return parts.join(" · ");
}

/** "Sent, not used yet" says "not sent yet" when no one was sent the link from the crew list. */
function usageLabel(a: CrewLinkAccount): string {
  if (a.usage === "notUsedYet" && !a.lastSentAt) return "Set up, not sent yet";
  return CREW_USAGE[a.usage].label;
}

export default function CrewLinkHomePage() {
  const [accounts, setAccounts] = useState<CrewLinkAccount[] | null>(null);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [manager, setManager] = useState("");
  const [selected, setSelected] = useState<{ account: CrewLinkAccount; setup: boolean } | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    fetch("/api/crew-link/accounts", { cache: "no-store" })
      .then((res) => res.json())
      .then((data: { success?: boolean; accounts?: CrewLinkAccount[]; error?: string }) => {
        if (data.success) setAccounts(data.accounts ?? []);
        else setError(data.error || "Could not load accounts.");
      })
      .catch(() => setError("Could not load accounts."));
  }, [reloadKey]);

  const query = search.trim().toLowerCase();
  // The chips count active accounts (searching looks through every account).
  const active = useMemo(() => (accounts ?? []).filter(isActive), [accounts]);
  const managers = useMemo(() => [...new Set(active.map((a) => a.manager).filter(Boolean))].sort((a, b) => a.localeCompare(b)), [active]);
  const byManager = active.filter((a) => !manager || a.manager === manager);
  const counts = useMemo(() => {
    const result: Record<StatusFilter, number> = { all: byManager.length, notSetUp: 0, notUsedYet: 0, inUse: 0, stopped: 0 };
    for (const a of byManager) result[a.usage] += 1;
    return result;
  }, [byManager]);
  const setUpCount = byManager.length - counts.notSetUp;

  const shown = (query ? accounts ?? [] : byManager)
    .filter((a) => (query ? [a.accountName, a.address, a.accountId, a.manager].some((t) => t.toLowerCase().includes(query)) : status === "all" || a.usage === status))
    .sort((a, b) => STATUS_ORDER.indexOf(a.usage) - STATUS_ORDER.indexOf(b.usage) || a.accountName.localeCompare(b.accountName))
    .slice(0, 150);

  function open(account: CrewLinkAccount, setup: boolean) {
    setSelected({ account, setup });
    window.scrollTo({ top: 0 });
  }

  if (selected) {
    const a = selected.account;
    return (
      <main className="ui-screen">
        <div className="ui-screen-body">
          <button
            type="button"
            onClick={() => {
              setSelected(null);
              setReloadKey((key) => key + 1);
            }}
            className="ui-btn ui-btn-second"
          >
            ← All accounts
          </button>
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div>
              <h1 className="ui-screen-title">
                <AccountLink accountId={a.accountId} name={a.accountName} />
              </h1>
              {a.address ? <p className="ui-muted">{a.address}</p> : null}
            </div>
            <Link href={`/accounts/${encodeURIComponent(a.accountId)}`} className="ui-link">
              Open account page →
            </Link>
          </div>

          <section className="ui-card">
            <ChecklistTemplateEditor key={a.accountId} accountId={a.accountId} accountName={a.accountName} startSetup={selected.setup} />
          </section>

          <AccountHistory key={`history-${a.accountId}`} accountId={a.accountId} />
        </div>
      </main>
    );
  }

  const chip = (key: StatusFilter, label: string) => (
    <button
      key={key}
      type="button"
      onClick={() => setStatus(key)}
      aria-pressed={status === key}
      className={`min-h-[48px] rounded-full border-2 px-4 text-base font-bold ${
        status === key ? "border-blue-700 bg-blue-700 text-white" : "border-slate-300 bg-white text-slate-800 hover:bg-slate-100"
      }`}
    >
      {label}
    </button>
  );

  return (
    <main className="ui-screen">
      <div className="ui-screen-body">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="ui-screen-title">CW Now</h1>
            <p className="ui-muted">
              {accounts ? `${setUpCount} of ${byManager.length} active accounts set up. ` : ""}
              Set up an account, send the crew their link, and see who is using it.
            </p>
          </div>
          <Link href="/porter-checklist/submissions" className="ui-btn ui-btn-second">
            📋 Submitted
          </Link>
        </div>

        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="🔍 Search accounts by name, address or manager"
          aria-label="Search accounts"
          autoFocus
          className="ui-input w-full"
        />

        {!query ? (
          <>
            <div className="flex flex-wrap gap-2">
              {chip("all", `All ${counts.all}`)}
              {STATUS_ORDER.map((key) => chip(key, `${CREW_USAGE[key].dot} ${CREW_USAGE[key].label} ${counts[key]}`))}
            </div>
            {managers.length ? (
              <label className="flex flex-wrap items-center gap-2">
                <span className="ui-strong">Manager</span>
                <select value={manager} onChange={(e) => setManager(e.target.value)} className="ui-input min-h-[48px] w-auto">
                  <option value="">All managers</option>
                  {managers.map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
          </>
        ) : null}

        {error ? <p className="ui-field-error">{error}</p> : null}
        {accounts === null && !error ? <p className="ui-muted">Loading…</p> : null}
        {accounts && shown.length === 0 ? <p className="ui-muted">{query ? "No account matches that search." : "Nothing here."}</p> : null}

        <div className="grid gap-3 sm:grid-cols-2">
          {shown.map((a) => {
            const usage = CREW_USAGE[a.usage];
            const detail = detailLine(a);
            const plain = a.checklistLive ? checklistStatusWords({ crew: a.crewCount, lastDoneText: a.lastSubmittedAt ? whenShort(a.lastSubmittedAt) : "", missedDays: a.checklistMissedDays }) : null;
            return (
              <div key={a.accountId} className="ui-card flex flex-col gap-2">
                <button type="button" onClick={() => open(a, false)} className="ui-stack flex-1 text-left">
                  <p className={`text-lg font-black ${usage.color}`}>
                    <span aria-hidden="true">{usage.dot}</span> {usageLabel(a)}
                  </p>
                  <p className="ui-strong">{a.accountName || a.accountId}</p>
                  {a.address ? <p className="ui-muted">{a.address}</p> : null}
                  {a.manager ? <p className="ui-muted">Manager: {a.manager}</p> : null}
                  {plain ? <p className={`text-base font-bold ${plain.warn ? "text-amber-700" : "text-green-800"}`} data-cw-row-status>{plain.text}</p> : null}
                  {detail ? <p className="ui-muted">{detail}</p> : null}
                  {!isActive(a) ? <p className="ui-muted">{a.status || "No status"}</p> : null}
                </button>
                {/* Their own buttons beside the card's button, so tapping them never opens the account panel. */}
                <div className="flex flex-wrap gap-2">
                  {a.usage === "notSetUp" ? (
                    <button type="button" onClick={() => open(a, true)} className="inline-flex min-h-[48px] items-center rounded-xl bg-green-600 px-4 text-base font-black text-white hover:bg-green-700">
                      🚀 Set up
                    </button>
                  ) : (
                    <Link
                      href={`/porter-checklist/submissions?accountId=${encodeURIComponent(a.accountId)}`}
                      className="inline-flex min-h-[40px] items-center rounded-lg border-2 border-slate-300 bg-white px-3 text-sm font-bold text-slate-800 hover:bg-slate-100"
                    >
                      📋 Submitted
                    </Link>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </main>
  );
}
