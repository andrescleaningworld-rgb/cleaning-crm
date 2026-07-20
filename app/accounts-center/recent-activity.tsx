"use client";

import { useEffect, useState } from "react";

type RecentItem = {
  name: string;
  date: string;
};

type RawAccount = {
  accountName?: string;
  accountStartDate?: string;
};

type RawVisit = {
  accountName?: string;
  date?: string;
};

type RawComplaint = {
  accountName?: string;
  date?: string;
};

function clean(value: unknown): string {
  return String(value ?? "").trim();
}

function getTime(value: string): number {
  if (!value) return 0;
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? 0 : time;
}

function formatDate(value: string): string {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function mostRecentFive(items: RecentItem[]): RecentItem[] {
  return items
    .filter((item) => item.date)
    .sort((a, b) => getTime(b.date) - getTime(a.date))
    .slice(0, 5);
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

// Accounts have no distinct "created at" field — accountStartDate is the
// closest available date and is already used elsewhere (Accounts page sort
// options) as the recency proxy for an account.
async function fetchRecentAccounts(): Promise<RecentItem[]> {
  const response = await fetch("/api/accounts", { cache: "no-store" });
  const data = await readJson<{ success?: boolean; accounts?: RawAccount[]; data?: RawAccount[] }>(response);
  if (!response.ok || data.success === false) return [];
  const accounts = data.accounts ?? data.data ?? [];
  return mostRecentFive(
    accounts.map((a) => ({ name: clean(a.accountName) || "Unnamed Account", date: clean(a.accountStartDate) }))
  );
}

async function fetchRecentVisits(): Promise<RecentItem[]> {
  const response = await fetch("/api/visits", { cache: "no-store" });
  const data = await readJson<{ success?: boolean; visits?: RawVisit[]; data?: RawVisit[] }>(response);
  if (!response.ok || data.success === false) return [];
  const visits = data.visits ?? data.data ?? [];
  return mostRecentFive(visits.map((v) => ({ name: clean(v.accountName) || "Unnamed Account", date: clean(v.date) })));
}

async function fetchRecentComplaints(): Promise<RecentItem[]> {
  const response = await fetch("/api/complaints", { cache: "no-store" });
  const data = await readJson<{ success?: boolean; complaints?: RawComplaint[]; data?: RawComplaint[] }>(response);
  if (!response.ok || data.success === false) return [];
  const complaints = data.complaints ?? data.data ?? [];
  return mostRecentFive(
    complaints.map((c) => ({ name: clean(c.accountName) || "Unnamed Account", date: clean(c.date) }))
  );
}

function RecentList({
  title,
  items,
  loading,
  emptyLabel,
}: {
  title: string;
  items: RecentItem[];
  loading: boolean;
  emptyLabel: string;
}) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
      <h3 className="text-xs font-black uppercase tracking-wide text-gray-500">{title}</h3>
      {loading ? (
        <p className="mt-3 text-sm text-gray-500">Loading...</p>
      ) : items.length === 0 ? (
        <p className="mt-3 text-sm text-gray-500">{emptyLabel}</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {items.map((item, index) => (
            <li key={`${index}-${item.name}`} className="flex items-center justify-between gap-3 text-sm">
              <span className="truncate font-semibold text-gray-900">{item.name}</span>
              <span className="shrink-0 text-xs text-gray-500">{formatDate(item.date)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function RecentActivitySummary() {
  const [recentAccounts, setRecentAccounts] = useState<RecentItem[]>([]);
  const [recentVisits, setRecentVisits] = useState<RecentItem[]>([]);
  const [recentComplaints, setRecentComplaints] = useState<RecentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError("");
      try {
        const [accounts, visits, complaints] = await Promise.all([
          fetchRecentAccounts(),
          fetchRecentVisits(),
          fetchRecentComplaints(),
        ]);
        if (cancelled) return;
        setRecentAccounts(accounts);
        setRecentVisits(visits);
        setRecentComplaints(complaints);
      } catch {
        if (!cancelled) setError("Could not load recent activity.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <section className="mx-auto max-w-7xl px-4 pt-6 sm:px-6">
      {error ? (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">
          {error}
        </div>
      ) : null}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <RecentList title="Recent Accounts" items={recentAccounts} loading={loading} emptyLabel="No recent accounts." />
        <RecentList title="Recent Visits" items={recentVisits} loading={loading} emptyLabel="No recent visits." />
        <RecentList
          title="Recent Complaints"
          items={recentComplaints}
          loading={loading}
          emptyLabel="No recent complaints."
        />
      </div>
    </section>
  );
}
