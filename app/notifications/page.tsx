"use client";

import { useEffect, useMemo, useState } from "react";

type SubPortalIssue = {
  rowNumber?: number;
  timestamp?: string;
  issueId?: string;
  subcontractorEmail?: string;
  subcontractorName?: string;
  accountId?: string;
  accountName?: string;
  issueType?: string;
  urgency?: string;
  description?: string;
  photoCount?: string;
  status?: string;
  notes?: string;
};

type NotificationsResponse = {
  success?: boolean;
  message?: string;
  issues?: SubPortalIssue[];
  newCount?: number;
};

function cleanText(value: unknown) {
  return String(value ?? "").trim();
}

function isNewIssue(issue: SubPortalIssue) {
  const status = cleanText(issue.status).toLowerCase();
  return !status || status === "new" || status === "open";
}

export default function NotificationsPage() {
  const [issues, setIssues] = useState<SubPortalIssue[]>([]);
  const [newCount, setNewCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [updatingIssueId, setUpdatingIssueId] = useState("");
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  async function loadNotifications() {
    setError("");
    setLoading(true);

    try {
      const response = await fetch("/api/notifications", {
        cache: "no-store",
      });

      const data = (await response.json()) as NotificationsResponse;

      if (!response.ok || data.success === false) {
        throw new Error(data.message || "Could not load notifications.");
      }

      setIssues(Array.isArray(data.issues) ? data.issues : []);
      setNewCount(Number(data.newCount || 0));
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Unknown error loading notifications."
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadNotifications();
  }, []);

  const newIssues = useMemo(() => {
    return issues.filter(isNewIssue);
  }, [issues]);

  const reviewedIssues = useMemo(() => {
    return issues.filter((issue) => !isNewIssue(issue));
  }, [issues]);

  async function markReviewed(issue: SubPortalIssue) {
    const issueId = cleanText(issue.issueId);

    setError("");
    setSuccessMessage("");
    setUpdatingIssueId(issueId || String(issue.rowNumber || ""));

    try {
      const response = await fetch("/api/notifications", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "updateSubPortalIssueStatus",
          issue: {
            issueId,
            rowNumber: issue.rowNumber || "",
            status: "Reviewed",
            notes: "Marked reviewed from admin notifications page.",
          },
        }),
      });

      const data = await response.json();

      if (!response.ok || data.success === false) {
        throw new Error(
          data.error || data.message || "Could not mark issue reviewed."
        );
      }

      setSuccessMessage("Issue marked reviewed.");
      await loadNotifications();
    } catch (updateError) {
      setError(
        updateError instanceof Error
          ? updateError.message
          : "Unknown error updating issue."
      );
    } finally {
      setUpdatingIssueId("");
    }
  }

  function renderIssueCard(issue: SubPortalIssue) {
    const issueId = cleanText(issue.issueId) || `Row ${issue.rowNumber || ""}`;
    const isNew = isNewIssue(issue);

    return (
      <div
        key={`${issueId}-${issue.rowNumber || ""}`}
        className={`rounded-3xl border p-5 shadow-sm ${
          isNew
            ? "border-red-200 bg-red-50"
            : "border-slate-200 bg-white"
        }`}
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-wide text-slate-500">
              {cleanText(issue.timestamp) || "No date"}
            </p>

            <h2 className="mt-1 text-xl font-black text-slate-950">
              {cleanText(issue.accountName) || "Unknown Account"}
            </h2>

            <p className="mt-1 text-sm font-bold text-slate-600">
              {issueId}
            </p>
          </div>

          <span
            className={`rounded-full px-3 py-1 text-xs font-black ${
              isNew
                ? "bg-red-600 text-white"
                : "bg-slate-100 text-slate-700"
            }`}
          >
            {cleanText(issue.status) || "New"}
          </span>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className="rounded-2xl bg-white p-4">
            <p className="text-xs font-black uppercase text-slate-500">
              Issue Type
            </p>
            <p className="mt-1 font-bold text-slate-900">
              {cleanText(issue.issueType) || "Not listed"}
            </p>
          </div>

          <div className="rounded-2xl bg-white p-4">
            <p className="text-xs font-black uppercase text-slate-500">
              Urgency
            </p>
            <p className="mt-1 font-bold text-slate-900">
              {cleanText(issue.urgency) || "Normal"}
            </p>
          </div>

          <div className="rounded-2xl bg-white p-4">
            <p className="text-xs font-black uppercase text-slate-500">
              Subcontractor
            </p>
            <p className="mt-1 font-bold text-slate-900">
              {cleanText(issue.subcontractorName) || "Not listed"}
            </p>
            <p className="mt-1 text-sm text-slate-600">
              {cleanText(issue.subcontractorEmail)}
            </p>
          </div>

          <div className="rounded-2xl bg-white p-4">
            <p className="text-xs font-black uppercase text-slate-500">
              Photos
            </p>
            <p className="mt-1 font-bold text-slate-900">
              {cleanText(issue.photoCount) || "0"}
            </p>
          </div>
        </div>

        <div className="mt-4 rounded-2xl bg-white p-4">
          <p className="text-xs font-black uppercase text-slate-500">
            Description
          </p>
          <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">
            {cleanText(issue.description) || "No description provided."}
          </p>
        </div>

        {isNew ? (
          <button
            type="button"
            onClick={() => markReviewed(issue)}
            disabled={updatingIssueId === issueId}
            className="mt-4 w-full rounded-2xl bg-blue-700 px-5 py-3 text-sm font-black text-white hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {updatingIssueId === issueId ? "Updating..." : "Mark Reviewed"}
          </button>
        ) : null}
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-slate-100 px-4 py-6 text-slate-900">
      <div className="mx-auto max-w-6xl">
        <section className="rounded-3xl bg-gradient-to-br from-blue-950 via-blue-800 to-sky-500 p-6 text-white shadow-lg">
          <p className="text-sm font-semibold uppercase tracking-wide text-blue-100">
            Cleaning World Admin
          </p>
          <h1 className="mt-2 text-3xl font-black">Notifications</h1>
          <p className="mt-2 text-sm leading-6 text-blue-50">
            Review new subcontractor portal issues and mark them reviewed.
          </p>

          <div className="mt-5 inline-flex rounded-2xl bg-white px-4 py-3 text-blue-950 shadow-sm">
            <span className="font-black">🔔 New Notifications: {newCount}</span>
          </div>
        </section>

        {error ? (
          <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-700">
            {error}
          </div>
        ) : null}

        {successMessage ? (
          <div className="mt-4 rounded-2xl border border-green-200 bg-green-50 p-4 text-sm font-bold text-green-700">
            {successMessage}
          </div>
        ) : null}

        <section className="mt-4 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-xl font-black text-slate-950">
                New Sub Portal Issues
              </h2>
              <p className="mt-1 text-sm text-slate-600">
                These are waiting for admin review.
              </p>
            </div>

            <button
              type="button"
              onClick={loadNotifications}
              className="rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-black text-blue-800 hover:bg-blue-100"
            >
              Refresh
            </button>
          </div>

          {loading ? (
            <p className="mt-4 rounded-2xl bg-slate-50 p-4 text-sm font-bold text-slate-600">
              Loading notifications...
            </p>
          ) : newIssues.length === 0 ? (
            <p className="mt-4 rounded-2xl border border-green-200 bg-green-50 p-4 text-sm font-bold text-green-700">
              No new issues right now.
            </p>
          ) : (
            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              {newIssues.map(renderIssueCard)}
            </div>
          )}
        </section>

        {reviewedIssues.length > 0 ? (
          <section className="mt-4 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-xl font-black text-slate-950">
              Reviewed / Older Issues
            </h2>

            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              {reviewedIssues.map(renderIssueCard)}
            </div>
          </section>
        ) : null}
      </div>
    </main>
  );
}