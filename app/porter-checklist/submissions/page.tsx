"use client";

import { useEffect, useState } from "react";
import type { ChecklistSubmissionSection } from "@/lib/checklistTemplate";

const PASSWORD_STORAGE_KEY = "cwChecklistSubmissionsPassword";

type SubmissionSummary = {
  id: number;
  accountId: string;
  accountName: string;
  locationName: string;
  porterName: string;
  weekOf: string | null;
  timeIn: string;
  timeOut: string;
  completedCount: number;
  totalCount: number;
  generalNotes: string;
  submittedAt: string;
};

type FlaggedAccount = { accountId: string; accountName: string };

type ListResponse = {
  success?: boolean;
  error?: string;
  submissions?: SubmissionSummary[];
  flaggedAccounts?: FlaggedAccount[];
};

type DetailResponse = {
  success?: boolean;
  error?: string;
  detail?: SubmissionSummary & { sections: ChecklistSubmissionSection[] };
};

function formatTimestamp(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function PorterChecklistSubmissionsPage() {
  const [passwordInput, setPasswordInput] = useState("");
  const [unlockedPassword, setUnlockedPassword] = useState("");
  const [unlockError, setUnlockError] = useState("");
  const [unlocking, setUnlocking] = useState(false);

  const [accountFilter, setAccountFilter] = useState("");
  const [submissions, setSubmissions] = useState<SubmissionSummary[]>([]);
  const [flaggedAccounts, setFlaggedAccounts] = useState<FlaggedAccount[]>([]);
  const [loading, setLoading] = useState(false);
  const [listError, setListError] = useState("");

  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [detail, setDetail] = useState<(SubmissionSummary & { sections: ChecklistSubmissionSection[] }) | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  useEffect(() => {
    try {
      const stored = window.sessionStorage.getItem(PASSWORD_STORAGE_KEY);
      if (stored) setUnlockedPassword(stored);
    } catch {
      // ignore — sessionStorage may be unavailable (private browsing, etc.)
    }
  }, []);

  async function loadSubmissions(password: string, accountId: string) {
    setLoading(true);
    setListError("");
    try {
      const url = accountId
        ? `/api/checklist-submissions?accountId=${encodeURIComponent(accountId)}`
        : "/api/checklist-submissions";
      const response = await fetch(url, {
        cache: "no-store",
        headers: { "x-checklist-password": password },
      });
      const data = (await response.json()) as ListResponse;
      if (response.status === 401) {
        setUnlockedPassword("");
        try { window.sessionStorage.removeItem(PASSWORD_STORAGE_KEY); } catch { /* ignore */ }
        setUnlockError("Incorrect password.");
        return;
      }
      if (!response.ok || data.success === false) {
        throw new Error(data.error ?? "Could not load submissions.");
      }
      setSubmissions(data.submissions ?? []);
      setFlaggedAccounts(data.flaggedAccounts ?? []);
    } catch (err) {
      setListError(err instanceof Error ? err.message : "Could not load submissions.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!unlockedPassword) return;
    loadSubmissions(unlockedPassword, accountFilter);
  }, [unlockedPassword, accountFilter]);

  async function handleUnlock(event: React.FormEvent) {
    event.preventDefault();
    setUnlocking(true);
    setUnlockError("");
    try {
      const response = await fetch("/api/checklist-submissions", {
        cache: "no-store",
        headers: { "x-checklist-password": passwordInput },
      });
      if (response.status === 401) {
        setUnlockError("Incorrect password.");
        return;
      }
      const data = (await response.json()) as ListResponse;
      if (!response.ok || data.success === false) {
        throw new Error(data.error ?? "Could not unlock submissions.");
      }
      setUnlockedPassword(passwordInput);
      try { window.sessionStorage.setItem(PASSWORD_STORAGE_KEY, passwordInput); } catch { /* ignore */ }
      setSubmissions(data.submissions ?? []);
      setFlaggedAccounts(data.flaggedAccounts ?? []);
    } catch (err) {
      setUnlockError(err instanceof Error ? err.message : "Could not unlock submissions.");
    } finally {
      setUnlocking(false);
    }
  }

  async function handleExpand(id: number) {
    if (expandedId === id) {
      setExpandedId(null);
      setDetail(null);
      return;
    }
    setExpandedId(id);
    setDetail(null);
    setDetailLoading(true);
    try {
      const response = await fetch(`/api/checklist-submissions?id=${id}`, {
        cache: "no-store",
        headers: { "x-checklist-password": unlockedPassword },
      });
      const data = (await response.json()) as DetailResponse;
      if (!response.ok || data.success === false || !data.detail) {
        throw new Error(data.error ?? "Could not load submission detail.");
      }
      setDetail(data.detail);
    } catch (err) {
      setListError(err instanceof Error ? err.message : "Could not load submission detail.");
    } finally {
      setDetailLoading(false);
    }
  }

  if (!unlockedPassword) {
    return (
      <div className="mx-auto max-w-sm py-16">
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <h1 className="text-xl font-black text-slate-950">Porter Checklist Submissions</h1>
          <p className="mt-2 text-sm text-slate-500">Enter the shared password to view submissions.</p>
          <form onSubmit={handleUnlock} className="mt-4 space-y-3">
            <input
              type="password"
              value={passwordInput}
              onChange={(event) => setPasswordInput(event.target.value)}
              placeholder="Password"
              className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold outline-none focus:border-blue-500"
            />
            {unlockError ? <p className="text-sm font-semibold text-red-600">{unlockError}</p> : null}
            <button
              type="submit"
              disabled={unlocking}
              className="w-full rounded-xl bg-blue-600 px-4 py-3 text-sm font-black text-white shadow-sm hover:bg-blue-500 disabled:opacity-60"
            >
              {unlocking ? "Checking…" : "Unlock"}
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-5 py-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-black text-slate-950">Porter Checklist Submissions</h1>
        <select
          value={accountFilter}
          onChange={(event) => setAccountFilter(event.target.value)}
          className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold outline-none focus:border-blue-500"
        >
          <option value="">All accounts</option>
          {flaggedAccounts.map((a) => (
            <option key={a.accountId} value={a.accountId}>
              {a.accountName}
            </option>
          ))}
        </select>
      </div>

      {listError ? (
        <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
          {listError}
        </p>
      ) : null}

      {loading ? <p className="text-sm text-slate-500">Loading submissions…</p> : null}

      {!loading && submissions.length === 0 ? (
        <p className="text-sm text-slate-500">No submissions yet.</p>
      ) : null}

      <div className="space-y-3">
        {submissions.map((submission) => (
          <div key={submission.id} className="rounded-2xl border border-slate-200 bg-white shadow-sm">
            <button
              type="button"
              onClick={() => handleExpand(submission.id)}
              className="flex w-full items-center justify-between gap-4 p-4 text-left"
            >
              <div>
                <p className="text-sm font-black text-slate-900">
                  {submission.accountName} — {submission.locationName}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  {submission.porterName} · {submission.weekOf || "—"} · {formatTimestamp(submission.submittedAt)}
                </p>
              </div>
              <span
                className={`shrink-0 rounded-full px-3 py-1 text-xs font-black ${
                  submission.completedCount === submission.totalCount
                    ? "bg-green-100 text-green-800"
                    : "bg-amber-100 text-amber-800"
                }`}
              >
                {submission.completedCount}/{submission.totalCount}
              </span>
            </button>

            {expandedId === submission.id ? (
              <div className="border-t border-slate-100 p-4">
                {detailLoading ? <p className="text-sm text-slate-500">Loading detail…</p> : null}
                {detail && detail.id === submission.id ? (
                  <div className="space-y-4">
                    <div className="grid gap-2 text-sm text-slate-600 sm:grid-cols-2">
                      <p><span className="font-black text-slate-700">Time In:</span> {detail.timeIn || "—"}</p>
                      <p><span className="font-black text-slate-700">Time Out:</span> {detail.timeOut || "—"}</p>
                    </div>
                    {detail.generalNotes ? (
                      <p className="rounded-xl bg-slate-50 p-3 text-sm text-slate-700">{detail.generalNotes}</p>
                    ) : null}
                    {detail.sections.map((section) => (
                      <div key={section.key}>
                        <h3 className="text-xs font-black uppercase tracking-wide text-slate-500">{section.title}</h3>
                        <div className="mt-2 space-y-2">
                          {section.items.map((item) => (
                            <div key={item.key} className="flex items-start gap-2 rounded-lg border border-slate-100 p-2 text-sm">
                              <span className={item.checked ? "text-green-600" : "text-slate-300"}>{item.checked ? "✓" : "○"}</span>
                              <div>
                                <p className="font-semibold text-slate-800">{item.label}</p>
                                {item.note ? <p className="text-xs text-slate-500">{item.note}</p> : null}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}
