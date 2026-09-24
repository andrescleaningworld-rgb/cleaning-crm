"use client";

// Crew Link home (dashboard → Crew Link): find any account's checklist and
// share it without going through the account page. Search by name or
// address, tap an account, and the SAME Crew Link panel the account page
// shows opens here (link, Share / QR / print sign, checklist tabs + editor,
// orders & problems, Review translations), plus the account's History. The
// account page keeps all of it too. Submitted checklists are one tap away.
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import ChecklistTemplateEditor from "@/app/components/ChecklistTemplateEditor";
import AccountHistory from "@/app/components/AccountHistory";
import { formatCrewDateTime } from "@/lib/crewDateTime";

type CrewLinkAccount = {
  accountId: string;
  accountName: string;
  address: string;
  status: string;
  checklistNeeded: boolean;
  supplyOrders: boolean;
  problemReports: boolean;
  tabCount: number;
  itemCount: number;
  lastSubmittedAt: string | null;
};

type Filter = "setUp" | "notSetUp" | "all";

const isSetUp = (a: CrewLinkAccount) => a.checklistNeeded || a.supplyOrders || a.problemReports;
const isActive = (a: CrewLinkAccount) => a.status.trim().toLowerCase() === "active";

function statusLine(a: CrewLinkAccount): string {
  if (!isSetUp(a)) return "Not set up";
  const parts = [
    a.checklistNeeded ? `Checklist · ${a.tabCount} tab${a.tabCount === 1 ? "" : "s"} · ${a.itemCount} item${a.itemCount === 1 ? "" : "s"}` : null,
    a.supplyOrders ? "Supplies" : null,
    a.problemReports ? "Problems" : null,
  ].filter(Boolean);
  return parts.join(" · ");
}

export default function CrewLinkHomePage() {
  const [accounts, setAccounts] = useState<CrewLinkAccount[] | null>(null);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("setUp");
  const [selected, setSelected] = useState<CrewLinkAccount | null>(null);

  useEffect(() => {
    fetch("/api/crew-link/accounts", { cache: "no-store" })
      .then((res) => res.json())
      .then((data: { success?: boolean; accounts?: CrewLinkAccount[]; error?: string }) => {
        if (data.success) setAccounts(data.accounts ?? []);
        else setError(data.error || "Could not load accounts.");
      })
      .catch(() => setError("Could not load accounts."));
  }, []);

  const query = search.trim().toLowerCase();
  const counts = useMemo(() => {
    const active = (accounts ?? []).filter(isActive);
    return { setUp: active.filter(isSetUp).length, notSetUp: active.filter((a) => !isSetUp(a)).length, all: (accounts ?? []).length };
  }, [accounts]);

  // Searching looks through every account (any status); otherwise the
  // filter chips apply to active accounts.
  const shown = (accounts ?? [])
    .filter((a) =>
      query
        ? [a.accountName, a.address, a.accountId].some((t) => t.toLowerCase().includes(query))
        : filter === "all" || (isActive(a) && (filter === "setUp" ? isSetUp(a) : !isSetUp(a)))
    )
    .sort((a, b) => Number(isSetUp(b)) - Number(isSetUp(a)) || a.accountName.localeCompare(b.accountName))
    .slice(0, 100);

  if (selected) {
    return (
      <main className="min-h-screen bg-slate-50 px-4 py-6">
        <div className="mx-auto max-w-4xl space-y-4">
          <button
            type="button"
            onClick={() => setSelected(null)}
            className="inline-flex min-h-[48px] items-center gap-2 rounded-xl bg-white px-4 text-base font-bold text-blue-800 shadow-sm hover:bg-slate-100"
          >
            ← All accounts
          </button>
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div>
              <h1 className="text-3xl font-black text-slate-900">{selected.accountName}</h1>
              {selected.address ? <p className="text-slate-600">{selected.address}</p> : null}
            </div>
            <Link href={`/accounts/${encodeURIComponent(selected.accountId)}`} className="text-sm font-bold text-blue-700 hover:underline">
              Open account page →
            </Link>
          </div>

          {isSetUp(selected) ? (
            <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
              <ChecklistTemplateEditor key={selected.accountId} accountId={selected.accountId} accountName={selected.accountName} defaultOpen />
            </section>
          ) : (
            <section className="rounded-3xl border border-amber-200 bg-amber-50 p-5">
              <p className="text-lg font-bold text-amber-900">Crew Link is not turned on for this account.</p>
              <p className="mt-1 text-sm text-amber-900">Turn on &quot;Checklist Needed&quot; (or supply orders / problem reports) on the account&apos;s edit page, then come back here.</p>
              <Link
                href={`/accounts/${encodeURIComponent(selected.accountId)}/edit`}
                className="mt-3 inline-flex min-h-[48px] items-center rounded-xl bg-blue-700 px-5 text-base font-bold text-white hover:bg-blue-800"
              >
                Edit account
              </Link>
            </section>
          )}

          <AccountHistory key={`history-${selected.accountId}`} accountId={selected.accountId} />
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-6">
      <div className="mx-auto max-w-4xl space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-3xl font-black text-slate-900">Crew Link</h1>
            <p className="text-slate-600">Find an account&apos;s checklist, edit it, and share it with the crew.</p>
          </div>
          <Link
            href="/porter-checklist/submissions"
            className="inline-flex min-h-[48px] items-center rounded-xl border border-slate-300 bg-white px-4 text-base font-bold text-slate-800 shadow-sm hover:bg-slate-100"
          >
            📋 Submitted checklists
          </Link>
        </div>

        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="🔍 Search accounts by name or address"
          aria-label="Search accounts"
          autoFocus
          className="min-h-[60px] w-full rounded-2xl border-2 border-slate-300 bg-white px-5 text-lg outline-none focus:border-blue-600"
        />

        {!query ? (
          <div className="flex flex-wrap gap-2">
            {(
              [
                ["setUp", `Set up ${counts.setUp}`],
                ["notSetUp", `Not set up ${counts.notSetUp}`],
                ["all", `All accounts ${counts.all}`],
              ] as [Filter, string][]
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setFilter(key)}
                aria-pressed={filter === key}
                className={`min-h-[44px] rounded-full border-2 px-4 text-base font-bold ${
                  filter === key ? "border-blue-700 bg-blue-700 text-white" : "border-slate-300 bg-white text-slate-800 hover:bg-slate-100"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        ) : null}

        {error ? <p className="rounded-xl bg-red-50 p-4 font-semibold text-red-700">{error}</p> : null}
        {accounts === null && !error ? <p className="p-6 text-center text-slate-500">Loading…</p> : null}
        {accounts && shown.length === 0 ? (
          <p className="rounded-2xl bg-white p-6 text-center text-slate-600 shadow-sm">{query ? "No account matches that search." : "Nothing here."}</p>
        ) : null}

        <div className="grid gap-3 sm:grid-cols-2">
          {shown.map((a) => (
            <button
              key={a.accountId}
              type="button"
              onClick={() => {
                setSelected(a);
                window.scrollTo({ top: 0 });
              }}
              className="rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm hover:border-blue-300 hover:bg-blue-50"
            >
              <p className="text-lg font-black text-slate-900">{a.accountName || a.accountId}</p>
              {a.address ? <p className="text-sm text-slate-600">{a.address}</p> : null}
              <p className={`mt-2 text-sm font-bold ${isSetUp(a) ? "text-green-700" : "text-slate-400"}`}>
                {isSetUp(a) ? "✅ " : ""}
                {statusLine(a)}
              </p>
              {a.lastSubmittedAt ? <p className="text-xs text-slate-500">Last checklist: {formatCrewDateTime(a.lastSubmittedAt)}</p> : null}
              {!isActive(a) ? <p className="text-xs font-bold text-slate-400">{a.status || "No status"}</p> : null}
            </button>
          ))}
        </div>
      </div>
    </main>
  );
}
