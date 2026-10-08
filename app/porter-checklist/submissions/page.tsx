"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { describeWorkTimes, type ChecklistSubmissionSection } from "@/lib/checklistTemplate";
import { formatCrewDateTime } from "@/lib/crewDateTime";

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
  tabName: string | null;
  startedAt: string | null;
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

export default function PorterChecklistSubmissionsPage() {
  const [accountFilter, setAccountFilter] = useState("");
  const [submissions, setSubmissions] = useState<SubmissionSummary[]>([]);
  const [flaggedAccounts, setFlaggedAccounts] = useState<FlaggedAccount[]>([]);
  const [loading, setLoading] = useState(false);
  const [listError, setListError] = useState("");

  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [detail, setDetail] = useState<(SubmissionSummary & { sections: ChecklistSubmissionSection[] }) | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const [rangePreset, setRangePreset] = useState<"7" | "30" | "custom">("30");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [reportPending, setReportPending] = useState(false);
  const [reportError, setReportError] = useState("");

  // canShare() existing isn't enough — some browsers implement navigator.share
  // for text/URLs only and report false from canShare() specifically for
  // files, so this probes with a real (throwaway) File the same shape as
  // what handleShareReport will actually share. Mirrors app/supply-orders.
  const [canShareFiles, setCanShareFiles] = useState(false);

  useEffect(() => {
    if (typeof navigator === "undefined" || typeof navigator.canShare !== "function") {
      return;
    }
    try {
      const probeFile = new File(["report"], "report-support-check.pdf", { type: "application/pdf" });
      setCanShareFiles(navigator.canShare({ files: [probeFile] }));
    } catch {
      setCanShareFiles(false);
    }
  }, []);

  async function loadSubmissions(accountId: string) {
    setLoading(true);
    setListError("");
    try {
      const url = accountId
        ? `/api/checklist-submissions?accountId=${encodeURIComponent(accountId)}`
        : "/api/checklist-submissions";
      const response = await fetch(url, { cache: "no-store" });
      const data = (await response.json()) as ListResponse;
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
    loadSubmissions(accountFilter);
  }, [accountFilter]);

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
      const response = await fetch(`/api/checklist-submissions?id=${id}`, { cache: "no-store" });
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

  function getReportRange(): { start: string; end: string } {
    if (rangePreset === "custom") {
      return { start: customStart, end: customEnd };
    }
    const days = rangePreset === "7" ? 7 : 30;
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - days);
    return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
  }

  function validateReportRange(): { start: string; end: string } | null {
    const { start, end } = getReportRange();
    if (!start || !end) {
      setReportError("Choose a start and end date.");
      return null;
    }
    return { start, end };
  }

  async function fetchReportPdf(start: string, end: string): Promise<{ blob: Blob; filename: string }> {
    const url = `/api/porter-checklist-report?accountId=${encodeURIComponent(accountFilter)}&start=${start}&end=${end}`;
    const response = await fetch(url);
    if (!response.ok) {
      const data = await response.json().catch(() => ({} as { error?: string }));
      throw new Error(data.error || "Could not generate the report.");
    }
    const blob = await response.blob();
    const disposition = response.headers.get("Content-Disposition") || "";
    const match = disposition.match(/filename="([^"]+)"/);
    return { blob, filename: match ? match[1] : "report.pdf" };
  }

  async function handleShareReport() {
    if (!accountFilter) return;
    const range = validateReportRange();
    if (!range) return;
    setReportError("");
    setReportPending(true);
    try {
      const { blob, filename } = await fetchReportPdf(range.start, range.end);
      const file = new File([blob], filename, { type: "application/pdf" });
      const accountName = flaggedAccounts.find((a) => a.accountId === accountFilter)?.accountName || "account";
      await navigator.share({
        files: [file],
        title: `Crew Link Checklist Report — ${accountName}`,
        text: `Crew Link checklist report for ${accountName}`,
      });
    } catch (err) {
      // AbortError means the user closed the native share sheet without
      // picking anything — not a failure worth surfacing.
      if (err instanceof Error && err.name === "AbortError") return;
      setReportError(err instanceof Error ? err.message : "Could not share the report.");
    } finally {
      setReportPending(false);
    }
  }

  async function handleDownloadReport() {
    if (!accountFilter) return;
    const range = validateReportRange();
    if (!range) return;
    setReportError("");
    setReportPending(true);
    try {
      const { blob, filename } = await fetchReportPdf(range.start, range.end);
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
    } catch (err) {
      setReportError(err instanceof Error ? err.message : "Could not download the report.");
    } finally {
      setReportPending(false);
    }
  }

  return (
    <div className="ui-screen">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Image src="/logo-CW-single-phone-optimized.png" alt="Cleaning World" width={36} height={36} className="h-9 w-9 object-contain" />
          <h1 className="ui-screen-title">Crew Link — Checklist Submissions</h1>
        </div>
        <select
          value={accountFilter}
          onChange={(event) => setAccountFilter(event.target.value)}
          className="ui-input"
        >
          <option value="">All accounts</option>
          {flaggedAccounts.map((a) => (
            <option key={a.accountId} value={a.accountId}>
              {a.accountName}
            </option>
          ))}
        </select>
      </div>

      <div className="ui-card">
        <span className="ui-muted">Report Range</span>
        <div className="flex gap-1">
          {(["7", "30", "custom"] as const).map((preset) => (
            <button
              key={preset}
              type="button"
              onClick={() => setRangePreset(preset)}
              className={`min-h-[48px] rounded-lg px-3 py-1.5 text-base font-black ${
                rangePreset === preset ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-600"
              }`}
            >
              {preset === "7" ? "Last 7 days" : preset === "30" ? "Last 30 days" : "Custom"}
            </button>
          ))}
        </div>
        {rangePreset === "custom" ? (
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={customStart}
              onChange={(event) => setCustomStart(event.target.value)}
              className="ui-input"
            />
            <span className="ui-muted">to</span>
            <input
              type="date"
              value={customEnd}
              onChange={(event) => setCustomEnd(event.target.value)}
              className="ui-input"
            />
          </div>
        ) : null}
        {canShareFiles ? (
          <button
            type="button"
            onClick={handleShareReport}
            disabled={!accountFilter || reportPending}
            title={!accountFilter ? "Choose a specific account to share a report" : undefined}
            className="ui-btn ui-btn-second"
          >
            {reportPending ? "Preparing…" : "Share Report"}
          </button>
        ) : (
          <button
            type="button"
            onClick={handleDownloadReport}
            disabled={!accountFilter || reportPending}
            title={!accountFilter ? "Choose a specific account to download a report" : undefined}
            className="ui-btn ui-btn-second"
          >
            {reportPending ? "Generating…" : "Download Report"}
          </button>
        )}
      </div>
      {!accountFilter ? (
        <p className="ui-muted">Choose a specific account above to share or download its report.</p>
      ) : null}
      {reportError ? (
        <p className="ui-field-error">
          {reportError}
        </p>
      ) : null}

      {listError ? (
        <p className="ui-field-error">
          {listError}
        </p>
      ) : null}

      {loading ? <p className="ui-muted">Loading submissions…</p> : null}

      {!loading && submissions.length === 0 ? (
        <p className="ui-muted">No submissions yet.</p>
      ) : null}

      <div className="space-y-3">
        {submissions.map((submission) => (
          <div key={submission.id} className="ui-card">
            <button
              type="button"
              onClick={() => handleExpand(submission.id)}
              className="ui-pick"
            >
              <div>
                <p className="ui-strong">
                  {submission.accountName} — {submission.locationName}
                  {submission.tabName ? (
                    <span className="ml-2 rounded-full bg-blue-50 px-2 py-0.5 text-base font-black text-blue-700">{submission.tabName}</span>
                  ) : null}
                </p>
                <p className="ui-muted">
                  {(() => {
                    // New submissions: automatic Started / Finished. Old ones: typed Week Of + times.
                    const times = describeWorkTimes(submission);
                    return [
                      submission.porterName,
                      submission.startedAt ? null : submission.weekOf || "—",
                      formatCrewDateTime(submission.submittedAt),
                      `${times.startLabel} ${times.start} · ${times.endLabel} ${times.end}`,
                    ]
                      .filter(Boolean)
                      .join(" · ");
                  })()}
                </p>
              </div>
              <span
                className={`shrink-0 rounded-full px-3 py-1 text-base font-black ${
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
                {detailLoading ? <p className="ui-muted">Loading detail…</p> : null}
                {detail && detail.id === submission.id ? (
                  <div className="space-y-4">
                    <a
                      href={`/crew-link/print/submission/${detail.id}`}
                      target="_blank"
                      rel="noopener"
                      className="ui-btn ui-btn-second"
                    >
                      🖨️ Print
                    </a>
                    <div className="grid gap-2 text-slate-600 sm:grid-cols-2">
                      {(() => {
                        const times = describeWorkTimes(detail);
                        return (
                          <>
                            <p><span className="ui-strong">{times.startLabel}:</span> {times.start}</p>
                            <p><span className="ui-strong">{times.endLabel}:</span> {times.end}</p>
                          </>
                        );
                      })()}
                    </div>
                    {detail.generalNotes ? (
                      <p className="ui-muted">{detail.generalNotes}</p>
                    ) : null}
                    {detail.sections.map((section) => (
                      <div key={section.key}>
                        <h3 className="ui-card-title">{section.title}</h3>
                        <div className="mt-2 space-y-2">
                          {section.items.map((item) => (
                            <div key={item.key} className="flex items-start gap-2 rounded-lg border border-slate-100 p-2">
                              <span className={item.checked ? "text-green-600" : "text-slate-300"}>{item.checked ? "✓" : "○"}</span>
                              <div>
                                <p className="ui-strong">{item.label}</p>
                                {item.note ? <p className="ui-muted">{item.note}</p> : null}
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
