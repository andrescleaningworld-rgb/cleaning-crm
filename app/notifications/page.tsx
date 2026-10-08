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
            <p className="ui-muted">
              {cleanText(issue.timestamp) || "No date"}
            </p>

            <h2 className="ui-card-title">
              {cleanText(issue.accountName) || "Unknown Account"}
            </h2>

            <p className="ui-strong">
              {issueId}
            </p>
          </div>

          <span
            className={`rounded-full px-3 py-1 text-base font-black ${
              isNew
                ? "bg-red-600 text-white"
                : "bg-slate-100 text-slate-700"
            }`}
          >
            {cleanText(issue.status) || "New"}
          </span>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className="ui-card">
            <p className="ui-muted">
              Issue Type
            </p>
            <p className="ui-strong">
              {cleanText(issue.issueType) || "Not listed"}
            </p>
          </div>

          <div className="ui-card">
            <p className="ui-muted">
              Urgency
            </p>
            <p className="ui-strong">
              {cleanText(issue.urgency) || "Normal"}
            </p>
          </div>

          <div className="ui-card">
            <p className="ui-muted">
              Subcontractor
            </p>
            <p className="ui-strong">
              {cleanText(issue.subcontractorName) || "Not listed"}
            </p>
            <p className="ui-muted">
              {cleanText(issue.subcontractorEmail)}
            </p>
          </div>

          <div className="ui-card">
            <p className="ui-muted">
              Photos
            </p>
            <p className="ui-strong">
              {cleanText(issue.photoCount) || "0"}
            </p>
          </div>
        </div>

        <div className="ui-card">
          <p className="ui-muted">
            Description
          </p>
          <p className="ui-muted">
            {cleanText(issue.description) || "No description provided."}
          </p>
        </div>

        {isNew ? (
          <button
            type="button"
            onClick={() => markReviewed(issue)}
            disabled={updatingIssueId === issueId}
            className="ui-btn ui-btn-main w-full"
          >
            {updatingIssueId === issueId ? "Updating..." : "Mark Reviewed"}
          </button>
        ) : null}
      </div>
    );
  }

  return (
    <main className="ui-screen">
      <div className="ui-screen-body">
        <section className="ui-on-dark rounded-3xl bg-gradient-to-br from-blue-950 via-blue-800 to-sky-500 p-6 text-white shadow-lg">
          <p className="ui-strong">
            Cleaning World Admin
          </p>
          <h1 className="ui-screen-title">Notifications</h1>
          <p className="ui-muted">
            Review new subcontractor portal issues and mark them reviewed.
          </p>

          <div className="mt-5 inline-flex rounded-2xl bg-white px-4 py-3 text-blue-950 shadow-sm">
            <span className="ui-strong">🔔 New Notifications: {newCount}</span>
          </div>
        </section>

        {error ? (
          <div className="ui-field-error">
            {error}
          </div>
        ) : null}

        {successMessage ? (
          <div className="ui-savestatus ui-savestatus-saved">
            {successMessage}
          </div>
        ) : null}

        <section className="ui-card">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="ui-card-title">
                New Sub Portal Issues
              </h2>
              <p className="ui-muted">
                These are waiting for admin review.
              </p>
            </div>

            <button
              type="button"
              onClick={loadNotifications}
              className="ui-btn ui-btn-second"
            >
              Refresh
            </button>
          </div>

          {loading ? (
            <p className="ui-strong">
              Loading notifications...
            </p>
          ) : newIssues.length === 0 ? (
            <p className="ui-strong">
              No new issues right now.
            </p>
          ) : (
            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              {newIssues.map(renderIssueCard)}
            </div>
          )}
        </section>

        {reviewedIssues.length > 0 ? (
          <section className="ui-card">
            <h2 className="ui-card-title">
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