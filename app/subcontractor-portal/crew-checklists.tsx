"use client";

// Sub portal → My Accounts → selected account: "Checklists" (Crew Link
// submissions + Team Hub runs, last 60 days, newest first) and "Problem
// reports" (status + photos). Read-only. The server decides access (Active
// SubSchedules row for this account + the signed-in email); anything it
// refuses just shows "not available yet" — no names are matched here.
import { useEffect, useState } from "react";
import TranslatedText from "@/app/components/TranslatedText";
import { formatCrewDateTime } from "@/lib/crewDateTime";
import type { SubPortalChecklistDetail, SubPortalChecklistRow, SubPortalProblem } from "@/lib/subPortalChecklists";

type ListState =
  | { kind: "loading" }
  | { kind: "unavailable" }
  | { kind: "error" }
  | { kind: "ready"; checklists: SubPortalChecklistRow[]; problems: SubPortalProblem[] };

const CATEGORY_LABEL: Record<string, string> = {
  restroom: "Restroom",
  trash: "Trash",
  damage: "Damage",
  leak: "Leak",
  access: "Access",
  supplies: "Supplies",
  safety: "Safety",
  other: "Other",
};

function Photos({ urls }: { urls: string[] }) {
  if (urls.length === 0) return null;
  return (
    <div className="mt-2 flex flex-wrap gap-2">
      {urls.map((url) => (
        <a key={url} href={url} target="_blank" rel="noreferrer">
          {/* eslint-disable-next-line @next/next/no-img-element -- Vercel Blob photo, read-only view */}
          <img src={url} alt="" className="h-20 w-20 rounded-xl border border-slate-200 object-cover" />
        </a>
      ))}
    </div>
  );
}

export default function CrewChecklists({ accountId }: { accountId: string }) {
  const [state, setState] = useState<ListState>({ kind: "loading" });
  const [open, setOpen] = useState<SubPortalChecklistRow | null>(null);
  const [detail, setDetail] = useState<SubPortalChecklistDetail | null>(null);
  const [detailError, setDetailError] = useState("");

  useEffect(() => {
    // Mounted with key={accountId}, so a new account starts fresh.
    let cancelled = false;
    fetch(`/api/subcontractor-portal/checklists?accountId=${encodeURIComponent(accountId)}`, { cache: "no-store" })
      .then(async (res) => {
        const data = (await res.json()) as { success?: boolean; checklists?: SubPortalChecklistRow[]; problems?: SubPortalProblem[] };
        if (cancelled) return;
        if (res.status === 403) setState({ kind: "unavailable" });
        else if (!data.success) setState({ kind: "error" });
        else setState({ kind: "ready", checklists: data.checklists ?? [], problems: data.problems ?? [] });
      })
      .catch(() => {
        if (!cancelled) setState({ kind: "error" });
      });
    return () => {
      cancelled = true;
    };
  }, [accountId]);

  async function openChecklist(row: SubPortalChecklistRow) {
    setOpen(row);
    setDetail(null);
    setDetailError("");
    const param = row.source === "crew-link" ? "submissionId" : "runId";
    try {
      const res = await fetch(
        `/api/subcontractor-portal/checklists?accountId=${encodeURIComponent(accountId)}&${param}=${row.id}`,
        { cache: "no-store" }
      );
      const data = (await res.json()) as { success?: boolean; detail?: SubPortalChecklistDetail; error?: string };
      if (data.success && data.detail) setDetail(data.detail);
      else setDetailError(data.error || "Could not open this checklist.");
    } catch {
      setDetailError("No connection. Try again.");
    }
  }

  return (
    <section className="ui-card">
      <h2 className="ui-card-title">Checklists</h2>
      <p className="ui-muted">Crew checklists from the last 60 days. Read-only.</p>

      {state.kind === "loading" ? (
        <p className="ui-muted">Loading…</p>
      ) : state.kind === "unavailable" ? (
        <p className="ui-strong">Checklists are not available for this account yet.</p>
      ) : state.kind === "error" ? (
        <p className="ui-strong">Could not load checklists. Try again later.</p>
      ) : (
        <>
          {state.checklists.length === 0 ? (
            <p className="ui-muted">No checklists in the last 60 days.</p>
          ) : (
            <ul className="mt-4 space-y-2">
              {state.checklists.map((row) => {
                const complete = row.doneCount >= row.totalCount && row.totalCount > 0;
                return (
                  <li key={`${row.source}-${row.id}`}>
                    <button
                      type="button"
                      onClick={() => openChecklist(row)}
                      className="ui-btn ui-btn-second w-full"
                    >
                      <span>
                        <span className="ui-strong">{formatCrewDateTime(row.submittedAt)}</span>
                        <span className="ui-strong">
                          {row.name}
                          {row.label ? ` · ${row.label}` : ""}
                        </span>
                      </span>
                      <span
                        className={`shrink-0 rounded-full px-3 py-1 text-base font-black ${
                          complete ? "bg-green-100 text-green-800" : "bg-amber-100 text-amber-800"
                        }`}
                      >
                        {row.doneCount} of {row.totalCount} done
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          <h3 className="ui-card-title">Problem reports</h3>
          {state.problems.length === 0 ? (
            <p className="ui-muted">No problem reports.</p>
          ) : (
            <ul className="mt-2 space-y-2">
              {state.problems.map((problem) => (
                <li key={problem.id} className="ui-stat">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="ui-strong">{CATEGORY_LABEL[problem.category] ?? problem.category}</span>
                    <span
                      className={`rounded-full px-3 py-1 text-base font-black ${
                        problem.status === "open" ? "bg-red-100 text-red-800" : "bg-green-100 text-green-800"
                      }`}
                    >
                      {problem.status === "open" ? "Open" : "Resolved"}
                    </span>
                  </div>
                  <p className="ui-muted">
                    {problem.reportedBy} · {formatCrewDateTime(problem.createdAt)}
                  </p>
                  {problem.note ? (
                    <p className="mt-1 text-base text-slate-800">
                      <TranslatedText original={problem.note} english={problem.noteEnglish} language={problem.noteLanguage} />
                    </p>
                  ) : null}
                  <Photos urls={problem.photos} />
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      {open ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4" role="dialog" aria-modal="true">
          <div className="ui-card">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="ui-strong">{formatCrewDateTime(open.submittedAt)}</p>
                <p className="ui-strong">
                  {open.name}
                  {open.label ? ` · ${open.label}` : ""} · {open.doneCount} of {open.totalCount} done
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(null)}
                className="ui-btn ui-btn-second"
              >
                Close
              </button>
            </div>

            {detailError ? (
              <p className="ui-strong">{detailError}</p>
            ) : !detail ? (
              <p className="ui-muted">Loading…</p>
            ) : (
              <div className="mt-4 space-y-4">
                {detail.startedAt ? (
                  <p className="ui-muted">
                    Started {formatCrewDateTime(detail.startedAt)} · Finished {formatCrewDateTime(detail.submittedAt)}
                  </p>
                ) : null}
                {detail.notes ? (
                  <div className="ui-stat">
                    <p className="ui-strong">Note</p>
                    <p className="text-base text-slate-800">
                      <TranslatedText original={detail.notes} english={detail.notesEnglish} language={detail.notesLang} />
                    </p>
                  </div>
                ) : null}
                {detail.sections.map((section, index) => (
                  <div key={`${section.title}-${index}`}>
                    {section.title ? <p className="ui-strong">{section.title}</p> : null}
                    <ul className="space-y-1">
                      {section.items.map((item, itemIndex) => (
                        <li key={itemIndex} className={`rounded-xl px-3 py-2 ${item.checked ? "bg-green-50" : "bg-slate-50"}`}>
                          <div className="flex items-start gap-3">
                            <span className={`mt-0.5 text-lg font-black ${item.checked ? "text-green-700" : "text-slate-400"}`} aria-hidden="true">
                              {item.checked ? "✓" : item.status === "problem" ? "⚠" : "○"}
                            </span>
                            <div className="flex-1">
                              <p className="ui-strong">{item.label}</p>
                              {item.subNote ? <p className="ui-muted">{item.subNote}</p> : null}
                              {!item.checked ? <p className="ui-muted">{item.status === "problem" ? "Problem" : "Not done"}</p> : null}
                              {item.note ? <p className="ui-muted">{item.note}</p> : null}
                              <Photos urls={item.photos} />
                            </div>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : null}
    </section>
  );
}
