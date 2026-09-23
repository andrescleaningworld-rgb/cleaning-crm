"use client";

// Simplicity pass rewrite (docs/team-hub-spec.md "GLOBAL RULES" + "CREW
// PHONE APP" §4): one area at a time, tap = done / tap again = undo, big
// "Next area" -> "Finish" button, progress bar, an always-visible "Report a
// problem" button. Replaces the old per-item Done/N-A/Problem three-button
// row and the always-expanded area list from the Phase 2 version.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { TeamHubLang } from "../teamHubStrings";
import { teamHubStrings } from "../teamHubStrings";
import ReportProblemButton from "./ReportProblemButton";

type ChecklistItem = {
  crewItemId: number;
  area: string;
  text: string;
  isNote: boolean;
  frequency: string;
  instanceLabel: string | null;
};

type LoadResponse = {
  success?: boolean;
  items?: ChecklistItem[];
  run?: { id: number } | null;
  runItems?: { crewItemId: number }[];
  error?: string;
};

export default function ChecklistView({ token, lang, onBack }: { token: string; lang: TeamHubLang; onBack: () => void }) {
  const s = teamHubStrings(lang).checklist;
  const common = teamHubStrings(lang).common;

  const [loading, setLoading] = useState(true);
  const [banner, setBanner] = useState("");
  const [items, setItems] = useState<ChecklistItem[]>([]);
  const [hasRun, setHasRun] = useState(false);
  const [doneIds, setDoneIds] = useState<Set<number>>(new Set());
  const [starting, setStarting] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [justSubmitted, setJustSubmitted] = useState(false);
  const [areaIndex, setAreaIndex] = useState(0);

  // Failed autosaves that need a retry once we're back online — this app's
  // light offline handling (see GLOBAL RULES "No signal — saved, will send
  // later"): the tap stays applied in the UI, and we retry the same write
  // once connectivity returns, rather than reverting the crew's tap.
  const pendingRetries = useRef<Map<number, () => Promise<void>>>(new Map());

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/team-hub/${encodeURIComponent(token)}/checklist`, { cache: "no-store" });
      const data: LoadResponse = await res.json();
      if (!res.ok || !data.success) {
        setBanner(data.error || common.somethingWrong);
        return;
      }
      setItems(data.items ?? []);
      setHasRun(!!data.run);
      setDoneIds(new Set((data.runItems ?? []).map((ri) => ri.crewItemId)));
    } catch {
      setBanner(common.somethingWrong);
    } finally {
      setLoading(false);
    }
  }, [token, common.somethingWrong]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    function flush() {
      for (const [id, retry] of pendingRetries.current) {
        pendingRetries.current.delete(id);
        retry();
      }
    }
    window.addEventListener("online", flush);
    return () => window.removeEventListener("online", flush);
  }, []);

  async function startRun() {
    setStarting(true);
    setBanner("");
    try {
      const res = await fetch(`/api/team-hub/${encodeURIComponent(token)}/checklist`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "start" }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setBanner(data.error || common.somethingWrong);
        return;
      }
      setHasRun(true);
      setJustSubmitted(false);
      setAreaIndex(0);
    } catch {
      setBanner(common.somethingWrong);
    } finally {
      setStarting(false);
    }
  }

  const checkable = useMemo(() => items.filter((i) => !i.isNote), [items]);
  const notes = useMemo(() => items.filter((i) => i.isNote), [items]);

  const byArea = useMemo(() => {
    const map = new Map<string, ChecklistItem[]>();
    for (const item of checkable) {
      const list = map.get(item.area) ?? [];
      list.push(item);
      map.set(item.area, list);
    }
    return Array.from(map.entries());
  }, [checkable]);

  const currentArea = byArea[areaIndex];
  const isLastArea = areaIndex >= byArea.length - 1;

  async function toggle(crewItemId: number) {
    const wasDone = doneIds.has(crewItemId);
    navigator.vibrate?.(15);
    setDoneIds((prev) => {
      const next = new Set(prev);
      if (wasDone) next.delete(crewItemId);
      else next.add(crewItemId);
      return next;
    });

    const attempt = async () => {
      const res = await fetch(`/api/team-hub/${encodeURIComponent(token)}/checklist`, {
        method: wasDone ? "DELETE" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(wasDone ? { crewItemId } : { crewItemId, status: "done", note: "" }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || common.somethingWrong);
    };

    try {
      await attempt();
      pendingRetries.current.delete(crewItemId);
      setBanner("");
    } catch {
      setBanner(common.noSignalSaved);
      pendingRetries.current.set(crewItemId, async () => {
        try {
          await attempt();
        } catch {
          // still offline — stays queued for the next 'online' event
        }
      });
    }
  }

  async function finish() {
    setFinishing(true);
    setBanner("");
    try {
      const res = await fetch(`/api/team-hub/${encodeURIComponent(token)}/checklist`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "submit" }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setBanner(data.error || common.somethingWrong);
        return;
      }
      navigator.vibrate?.([15, 60, 15]);
      setJustSubmitted(true);
      setHasRun(false);
      setDoneIds(new Set());
      setTimeout(onBack, 1400);
    } catch {
      setBanner(common.somethingWrong);
    } finally {
      setFinishing(false);
    }
  }

  if (loading) {
    return <p className="mt-4 text-lg text-slate-500">{common.loading}</p>;
  }

  if (justSubmitted) {
    return (
      <div className="mt-6 rounded-2xl bg-green-50 border-2 border-green-200 p-8 text-center">
        <p className="text-2xl">✓</p>
        <p className="mt-2 text-lg font-bold text-green-800">{s.submitted}</p>
      </div>
    );
  }

  if (checkable.length === 0) {
    return (
      <div className="mt-3 space-y-3">
        <button type="button" onClick={onBack} className="text-base font-semibold text-blue-700">
          ← {common.back}
        </button>
        <p className="mt-4 text-lg text-slate-500">{s.noItems}</p>
      </div>
    );
  }

  if (!hasRun) {
    return (
      <div className="mt-3 space-y-3">
        <button type="button" onClick={onBack} className="text-base font-semibold text-blue-700">
          ← {common.back}
        </button>
        <button
          type="button"
          onClick={startRun}
          disabled={starting}
          className="min-h-[72px] w-full rounded-2xl bg-blue-700 text-xl font-bold text-white disabled:opacity-60"
        >
          {starting ? s.starting : s.startChecklist}
        </button>
      </div>
    );
  }

  const doneCount = checkable.filter((i) => doneIds.has(i.crewItemId)).length;

  return (
    <div className="mt-3 space-y-3">
      <div className="flex items-center justify-between">
        <button type="button" onClick={onBack} className="text-base font-semibold text-blue-700">
          ← {common.back}
        </button>
        <span className="text-base font-bold text-slate-600">{s.area(areaIndex + 1, byArea.length)}</span>
      </div>

      <div className="h-3 w-full overflow-hidden rounded-full bg-gray-200">
        <div
          className="h-full bg-green-600 transition-all"
          style={{ width: `${checkable.length ? (doneCount / checkable.length) * 100 : 0}%` }}
        />
      </div>

      {banner && <div className="rounded-xl bg-amber-100 px-4 py-3 text-base font-semibold text-amber-900">{banner}</div>}

      {areaIndex === 0 && notes.length > 0 && (
        <div className="rounded-2xl bg-amber-50 border border-amber-200 p-4 space-y-1.5">
          {notes.map((note) => (
            <p key={note.crewItemId} className="text-lg text-amber-900">
              📌 {note.text}
            </p>
          ))}
        </div>
      )}

      <div className="rounded-2xl bg-white shadow-sm overflow-hidden">
        <h3 className="bg-slate-100 px-4 py-3 text-lg font-bold text-slate-900">{currentArea?.[0]}</h3>
        <ul className="divide-y divide-gray-100">
          {currentArea?.[1].map((item) => {
            const done = doneIds.has(item.crewItemId);
            return (
              <li key={item.crewItemId}>
                <button
                  type="button"
                  onClick={() => toggle(item.crewItemId)}
                  className={`flex min-h-[72px] w-full items-center gap-3 px-4 text-left text-lg font-semibold transition-colors ${
                    done ? "bg-green-50 text-green-800" : "text-slate-800"
                  }`}
                >
                  <span
                    className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-lg ${
                      done ? "bg-green-600 text-white" : "border-2 border-slate-300"
                    }`}
                  >
                    {done ? "✓" : ""}
                  </span>
                  {item.instanceLabel ? `${item.text} — ${item.instanceLabel}` : item.text}
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      {isLastArea ? (
        <button
          type="button"
          onClick={finish}
          disabled={finishing}
          className="min-h-[72px] w-full rounded-2xl bg-blue-700 text-xl font-bold text-white disabled:opacity-60"
        >
          {finishing ? s.finishing : s.finish}
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setAreaIndex((i) => i + 1)}
          className="min-h-[72px] w-full rounded-2xl bg-blue-700 text-xl font-bold text-white"
        >
          {s.nextArea}
        </button>
      )}

      <ReportProblemButton token={token} lang={lang} />
    </div>
  );
}
