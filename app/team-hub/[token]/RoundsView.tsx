"use client";

// Simplicity pass rewrite (docs/team-hub-spec.md "GLOBAL RULES" + "CREW
// PHONE APP" §5): one big button per round, colored green/amber/red by how
// overdue it is, tap = checked. Nothing else — no note field, no separate
// detail screen (the old version's per-item detail card is gone).
//
// No offline queue (Phase 4: see ChecklistView's file comment) — a failed
// check-in reverts its optimistic timestamp and shows "No signal — try
// again."
import { useCallback, useEffect, useState } from "react";
import type { TeamHubLang } from "../teamHubStrings";
import { teamHubStrings } from "../teamHubStrings";

type RoundItem = {
  crewItemId: number;
  name: string;
  intervalMinutes: number;
  instanceLabel: string | null;
  lastCheck: { checkedAt: string; workerFirstName: string | null } | null;
};

function minutesAgo(iso: string): number {
  return Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
}

export default function RoundsView({ token, lang, onBack }: { token: string; lang: TeamHubLang; onBack: () => void }) {
  const s = teamHubStrings(lang).rounds;
  const common = teamHubStrings(lang).common;

  const [loading, setLoading] = useState(true);
  const [banner, setBanner] = useState("");
  const [items, setItems] = useState<RoundItem[]>([]);
  const [checkingId, setCheckingId] = useState<number | null>(null);
  // Re-render periodically so the color/age stays live without pull-to-refresh.
  const [, setTick] = useState(0);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/team-hub/${encodeURIComponent(token)}/rounds`, { cache: "no-store" });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setBanner(data.error || common.somethingWrong);
        return;
      }
      setItems(data.items ?? []);
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
    const interval = setInterval(() => setTick((t) => t + 1), 30000);
    return () => clearInterval(interval);
  }, []);

  function formatAgo(minutes: number): string {
    if (minutes < 1) return s.justNow;
    if (minutes < 60) return s.minAgo(minutes);
    return s.hoursAgo(Math.round(minutes / 60));
  }

  async function checkIn(crewItemId: number) {
    const previous = items.find((item) => item.crewItemId === crewItemId)?.lastCheck ?? null;
    setCheckingId(crewItemId);
    setBanner("");
    navigator.vibrate?.(15);
    const nowIso = new Date().toISOString();
    // Optimistic — reverted below if the write doesn't actually succeed.
    setItems((prev) => prev.map((item) => (item.crewItemId === crewItemId ? { ...item, lastCheck: { checkedAt: nowIso, workerFirstName: null } } : item)));
    try {
      const res = await fetch(`/api/team-hub/${encodeURIComponent(token)}/rounds`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ crewItemId, note: "" }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setItems((prev) => prev.map((item) => (item.crewItemId === crewItemId ? { ...item, lastCheck: previous } : item)));
        setBanner(data.error || common.somethingWrong);
        return;
      }
      setItems((prev) => prev.map((item) => (item.crewItemId === crewItemId ? { ...item, lastCheck: data.lastCheck } : item)));
    } catch {
      setItems((prev) => prev.map((item) => (item.crewItemId === crewItemId ? { ...item, lastCheck: previous } : item)));
      setBanner(common.noSignal);
    } finally {
      setCheckingId(null);
    }
  }

  if (loading) {
    return <p className="mt-4 text-lg text-slate-500">{common.loading}</p>;
  }

  return (
    <div className="mt-3 space-y-3">
      <button type="button" onClick={onBack} className="text-base font-semibold text-blue-700">
        ← {common.back}
      </button>

      {banner && <div className="rounded-xl bg-amber-100 px-4 py-3 text-base font-semibold text-amber-900">{banner}</div>}

      {items.length === 0 ? (
        <p className="mt-4 text-lg text-slate-500">{s.noItems}</p>
      ) : (
        items.map((item) => {
          const ago = item.lastCheck ? minutesAgo(item.lastCheck.checkedAt) : null;
          const ratio = ago === null ? Infinity : ago / item.intervalMinutes;
          const colorClass =
            ratio >= 1
              ? "bg-red-600 text-white"
              : ratio >= 0.5
                ? "bg-amber-500 text-white"
                : "bg-green-600 text-white";
          const label = item.instanceLabel ? `${item.name} — ${item.instanceLabel}` : item.name;
          return (
            <button
              key={item.crewItemId}
              type="button"
              onClick={() => checkIn(item.crewItemId)}
              disabled={checkingId === item.crewItemId}
              className={`flex min-h-[80px] w-full flex-col items-start justify-center rounded-2xl px-5 text-left disabled:opacity-70 ${colorClass}`}
            >
              <span className="text-xl font-bold">{label}</span>
              <span className="text-base font-semibold opacity-90">
                {checkingId === item.crewItemId ? s.checking : ago === null ? s.notCheckedToday : ratio >= 1 ? `${s.overdue} — ${formatAgo(ago)}` : formatAgo(ago)}
              </span>
            </button>
          );
        })
      )}
    </div>
  );
}
