"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Card, ErrorBox, Skeleton } from "@/app/ui";

type RecentItem = {
  name: string;
  date: string;
  accountId: string;
};

type RawAccount = {
  accountId?: string;
  id?: string;
  rowNumber?: string | number;
  accountName?: string;
  accountStartDate?: string;
};

type RawVisit = {
  accountId?: string;
  accountName?: string;
  date?: string;
};

type RawComplaint = {
  accountId?: string;
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
  if (!value) return "No date";
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
    accounts.map((a) => ({
      name: clean(a.accountName) || "Unnamed Account",
      date: clean(a.accountStartDate),
      accountId: clean(a.accountId) || clean(a.id) || clean(a.rowNumber) || clean(a.accountName),
    }))
  );
}

async function fetchRecentVisits(): Promise<RecentItem[]> {
  const response = await fetch("/api/visits", { cache: "no-store" });
  const data = await readJson<{ success?: boolean; visits?: RawVisit[]; data?: RawVisit[] }>(response);
  if (!response.ok || data.success === false) return [];
  const visits = data.visits ?? data.data ?? [];
  return mostRecentFive(
    visits.map((v) => ({
      name: clean(v.accountName) || "Unnamed Account",
      date: clean(v.date),
      accountId: clean(v.accountId),
    }))
  );
}

async function fetchRecentComplaints(): Promise<RecentItem[]> {
  const response = await fetch("/api/complaints", { cache: "no-store" });
  const data = await readJson<{ success?: boolean; complaints?: RawComplaint[]; data?: RawComplaint[] }>(response);
  if (!response.ok || data.success === false) return [];
  const complaints = data.complaints ?? data.data ?? [];
  return mostRecentFive(
    complaints.map((c) => ({
      name: clean(c.accountName) || "Unnamed Account",
      date: clean(c.date),
      accountId: clean(c.accountId),
    }))
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
    <Card title={title}>
      {loading ? (
        <div className="ui-stack" aria-hidden="true">
          <Skeleton />
          <Skeleton />
        </div>
      ) : items.length === 0 ? (
        <p className="ui-card-text">{emptyLabel}</p>
      ) : (
        <ul className="ui-list-plain">
          {items.map((item, index) => (
            <li key={`${index}-${item.name}`} className="ui-card-row">
              {item.accountId ? (
                <Link href={`/accounts/${encodeURIComponent(item.accountId)}`} className="ui-table-rowlink" style={{ minWidth: 0 }}>
                  {item.name}
                </Link>
              ) : (
                <span className="ui-strong">{item.name}</span>
              )}
              <span className="ui-muted ui-nowrap">{formatDate(item.date)}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
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
    <section className="ui-stack" aria-label="Recent activity">
      {error ? <ErrorBox title="Recent activity did not load." text={error} /> : null}
      <div className="ui-three">
        <RecentList title="Recent Accounts" items={recentAccounts} loading={loading} emptyLabel="No recent accounts." />
        <RecentList title="Recent Visits" items={recentVisits} loading={loading} emptyLabel="No recent visits." />
        <RecentList title="Recent Complaints" items={recentComplaints} loading={loading} emptyLabel="No recent complaints." />
      </div>
    </section>
  );
}
