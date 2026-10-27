"use client";

// Crew Link — Submitted: every checklist and supply request crews sent in
// through Crew Link, newest first. ?accountId= (from an account card on the
// Crew Link page) opens it filtered to that account. The list always shows
// everything; the report range only decides what goes in the PDFs (Share
// Report, and Share selected, which takes the checked rows in the range,
// grouped by account).

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { describeWorkTimes, type ChecklistSubmissionSection } from "@/lib/checklistTemplate";
import { formatCrewDateTime } from "@/lib/crewDateTime";
import AccountLink from "../../components/AccountLink";

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

type SupplyRequest = {
  id: number;
  accountId: string;
  accountName: string;
  reporterName: string;
  status: string;
  note: string;
  noteEnglish: string | null;
  otherItems: string | null;
  createdAt: string;
  lines: { itemName: string; unit: string; qty: number }[];
};

type FlaggedAccount = { accountId: string; accountName: string };

type ListResponse = {
  success?: boolean;
  error?: string;
  submissions?: SubmissionSummary[];
  supplyRequests?: SupplyRequest[];
  flaggedAccounts?: FlaggedAccount[];
};

type DetailResponse = {
  success?: boolean;
  error?: string;
  detail?: SubmissionSummary & { sections: ChecklistSubmissionSection[] };
};

type TypeFilter = "all" | "checklists" | "supplies";

type Row =
  | { key: string; kind: "checklist"; at: string; checklist: SubmissionSummary }
  | { key: string; kind: "supplies"; at: string; supplies: SupplyRequest };

const SUPPLY_STATUS_LABEL: Record<string, string> = {
  new: "New",
  ordered: "Ordered",
  delivered: "Delivered",
  cancelled: "Cancelled",
};

// "YYYY-MM-DD" for a moment, in this computer's time zone.
function localDay(value: Date | string): string {
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function linesSummary(request: SupplyRequest): string {
  const parts = request.lines.map((l) => `${l.qty}× ${l.itemName}`);
  if (request.otherItems) parts.push(`Other: ${request.otherItems}`);
  return parts.join(", ") || "—";
}

export default function PorterChecklistSubmissionsPage() {
  // null until ?accountId= has been read, so the list loads once.
  const [accountFilter, setAccountFilter] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [submissions, setSubmissions] = useState<SubmissionSummary[]>([]);
  const [supplyRequests, setSupplyRequests] = useState<SupplyRequest[]>([]);
  const [flaggedAccounts, setFlaggedAccounts] = useState<FlaggedAccount[]>([]);
  const [loading, setLoading] = useState(false);
  const [listError, setListError] = useState("");

  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const [detail, setDetail] = useState<(SubmissionSummary & { sections: ChecklistSubmissionSection[] }) | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const [rangePreset, setRangePreset] = useState<"7" | "30" | "custom">("30");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [reportPending, setReportPending] = useState(false);
  const [reportError, setReportError] = useState("");

  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [sharePending, setSharePending] = useState(false);
  const [shareError, setShareError] = useState("");

  // canShare() existing isn't enough — some browsers implement navigator.share
  // for text/URLs only and report false from canShare() specifically for
  // files, so this probes with a real (throwaway) File the same shape as
  // what handleShareReport will actually share. Mirrors app/supply-orders.
  const [canShareFiles, setCanShareFiles] = useState(false);

  useEffect(() => {
    setAccountFilter(new URLSearchParams(window.location.search).get("accountId") ?? "");
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
      setSupplyRequests(data.supplyRequests ?? []);
      setFlaggedAccounts(data.flaggedAccounts ?? []);
    } catch (err) {
      setListError(err instanceof Error ? err.message : "Could not load submissions.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (accountFilter === null) return;
    loadSubmissions(accountFilter);
    // Keep the address in step, so a refresh or a shared link shows the same account.
    const url = new URL(window.location.href);
    if (accountFilter) url.searchParams.set("accountId", accountFilter);
    else url.searchParams.delete("accountId");
    window.history.replaceState(null, "", url.toString());
  }, [accountFilter]);

  // A new account, type or range starts a fresh selection.
  useEffect(() => {
    setSelected(new Set());
    setShareError("");
  }, [accountFilter, typeFilter, rangePreset, customStart, customEnd]);

  // The report range, as days (inclusive). It only decides what Share Report
  // and Share selected put in the PDF; the list always shows everything.
  // null while a custom range is missing a date.
  const reportRange = useMemo((): { start: string; end: string } | null => {
    if (rangePreset === "custom") {
      return customStart && customEnd ? { start: customStart, end: customEnd } : null;
    }
    const start = new Date();
    start.setDate(start.getDate() - (rangePreset === "7" ? 7 : 30));
    return { start: localDay(start), end: localDay(new Date()) };
  }, [rangePreset, customStart, customEnd]);

  // Every submission's time by row key, for checking a selection against the range.
  const atByKey = useMemo(
    () =>
      new Map<string, string>([
        ...submissions.map((s): [string, string] => [`c:${s.id}`, s.submittedAt]),
        ...supplyRequests.map((r): [string, string] => [`s:${r.id}`, r.createdAt]),
      ]),
    [submissions, supplyRequests]
  );
  const inReportRange = (at: string) => {
    if (!reportRange) return false;
    const day = localDay(at);
    return day >= reportRange.start && day <= reportRange.end;
  };
  const selectedInRange = [...selected].filter((key) => inReportRange(atByKey.get(key) ?? "")).length;

  // Everything for the account and type filters, newest first (no date limit).
  const rows = useMemo((): Row[] => {
    const all: Row[] = [
      ...(typeFilter === "supplies"
        ? []
        : submissions.map((s): Row => ({ key: `c:${s.id}`, kind: "checklist", at: s.submittedAt, checklist: s }))),
      ...(typeFilter === "checklists"
        ? []
        : supplyRequests.map((r): Row => ({ key: `s:${r.id}`, kind: "supplies", at: r.createdAt, supplies: r }))),
    ];
    return all.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
  }, [submissions, supplyRequests, typeFilter]);

  const allShownSelected = rows.length > 0 && rows.every((row) => selected.has(row.key));

  function toggleRow(key: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function toggleAll() {
    setSelected(allShownSelected ? new Set() : new Set(rows.map((row) => row.key)));
  }

  async function handleExpandChecklist(row: Row & { kind: "checklist" }) {
    if (expandedKey === row.key) {
      setExpandedKey(null);
      setDetail(null);
      return;
    }
    setExpandedKey(row.key);
    setDetail(null);
    setDetailLoading(true);
    try {
      const response = await fetch(`/api/checklist-submissions?id=${row.checklist.id}`, { cache: "no-store" });
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

  function handleExpandSupplies(key: string) {
    setDetail(null);
    setExpandedKey(expandedKey === key ? null : key);
  }

  function validateReportRange(): { start: string; end: string } | null {
    if (!reportRange) {
      setReportError("Choose a start and end date.");
      return null;
    }
    return reportRange;
  }

  async function readPdf(response: Response): Promise<{ blob: Blob; filename: string }> {
    if (!response.ok) {
      const data = await response.json().catch(() => ({} as { error?: string }));
      throw new Error(data.error || "Could not generate the report.");
    }
    const blob = await response.blob();
    const disposition = response.headers.get("Content-Disposition") || "";
    const match = disposition.match(/filename="([^"]+)"/);
    return { blob, filename: match ? match[1] : "report.pdf" };
  }

  async function fetchReportPdf(start: string, end: string): Promise<{ blob: Blob; filename: string }> {
    const url = `/api/porter-checklist-report?accountId=${encodeURIComponent(accountFilter ?? "")}&start=${start}&end=${end}`;
    return readPdf(await fetch(url));
  }

  function downloadBlob(blob: Blob, filename: string) {
    const objectUrl = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = objectUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
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
        title: `Crew Link Report — ${accountName}`,
        text: `Crew Link report for ${accountName}`,
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
      downloadBlob(blob, filename);
    } catch (err) {
      setReportError(err instanceof Error ? err.message : "Could not download the report.");
    } finally {
      setReportPending(false);
    }
  }

  // Same flow as Share Report (share sheet where the device has one, a
  // download otherwise), but one PDF with only the checked rows that fall in
  // the report range.
  async function handleShareSelected() {
    if (selected.size === 0) return;
    if (!reportRange) {
      setShareError("Choose a start and end date for the report range.");
      return;
    }
    const keys = [...selected].filter((key) => inReportRange(atByKey.get(key) ?? ""));
    if (keys.length === 0) {
      setShareError("None of the selected submissions are in the report range.");
      return;
    }
    const ids = (prefix: string) => keys.filter((k) => k.startsWith(prefix)).map((k) => Number(k.slice(2)));
    setShareError("");
    setSharePending(true);
    try {
      const { blob, filename } = await readPdf(
        await fetch("/api/porter-checklist-report/selected", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ checklistIds: ids("c:"), supplyIds: ids("s:") }),
        })
      );
      if (canShareFiles) {
        const file = new File([blob], filename, { type: "application/pdf" });
        await navigator.share({
          files: [file],
          title: "Crew Link Report",
          text: `Crew Link report (${keys.length} submission${keys.length === 1 ? "" : "s"})`,
        });
      } else {
        downloadBlob(blob, filename);
      }
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") return;
      setShareError(err instanceof Error ? err.message : "Could not share the selected submissions.");
    } finally {
      setSharePending(false);
    }
  }

  const accountName = accountFilter ? flaggedAccounts.find((a) => a.accountId === accountFilter)?.accountName : "";
  const typeCounts = {
    all: submissions.length + supplyRequests.length,
    checklists: submissions.length,
    supplies: supplyRequests.length,
  };

  return (
    <div className="ui-screen">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Image src="/logo-CW-single-phone-optimized.png" alt="Cleaning World" width={36} height={36} className="h-9 w-9 object-contain" />
          <h1 className="ui-screen-title">Crew Link — Submitted{accountName ? ` · ${accountName}` : ""}</h1>
        </div>
        <select
          value={accountFilter ?? ""}
          onChange={(event) => setAccountFilter(event.target.value)}
          className="ui-input"
          aria-label="Account"
        >
          <option value="">All accounts</option>
          {accountFilter && !flaggedAccounts.some((a) => a.accountId === accountFilter) ? (
            <option value={accountFilter}>{accountFilter}</option>
          ) : null}
          {flaggedAccounts.map((a) => (
            <option key={a.accountId} value={a.accountId}>
              {a.accountName}
            </option>
          ))}
        </select>
      </div>
      <Link href="/crew-link" className="ui-link">
        ← Crew Link
      </Link>

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
        <p className="ui-muted">Choose a specific account above to share or download its report, or check rows below to share just those.</p>
      ) : null}
      <p className="ui-muted">The report range decides what goes in Share Report and Share selected. The list below shows everything.</p>
      {reportError ? (
        <p className="ui-field-error">
          {reportError}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {(
          [
            ["all", `All ${typeCounts.all}`],
            ["checklists", `Checklists ${typeCounts.checklists}`],
            ["supplies", `Supplies ${typeCounts.supplies}`],
          ] as [TypeFilter, string][]
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setTypeFilter(key)}
            aria-pressed={typeFilter === key}
            className={`min-h-[48px] rounded-full border-2 px-4 text-base font-bold ${
              typeFilter === key ? "border-blue-700 bg-blue-700 text-white" : "border-slate-300 bg-white text-slate-800 hover:bg-slate-100"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {listError ? (
        <p className="ui-field-error">
          {listError}
        </p>
      ) : null}

      {loading || accountFilter === null ? <p className="ui-muted">Loading submissions…</p> : null}

      {!loading && accountFilter !== null && rows.length === 0 ? (
        <p className="ui-muted">Nothing submitted yet.</p>
      ) : null}

      {rows.length > 0 ? (
        <label className="flex min-h-[48px] cursor-pointer items-center gap-3 px-1">
          <input
            type="checkbox"
            checked={allShownSelected}
            onChange={toggleAll}
            className="h-6 w-6 shrink-0 accent-blue-700"
          />
          <span className="ui-strong">Select all ({rows.length})</span>
        </label>
      ) : null}

      <div className="space-y-3">
        {rows.map((row) => (
          <div key={row.key} className="ui-card">
            <div className="flex items-stretch gap-2">
              <label
                className="flex shrink-0 cursor-pointer items-center px-1"
                aria-label="Select for sharing"
              >
                <input
                  type="checkbox"
                  checked={selected.has(row.key)}
                  onChange={() => toggleRow(row.key)}
                  className="h-6 w-6 accent-blue-700"
                />
              </label>
              {row.kind === "checklist" ? (
                <button
                  type="button"
                  onClick={() => handleExpandChecklist(row)}
                  className="ui-pick min-w-0 flex-1"
                >
                  <div className="min-w-0 flex-1">
                    <p className="ui-strong">
                      <span className="mr-2 rounded-full bg-green-50 px-2 py-0.5 text-sm font-black text-green-800">Checklist</span>
                      <AccountLink nested accountId={row.checklist.accountId} name={row.checklist.accountName} /> — {row.checklist.locationName}
                      {row.checklist.tabName ? (
                        <span className="ml-2 rounded-full bg-blue-50 px-2 py-0.5 text-base font-black text-blue-700">{row.checklist.tabName}</span>
                      ) : null}
                    </p>
                    <p className="ui-muted">
                      {(() => {
                        // New submissions: automatic Started / Finished. Old ones: typed Week Of + times.
                        const submission = row.checklist;
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
                      row.checklist.completedCount === row.checklist.totalCount
                        ? "bg-green-100 text-green-800"
                        : "bg-amber-100 text-amber-800"
                    }`}
                  >
                    {row.checklist.completedCount}/{row.checklist.totalCount}
                  </span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => handleExpandSupplies(row.key)}
                  className="ui-pick min-w-0 flex-1"
                >
                  <div className="min-w-0 flex-1">
                    <p className="ui-strong">
                      <span className="mr-2 rounded-full bg-violet-50 px-2 py-0.5 text-sm font-black text-violet-800">Supplies</span>
                      <AccountLink nested accountId={row.supplies.accountId} name={row.supplies.accountName} />
                    </p>
                    <p className="ui-muted">
                      {[row.supplies.reporterName || "Unknown", formatCrewDateTime(row.supplies.createdAt)].join(" · ")}
                    </p>
                    <p className="ui-muted truncate">{linesSummary(row.supplies)}</p>
                  </div>
                  <span className="shrink-0 rounded-full bg-slate-100 px-3 py-1 text-base font-black text-slate-700">
                    {SUPPLY_STATUS_LABEL[row.supplies.status] ?? row.supplies.status}
                  </span>
                </button>
              )}
            </div>

            {expandedKey === row.key && row.kind === "checklist" ? (
              <div className="border-t border-slate-100 p-4">
                {detailLoading ? <p className="ui-muted">Loading detail…</p> : null}
                {detail && detail.id === row.checklist.id ? (
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

            {expandedKey === row.key && row.kind === "supplies" ? (
              <div className="space-y-3 border-t border-slate-100 p-4">
                <p className="ui-muted">
                  Requested by <span className="ui-strong">{row.supplies.reporterName || "Unknown"}</span> ·{" "}
                  {formatCrewDateTime(row.supplies.createdAt)} · {SUPPLY_STATUS_LABEL[row.supplies.status] ?? row.supplies.status}
                </p>
                {row.supplies.lines.length > 0 ? (
                  <div className="space-y-2">
                    {row.supplies.lines.map((line, index) => (
                      <div key={index} className="flex items-start gap-3 rounded-lg border border-slate-100 p-2">
                        <span className="ui-strong w-12 shrink-0 text-right">{line.qty}×</span>
                        <p>
                          {line.itemName}
                          {line.unit ? <span className="ui-muted"> ({line.unit})</span> : null}
                        </p>
                      </div>
                    ))}
                  </div>
                ) : null}
                {row.supplies.otherItems ? (
                  <p><span className="ui-strong">Other supplies:</span> {row.supplies.otherItems}</p>
                ) : null}
                {row.supplies.note ? (
                  <p>
                    <span className="ui-strong">Note:</span> {row.supplies.note}
                    {row.supplies.noteEnglish && row.supplies.noteEnglish !== row.supplies.note ? (
                      <span className="ui-muted"> (English: {row.supplies.noteEnglish})</span>
                    ) : null}
                  </p>
                ) : null}
                <Link href={`/supply-orders?order=crew-${row.supplies.id}`} className="ui-btn ui-btn-second">
                  Open in Supply Orders →
                </Link>
              </div>
            ) : null}
          </div>
        ))}
      </div>

      {selected.size > 0 ? (
        <div className="sticky bottom-3 z-20 flex flex-wrap items-center justify-between gap-3 rounded-xl border-2 border-blue-700 bg-white p-3 shadow-lg">
          <span>
            <span className="ui-strong">{selected.size} selected</span>
            {selectedInRange !== selected.size ? (
              <span className="ui-muted"> · {selectedInRange} in the report range will be shared</span>
            ) : null}
          </span>
          {shareError ? <span className="ui-field-error">{shareError}</span> : null}
          <div className="flex gap-2">
            <button type="button" onClick={() => setSelected(new Set())} className="ui-btn ui-btn-second">
              Clear
            </button>
            <button type="button" onClick={handleShareSelected} disabled={sharePending} className="ui-btn ui-btn-main">
              {sharePending ? "Preparing…" : canShareFiles ? "Share selected" : "Download selected"}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
