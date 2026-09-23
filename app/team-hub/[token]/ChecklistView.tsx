"use client";

// Phase 2 crew-facing checklist run flow: start/resume a run, tap-to-
// complete with autosave (PATCH per tap, no Save button), submit. Mirrors
// the tap-target sizing and card styling already established in
// app/team-hub/[token]/page.tsx.
import { useCallback, useEffect, useMemo, useState } from "react";

type ChecklistItem = {
  crewItemId: number;
  area: string;
  text: string;
  isNote: boolean;
  frequency: string;
  instanceLabel: string | null;
};

type RunItem = { crewItemId: number; status: "done" | "na" | "problem"; note: string };

type LoadResponse = {
  success?: boolean;
  items?: ChecklistItem[];
  run?: { id: number; startedAt: string } | null;
  runItems?: RunItem[];
  error?: string;
};

const STATUS_LABELS: Record<RunItem["status"], string> = { done: "Done", na: "N/A", problem: "Problem" };
const STATUS_STYLES: Record<RunItem["status"], string> = {
  done: "bg-green-600 text-white",
  na: "bg-slate-400 text-white",
  problem: "bg-red-600 text-white",
};

export default function ChecklistView({ token, onBack }: { token: string; onBack: () => void }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [items, setItems] = useState<ChecklistItem[]>([]);
  const [run, setRun] = useState<{ id: number; startedAt: string } | null>(null);
  const [runItemsByCrewItem, setRunItemsByCrewItem] = useState<Record<number, RunItem>>({});
  const [starting, setStarting] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [justSubmitted, setJustSubmitted] = useState(false);
  const [openNoteFor, setOpenNoteFor] = useState<number | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/team-hub/${encodeURIComponent(token)}/checklist`, { cache: "no-store" });
      const data: LoadResponse = await res.json();
      if (!res.ok || !data.success) {
        setError(data.error || "Couldn't load the checklist.");
        return;
      }
      setItems(data.items ?? []);
      setRun(data.run ?? null);
      const byId: Record<number, RunItem> = {};
      for (const ri of data.runItems ?? []) byId[ri.crewItemId] = { crewItemId: ri.crewItemId, status: ri.status, note: ri.note };
      setRunItemsByCrewItem(byId);
    } catch {
      setError("Couldn't load the checklist.");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  async function startRun() {
    setStarting(true);
    setError("");
    try {
      const res = await fetch(`/api/team-hub/${encodeURIComponent(token)}/checklist`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "start" }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setError(data.error || "Couldn't start the checklist.");
        return;
      }
      setRun(data.run);
      setJustSubmitted(false);
    } catch {
      setError("Couldn't start the checklist.");
    } finally {
      setStarting(false);
    }
  }

  async function setStatus(crewItemId: number, status: RunItem["status"]) {
    const note = runItemsByCrewItem[crewItemId]?.note ?? "";
    // Optimistic — the crew is tapping through a list fast; wait-for-server
    // per tap would make this feel broken on a spotty on-site connection.
    setRunItemsByCrewItem((prev) => ({ ...prev, [crewItemId]: { crewItemId, status, note } }));
    try {
      const res = await fetch(`/api/team-hub/${encodeURIComponent(token)}/checklist`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ crewItemId, status, note }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setError(data.error || "Couldn't save that. Try again.");
      }
    } catch {
      setError("Couldn't save that — check your connection.");
    }
  }

  async function saveNote(crewItemId: number, note: string) {
    const status = runItemsByCrewItem[crewItemId]?.status ?? "done";
    setRunItemsByCrewItem((prev) => ({ ...prev, [crewItemId]: { crewItemId, status, note } }));
    try {
      await fetch(`/api/team-hub/${encodeURIComponent(token)}/checklist`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ crewItemId, status, note }),
      });
    } catch {
      // Best-effort — the note field autosaves on blur; a dropped save here
      // just means the note reverts on next load, which the worker can retry.
    }
  }

  async function submitRun() {
    setSubmitting(true);
    setError("");
    try {
      const res = await fetch(`/api/team-hub/${encodeURIComponent(token)}/checklist`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "submit" }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setError(data.error || "Couldn't submit the checklist.");
        return;
      }
      setJustSubmitted(true);
      setRun(null);
      setRunItemsByCrewItem({});
    } catch {
      setError("Couldn't submit the checklist.");
    } finally {
      setSubmitting(false);
    }
  }

  const checkable = useMemo(() => items.filter((i) => !i.isNote), [items]);
  const notes = useMemo(() => items.filter((i) => i.isNote), [items]);
  const doneCount = checkable.filter((i) => runItemsByCrewItem[i.crewItemId]).length;

  const byArea = useMemo(() => {
    const map = new Map<string, ChecklistItem[]>();
    for (const item of checkable) {
      const list = map.get(item.area) ?? [];
      list.push(item);
      map.set(item.area, list);
    }
    return Array.from(map.entries());
  }, [checkable]);

  if (loading) {
    return <p className="mt-4 text-sm text-slate-500">Loading…</p>;
  }

  return (
    <div className="mt-3 space-y-3">
      <button type="button" onClick={onBack} className="text-xs font-semibold text-blue-700">
        ← Today
      </button>

      {error && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</div>}

      {justSubmitted && !run && (
        <div className="rounded-2xl bg-green-50 border border-green-200 p-4 text-sm text-green-800">
          Checklist submitted. Nice work.
        </div>
      )}

      {items.length === 0 ? (
        <p className="text-sm text-slate-500">No checklist items are turned on for this crew yet.</p>
      ) : !run ? (
        <div className="rounded-2xl bg-white p-4 shadow-sm text-center">
          <p className="text-sm text-slate-600">Start a new checklist run for this visit.</p>
          <button
            type="button"
            onClick={startRun}
            disabled={starting}
            className="mt-3 min-h-[52px] w-full rounded-xl bg-blue-700 text-sm font-bold text-white disabled:opacity-60"
          >
            {starting ? "Starting…" : "Start checklist"}
          </button>
        </div>
      ) : (
        <>
          <div className="sticky top-0 z-10 -mx-3 bg-gray-50 px-3 py-2">
            <div className="rounded-2xl bg-white p-3 shadow-sm">
              <p className="text-xs font-semibold text-slate-500">
                {doneCount} / {checkable.length} checked
              </p>
              <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-gray-100">
                <div
                  className="h-full bg-blue-700 transition-all"
                  style={{ width: `${checkable.length ? (doneCount / checkable.length) * 100 : 0}%` }}
                />
              </div>
            </div>
          </div>

          {notes.length > 0 && (
            <div className="rounded-2xl bg-amber-50 border border-amber-200 p-3 space-y-1.5">
              {notes.map((note) => (
                <p key={note.crewItemId} className="text-sm text-amber-900">
                  {note.text}
                </p>
              ))}
            </div>
          )}

          {byArea.map(([area, areaItems]) => (
            <div key={area} className="rounded-2xl bg-white p-4 shadow-sm">
              <h3 className="text-sm font-bold text-slate-900">{area}</h3>
              <ul className="mt-2 divide-y divide-gray-100">
                {areaItems.map((item) => {
                  const runItem = runItemsByCrewItem[item.crewItemId];
                  return (
                    <li key={item.crewItemId} className="py-3">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm text-slate-800">
                          {item.instanceLabel ? `${item.text} — ${item.instanceLabel}` : item.text}
                        </span>
                      </div>
                      <div className="mt-2 flex gap-2">
                        {(["done", "na", "problem"] as const).map((status) => (
                          <button
                            key={status}
                            type="button"
                            onClick={() => setStatus(item.crewItemId, status)}
                            className={`min-h-[40px] flex-1 rounded-lg text-xs font-bold ${
                              runItem?.status === status ? STATUS_STYLES[status] : "bg-gray-100 text-slate-600"
                            }`}
                          >
                            {STATUS_LABELS[status]}
                          </button>
                        ))}
                        <button
                          type="button"
                          onClick={() => setOpenNoteFor(openNoteFor === item.crewItemId ? null : item.crewItemId)}
                          className={`min-h-[40px] rounded-lg px-3 text-xs font-bold ${
                            runItem?.note ? "bg-blue-100 text-blue-700" : "bg-gray-100 text-slate-600"
                          }`}
                        >
                          Note
                        </button>
                      </div>
                      {openNoteFor === item.crewItemId && (
                        <textarea
                          defaultValue={runItem?.note ?? ""}
                          onBlur={(e) => saveNote(item.crewItemId, e.target.value)}
                          placeholder="Add a note…"
                          className="mt-2 w-full rounded-lg border border-gray-200 p-2 text-sm"
                          rows={2}
                        />
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}

          <button
            type="button"
            onClick={submitRun}
            disabled={submitting}
            className="min-h-[52px] w-full rounded-xl bg-blue-700 text-sm font-bold text-white disabled:opacity-60"
          >
            {submitting ? "Submitting…" : "Submit checklist"}
          </button>
        </>
      )}
    </div>
  );
}
