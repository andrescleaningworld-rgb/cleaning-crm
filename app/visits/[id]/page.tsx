"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { parseISO } from "@/lib/dateUtils";

type Visit = {
  id: string;
  accountId: string;
  accountName: string;
  date: string;
  visitType: string;
  completedBy: string;
  condition: string;
  followUpNeeded: string;
  followUpDate: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
};

type EditLogEntry = {
  id: string;
  visitId: string;
  editedBy: string;
  editedAt: string;
  changeSummary: string;
};

type VisitApiResponse = {
  success?: boolean;
  error?: string;
  visit?: Visit;
  editHistory?: EditLogEntry[];
};

// Raw shape returned by GET /api/accounts — only the fields this page reads.
type Account = {
  id?: string;
  accountId?: string;
  accountName?: string;
  subcontractor?: string;
};

type AccountsApiResponse = {
  success?: boolean;
  accounts?: Account[];
  data?: Account[];
};

type EditForm = {
  date: string;
  visitType: string;
  completedBy: string;
  condition: string;
  followUpNeeded: string;
  followUpDate: string;
  notes: string;
};

const VISIT_TYPE_OPTIONS = [
  "Routine Visit",
  "Complaint Follow-Up",
  "Quality Check",
  "Onboarding New Account",
  "Customer Request",
  "Subcontractor Review",
  "Other",
];

function clean(value: unknown): string {
  return String(value ?? "").trim();
}

// visit.date / visit.followUpDate always arrive as normalized "YYYY-MM-DD"
// strings from GET /api/visits/[id] (see normalizeSheetDate in
// lib/googleSheets.ts), so parseISO() — not new Date() — is the correct,
// timezone-safe way to turn them into a Date for display.
function formatDate(value: string): string {
  const text = clean(value);
  if (!text) return "—";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  const date = parseISO(text);
  if (Number.isNaN(date.getTime())) return text;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function formatDateTime(value: string): string {
  const text = clean(value);
  if (!text) return "—";
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) return text;
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

// Same self-declared identity used by app/documents/page.tsx, app/to-do/page.tsx,
// and app/sub-schedules/page.tsx ("cwAdminName") — there's no per-manager login
// in this app, so edits are attributed to whatever name staff last typed in,
// shared via localStorage across pages.
function getStoredAdminName(): string {
  if (typeof window === "undefined") return "";
  return window.localStorage.getItem("cwAdminName") ?? "";
}

function setStoredAdminName(value: string) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem("cwAdminName", value);
}

function visitToForm(visit: Visit): EditForm {
  return {
    date: visit.date,
    visitType: visit.visitType,
    completedBy: visit.completedBy,
    condition: visit.condition,
    followUpNeeded: visit.followUpNeeded,
    followUpDate: visit.followUpDate,
    notes: visit.notes,
  };
}

function getLoadedAccounts(data: AccountsApiResponse): Account[] {
  if (Array.isArray(data.accounts)) return data.accounts;
  if (Array.isArray(data.data)) return data.data;
  return [];
}

export default function VisitDetailPage() {
  const params = useParams();
  const visitId = clean(Array.isArray(params.id) ? params.id[0] : params.id);

  const [visit, setVisit] = useState<Visit | null>(null);
  const [editHistory, setEditHistory] = useState<EditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Visits store an Account ID that uses a different scheme than Accounts'
  // own accountId (e.g. visit "ACC-186A2" vs account "key-impact-sales--
  // systems") and never matches it — this is why clicking a visit used to
  // land on "Could not find this account." Looking the account up by name
  // instead (same key app/accounts/[id]/page.tsx already accepts) is what
  // actually resolves for ~90% of visits in production; the rest genuinely
  // have no matching account on file, so the link is shown disabled rather
  // than broken.
  const [linkedAccount, setLinkedAccount] = useState<Account | null>(null);
  const [accountLookupDone, setAccountLookupDone] = useState(false);

  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<EditForm | null>(null);
  const [editedBy, setEditedBy] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [showFullHistory, setShowFullHistory] = useState(false);

  const loadVisit = useCallback(async () => {
    if (!visitId) return;
    try {
      setLoading(true);
      setError("");
      const response = await fetch(`/api/visits/${encodeURIComponent(visitId)}`, {
        cache: "no-store",
      });
      const data = (await response.json()) as VisitApiResponse;
      if (!response.ok || data.success === false || !data.visit) {
        throw new Error(data.error || "Could not load this visit.");
      }
      setVisit(data.visit);
      setEditHistory(data.editHistory || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load this visit.");
    } finally {
      setLoading(false);
    }
  }, [visitId]);

  useEffect(() => {
    loadVisit();
  }, [loadVisit]);

  useEffect(() => {
    setEditedBy(getStoredAdminName());
  }, []);

  useEffect(() => {
    if (!visit) return;
    let cancelled = false;

    async function loadAccount() {
      try {
        const response = await fetch("/api/accounts", { cache: "no-store" });
        const data = (await response.json()) as AccountsApiResponse;
        const accounts = getLoadedAccounts(data);
        const normalizedName = clean(visit?.accountName).toLowerCase();
        const match = accounts.find(
          (a) => clean(a.accountName).toLowerCase() === normalizedName
        );
        if (!cancelled) setLinkedAccount(match || null);
      } catch {
        if (!cancelled) setLinkedAccount(null);
      } finally {
        if (!cancelled) setAccountLookupDone(true);
      }
    }

    loadAccount();
    return () => {
      cancelled = true;
    };
  }, [visit]);

  function startEditing() {
    if (!visit) return;
    setForm(visitToForm(visit));
    setSaveError("");
    setEditing(true);
  }

  function cancelEditing() {
    setEditing(false);
    setForm(null);
    setSaveError("");
  }

  function handleEditedByChange(value: string) {
    setEditedBy(value);
    setStoredAdminName(value);
  }

  function updateForm<K extends keyof EditForm>(key: K, value: EditForm[K]) {
    setForm((prev) => (prev ? { ...prev, [key]: value } : prev));
  }

  async function handleSave() {
    if (!form) return;
    const name = editedBy.trim();
    if (!name) {
      setSaveError("Enter your name so this edit can be attributed to you.");
      return;
    }

    setSaving(true);
    setSaveError("");
    try {
      const response = await fetch(`/api/visits/${encodeURIComponent(visitId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({ ...form, editedBy: name }),
      });
      const data = (await response.json()) as VisitApiResponse;
      if (!response.ok || data.success === false) {
        throw new Error(data.error || "Failed to save changes.");
      }
      setEditing(false);
      setForm(null);
      await loadVisit();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Failed to save changes.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-gray-50 p-4 text-gray-900 sm:p-6">
        <p className="text-gray-700">Loading visit details...</p>
      </main>
    );
  }

  if (error || !visit) {
    return (
      <main className="min-h-screen bg-gray-50 p-4 text-gray-900 sm:p-6">
        <div className="mx-auto max-w-4xl">
          <section className="rounded-2xl border border-red-200 bg-red-50 p-5 font-semibold text-red-700">
            {error || "Visit not found."}
          </section>
          <div className="mt-5">
            <Link
              href="/visits"
              className="rounded-xl border border-gray-300 bg-white px-5 py-3 font-bold text-gray-900 shadow-sm no-underline"
            >
              Back to Visits
            </Link>
          </div>
        </div>
      </main>
    );
  }

  const accountHref = linkedAccount
    ? `/accounts/${encodeURIComponent(
        linkedAccount.accountId || linkedAccount.id || linkedAccount.accountName || visit.accountName
      )}`
    : null;

  const latestEdit = editHistory[0];

  return (
    <main className="min-h-screen bg-gray-50 p-4 text-gray-900 sm:p-6">
      <div className="mx-auto max-w-4xl">
        <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-blue-600">
              Cleaning World
            </p>
            <h1 className="mt-2 text-3xl font-bold sm:text-4xl">
              {clean(visit.visitType) || "Visit"}
            </h1>
            <p className="mt-1 text-gray-600">{clean(visit.accountName) || "Unnamed Account"}</p>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row">
            <Link
              href="/visits"
              className="rounded-xl border border-gray-300 bg-white px-5 py-3 text-center font-bold text-gray-900 shadow-sm no-underline"
            >
              Back to Visits
            </Link>

            {!editing ? (
              <button
                type="button"
                onClick={startEditing}
                className="rounded-xl bg-blue-600 px-5 py-3 font-bold text-white"
              >
                Edit Visit
              </button>
            ) : null}
          </div>
        </div>

        <section className="rounded-2xl border border-gray-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-gray-200 p-5">
            <h2 className="text-xl font-bold text-gray-900">Visit Details</h2>
            {editing ? (
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={cancelEditing}
                  disabled={saving}
                  className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-bold text-gray-700 disabled:opacity-60"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={saving}
                  className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-60"
                >
                  {saving ? "Saving..." : "Save Changes"}
                </button>
              </div>
            ) : null}
          </div>

          {saveError ? (
            <div className="m-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">
              {saveError}
            </div>
          ) : null}

          {editing && form ? (
            <div className="grid gap-5 p-5 md:grid-cols-2">
              <label className="block">
                <span className="mb-1 block text-sm font-bold text-gray-700">Your Name</span>
                <input
                  value={editedBy}
                  onChange={(e) => handleEditedByChange(e.target.value)}
                  placeholder="Enter your name"
                  className="min-h-[44px] w-full rounded-xl border border-gray-300 px-4 py-2.5 text-sm font-semibold outline-none focus:border-blue-500"
                />
                <p className="mt-1 text-xs text-gray-500">Recorded in this visit&apos;s edit history.</p>
              </label>

              <div />

              <label className="block">
                <span className="mb-1 block text-sm font-bold text-gray-700">Visit Date</span>
                <input
                  type="date"
                  value={form.date}
                  onChange={(e) => updateForm("date", e.target.value)}
                  className="min-h-[44px] w-full rounded-xl border border-gray-300 px-4 py-2.5 text-sm font-semibold outline-none focus:border-blue-500"
                />
              </label>

              <label className="block">
                <span className="mb-1 block text-sm font-bold text-gray-700">Visit Type</span>
                <input
                  list="visit-type-options"
                  value={form.visitType}
                  onChange={(e) => updateForm("visitType", e.target.value)}
                  className="min-h-[44px] w-full rounded-xl border border-gray-300 px-4 py-2.5 text-sm font-semibold outline-none focus:border-blue-500"
                />
                <datalist id="visit-type-options">
                  {VISIT_TYPE_OPTIONS.map((option) => (
                    <option key={option} value={option} />
                  ))}
                </datalist>
              </label>

              <label className="block">
                <span className="mb-1 block text-sm font-bold text-gray-700">Completed By</span>
                <input
                  value={form.completedBy}
                  onChange={(e) => updateForm("completedBy", e.target.value)}
                  className="min-h-[44px] w-full rounded-xl border border-gray-300 px-4 py-2.5 text-sm font-semibold outline-none focus:border-blue-500"
                />
              </label>

              <label className="block">
                <span className="mb-1 block text-sm font-bold text-gray-700">
                  Condition Score (0-10)
                </span>
                <input
                  value={form.condition}
                  onChange={(e) => updateForm("condition", e.target.value)}
                  placeholder="0-10"
                  className="min-h-[44px] w-full rounded-xl border border-gray-300 px-4 py-2.5 text-sm font-semibold outline-none focus:border-blue-500"
                />
              </label>

              <label className="block">
                <span className="mb-1 block text-sm font-bold text-gray-700">Follow-Up Needed</span>
                <select
                  value={form.followUpNeeded}
                  onChange={(e) => updateForm("followUpNeeded", e.target.value)}
                  className="min-h-[44px] w-full rounded-xl border border-gray-300 bg-white px-4 py-2.5 text-sm font-semibold outline-none focus:border-blue-500"
                >
                  <option value="">Not Set</option>
                  <option value="Yes">Yes</option>
                  <option value="No">No</option>
                </select>
              </label>

              <label className="block">
                <span className="mb-1 block text-sm font-bold text-gray-700">Follow-Up Date</span>
                <input
                  type="date"
                  value={form.followUpDate}
                  onChange={(e) => updateForm("followUpDate", e.target.value)}
                  className="min-h-[44px] w-full rounded-xl border border-gray-300 px-4 py-2.5 text-sm font-semibold outline-none focus:border-blue-500"
                />
              </label>

              <label className="block md:col-span-2">
                <span className="mb-1 block text-sm font-bold text-gray-700">Notes</span>
                <textarea
                  value={form.notes}
                  onChange={(e) => updateForm("notes", e.target.value)}
                  rows={6}
                  className="w-full rounded-xl border border-gray-300 px-4 py-2.5 text-sm font-semibold outline-none focus:border-blue-500"
                />
              </label>
            </div>
          ) : (
            <div className="grid gap-0 md:grid-cols-2">
              <div className="border-b border-gray-200 p-5 md:border-r">
                <p className="text-sm font-semibold uppercase tracking-wide text-gray-500">Date</p>
                <p className="mt-1 text-lg font-semibold text-gray-900">{formatDate(visit.date)}</p>
              </div>

              <div className="border-b border-gray-200 p-5">
                <p className="text-sm font-semibold uppercase tracking-wide text-gray-500">Account</p>
                {accountHref ? (
                  <Link
                    href={accountHref}
                    className="mt-1 block text-lg font-semibold text-blue-700 hover:underline"
                  >
                    {clean(visit.accountName) || "Unnamed Account"}
                  </Link>
                ) : (
                  <>
                    <p className="mt-1 text-lg font-semibold text-gray-900">
                      {clean(visit.accountName) || "Unnamed Account"}
                    </p>
                    {accountLookupDone ? (
                      <p className="mt-1 text-xs text-gray-500">
                        No matching account found on file — link unavailable.
                      </p>
                    ) : null}
                  </>
                )}
              </div>

              <div className="border-b border-gray-200 p-5 md:border-r">
                <p className="text-sm font-semibold uppercase tracking-wide text-gray-500">Visit Type</p>
                <p className="mt-1 text-lg font-semibold text-gray-900">
                  {clean(visit.visitType) || "—"}
                </p>
              </div>

              <div className="border-b border-gray-200 p-5">
                <p className="text-sm font-semibold uppercase tracking-wide text-gray-500">
                  Completed By
                </p>
                <p className="mt-1 text-lg font-semibold text-gray-900">
                  {clean(visit.completedBy) || "—"}
                </p>
              </div>

              <div className="border-b border-gray-200 p-5 md:border-r">
                <p className="text-sm font-semibold uppercase tracking-wide text-gray-500">
                  Subcontractor
                </p>
                <p className="mt-1 text-lg font-semibold text-gray-900">
                  {clean(linkedAccount?.subcontractor) || "—"}
                </p>
                <p className="mt-1 text-xs text-gray-500">
                  From the linked account — visits don&apos;t track their own subcontractor.
                </p>
              </div>

              <div className="border-b border-gray-200 p-5">
                <p className="text-sm font-semibold uppercase tracking-wide text-gray-500">
                  Condition Score
                </p>
                <p className="mt-1 text-lg font-semibold text-gray-900">
                  {clean(visit.condition) || "—"}
                </p>
              </div>

              <div className="border-b border-gray-200 p-5 md:border-r">
                <p className="text-sm font-semibold uppercase tracking-wide text-gray-500">
                  Follow-Up Needed
                </p>
                <p className="mt-1 text-lg font-semibold text-gray-900">
                  {clean(visit.followUpNeeded) || "—"}
                </p>
              </div>

              <div className="border-b border-gray-200 p-5 md:border-b-0">
                <p className="text-sm font-semibold uppercase tracking-wide text-gray-500">
                  Follow-Up Date
                </p>
                <p className="mt-1 text-lg font-semibold text-gray-900">
                  {formatDate(visit.followUpDate)}
                </p>
              </div>

              <div className="p-5 md:col-span-2 md:border-t md:border-gray-200">
                <p className="text-sm font-semibold uppercase tracking-wide text-gray-500">Notes</p>
                <div className="mt-3 whitespace-pre-wrap rounded-xl border border-gray-200 bg-gray-50 p-5 text-gray-900">
                  {clean(visit.notes) || "—"}
                </div>
              </div>
            </div>
          )}
        </section>

        <section className="mt-6 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-bold text-gray-900">Edit History</h2>

          {editHistory.length === 0 ? (
            <p className="mt-2 text-sm text-gray-500">No edits recorded yet.</p>
          ) : (
            <>
              <p className="mt-2 text-sm text-gray-700">
                Last edited by{" "}
                <span className="font-semibold">{clean(latestEdit?.editedBy) || "someone"}</span> on{" "}
                {formatDateTime(latestEdit?.editedAt || "")}
              </p>

              {editHistory.length > 1 ? (
                <button
                  type="button"
                  onClick={() => setShowFullHistory((v) => !v)}
                  className="mt-2 text-sm font-bold text-blue-700 hover:underline"
                >
                  {showFullHistory ? "Hide full history" : `Show full history (${editHistory.length})`}
                </button>
              ) : null}

              {showFullHistory ? (
                <ul className="mt-3 space-y-2 border-t border-gray-200 pt-3">
                  {editHistory.map((entry) => (
                    <li key={entry.id} className="text-sm text-gray-700">
                      <span className="font-semibold">{clean(entry.editedBy) || "someone"}</span>{" "}
                      — {formatDateTime(entry.editedAt)}
                      {entry.changeSummary ? (
                        <span className="text-gray-500"> · {entry.changeSummary}</span>
                      ) : null}
                    </li>
                  ))}
                </ul>
              ) : null}
            </>
          )}
        </section>
      </div>
    </main>
  );
}
