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
    <section className="mt-4 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-xl font-black text-slate-950">Checklists</h2>
      <p className="mt-1 text-sm font-semibold text-slate-500">Crew checklists from the last 60 days. Read-only.</p>

      {state.kind === "loading" ? (
        <p className="mt-4 text-base text-slate-500">Loading…</p>
      ) : state.kind === "unavailable" ? (
        <p className="mt-4 rounded-2xl bg-slate-50 p-4 text-base font-semibold text-slate-600">Checklists are not available for this account yet.</p>
      ) : state.kind === "error" ? (
        <p className="mt-4 rounded-2xl bg-amber-50 p-4 text-base font-semibold text-amber-800">Could not load checklists. Try again later.</p>
      ) : (
        <>
          {state.checklists.length === 0 ? (
            <p className="mt-4 text-base text-slate-500">No checklists in the last 60 days.</p>
          ) : (
            <ul className="mt-4 space-y-2">
              {state.checklists.map((row) => {
                const complete = row.doneCount >= row.totalCount && row.totalCount > 0;
                return (
                  <li key={`${row.source}-${row.id}`}>
                    <button
                      type="button"
                      onClick={() => openChecklist(row)}
                      className="flex w-full items-center justify-between gap-3 rounded-2xl border border-slate-200 p-4 text-left hover:border-blue-300 hover:bg-blue-50"
                    >
                      <span>
                        <span className="block text-base font-black text-slate-950">{formatCrewDateTime(row.submittedAt)}</span>
                        <span className="block text-sm font-semibold text-slate-600">
                          {row.name}
                          {row.label ? ` · ${row.label}` : ""}
                        </span>
                      </span>
                      <span
                        className={`shrink-0 rounded-full px-3 py-1 text-sm font-black ${
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

          <h3 className="mt-6 text-lg font-black text-slate-950">Problem reports</h3>
          {state.problems.length === 0 ? (
            <p className="mt-2 text-base text-slate-500">No problem reports.</p>
          ) : (
            <ul className="mt-2 space-y-2">
              {state.problems.map((problem) => (
                <li key={problem.id} className="rounded-2xl border border-slate-200 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-base font-black text-slate-950">{CATEGORY_LABEL[problem.category] ?? problem.category}</span>
                    <span
                      className={`rounded-full px-3 py-1 text-sm font-black ${
                        problem.status === "open" ? "bg-red-100 text-red-800" : "bg-green-100 text-green-800"
                      }`}
                    >
                      {problem.status === "open" ? "Open" : "Resolved"}
                    </span>
                  </div>
                  <p className="text-sm font-semibold text-slate-500">
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
          <div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-t-3xl bg-white p-5 shadow-xl sm:rounded-3xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xl font-black text-slate-950">{formatCrewDateTime(open.submittedAt)}</p>
                <p className="text-base font-semibold text-slate-600">
                  {open.name}
                  {open.label ? ` · ${open.label}` : ""} · {open.doneCount} of {open.totalCount} done
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(null)}
                className="rounded-2xl border border-slate-300 px-4 py-2 text-base font-black text-slate-700 hover:bg-slate-50"
              >
                Close
              </button>
            </div>

            {detailError ? (
              <p className="mt-4 rounded-2xl bg-amber-50 p-4 text-base font-semibold text-amber-800">{detailError}</p>
            ) : !detail ? (
              <p className="mt-4 text-base text-slate-500">Loading…</p>
            ) : (
              <div className="mt-4 space-y-4">
                {detail.startedAt ? (
                  <p className="text-sm font-semibold text-slate-500">
                    Started {formatCrewDateTime(detail.startedAt)} · Finished {formatCrewDateTime(detail.submittedAt)}
                  </p>
                ) : null}
                {detail.notes ? (
                  <div className="rounded-2xl bg-blue-50 p-4">
                    <p className="text-sm font-black text-blue-800">Note</p>
                    <p className="text-base text-slate-800">
                      <TranslatedText original={detail.notes} english={detail.notesEnglish} language={detail.notesLang} />
                    </p>
                  </div>
                ) : null}
                {detail.sections.map((section, index) => (
                  <div key={`${section.title}-${index}`}>
                    {section.title ? <p className="mb-2 text-base font-black text-slate-700">{section.title}</p> : null}
                    <ul className="space-y-1">
                      {section.items.map((item, itemIndex) => (
                        <li key={itemIndex} className={`rounded-xl px-3 py-2 ${item.checked ? "bg-green-50" : "bg-slate-50"}`}>
                          <div className="flex items-start gap-3">
                            <span className={`mt-0.5 text-lg font-black ${item.checked ? "text-green-700" : "text-slate-400"}`} aria-hidden="true">
                              {item.checked ? "✓" : item.status === "problem" ? "⚠" : "○"}
                            </span>
                            <div className="flex-1">
                              <p className="text-base font-semibold text-slate-900">{item.label}</p>
                              {item.subNote ? <p className="text-sm text-slate-500">{item.subNote}</p> : null}
                              {!item.checked ? <p className="text-sm font-bold text-slate-500">{item.status === "problem" ? "Problem" : "Not done"}</p> : null}
                              {item.note ? <p className="text-sm text-slate-700">{item.note}</p> : null}
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
