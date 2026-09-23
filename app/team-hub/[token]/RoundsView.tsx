"use client";

// Phase 2 crew-facing rounds check-in. No run/submit concept (see
// lib/teamHubDb.ts comment above getLatestTeamHubRoundChecksForCrew) — each
// round is just "when was it last checked" plus a Check In button.
import { useCallback, useEffect, useState } from "react";

type RoundItem = {
  crewItemId: number;
  name: string;
  intervalMinutes: number;
  instanceLabel: string | null;
  lastCheck: { checkedAt: string; note: string; workerFirstName: string | null } | null;
};

function minutesAgo(iso: string): number {
  return Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
}

function formatAgo(minutes: number): string {
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  return `${hours} hr${hours === 1 ? "" : "s"} ago`;
}

export default function RoundsView({ token, onBack }: { token: string; onBack: () => void }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [items, setItems] = useState<RoundItem[]>([]);
  const [checkingId, setCheckingId] = useState<number | null>(null);
  // Re-render periodically so "X min ago" / overdue styling stays live
  // without the worker having to pull-to-refresh.
  const [, setTick] = useState(0);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/team-hub/${encodeURIComponent(token)}/rounds`, { cache: "no-store" });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setError(data.error || "Couldn't load rounds.");
        return;
      }
      setItems(data.items ?? []);
    } catch {
      setError("Couldn't load rounds.");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const interval = setInterval(() => setTick((t) => t + 1), 30000);
    return () => clearInterval(interval);
  }, []);

  async function checkIn(crewItemId: number) {
    setCheckingId(crewItemId);
    setError("");
    try {
      const res = await fetch(`/api/team-hub/${encodeURIComponent(token)}/rounds`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ crewItemId, note: "" }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setError(data.error || "Couldn't check in.");
        return;
      }
      setItems((prev) => prev.map((item) => (item.crewItemId === crewItemId ? { ...item, lastCheck: data.lastCheck } : item)));
    } catch {
      setError("Couldn't check in — check your connection.");
    } finally {
      setCheckingId(null);
    }
  }

  if (loading) {
    return <p className="mt-4 text-sm text-slate-500">Loading…</p>;
  }

  return (
    <div className="mt-3 space-y-3">
      <button type="button" onClick={onBack} className="text-xs font-semibold text-blue-700">
        ← Today
      </button>

      {error && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</div>}

      {items.length === 0 ? (
        <p className="text-sm text-slate-500">No rounds are turned on for this crew yet.</p>
      ) : (
        items.map((item) => {
          const ago = item.lastCheck ? minutesAgo(item.lastCheck.checkedAt) : null;
          const overdue = ago !== null && ago > item.intervalMinutes;
          return (
            <div key={item.crewItemId} className="rounded-2xl bg-white p-4 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-sm font-bold text-slate-900">
                    {item.instanceLabel ? `${item.name} — ${item.instanceLabel}` : item.name}
                  </h3>
                  <p className="text-xs text-slate-500">Every {item.intervalMinutes} min</p>
                  {item.lastCheck ? (
                    <p className={`mt-1 text-xs font-semibold ${overdue ? "text-red-600" : "text-slate-500"}`}>
                      {overdue ? "Overdue — " : "Last checked "}
                      {formatAgo(ago!)}
                      {item.lastCheck.workerFirstName ? ` by ${item.lastCheck.workerFirstName}` : ""}
                    </p>
                  ) : (
                    <p className="mt-1 text-xs font-semibold text-slate-400">Not checked today</p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => checkIn(item.crewItemId)}
                  disabled={checkingId === item.crewItemId}
                  className="min-h-[44px] shrink-0 rounded-xl bg-blue-700 px-4 text-xs font-bold text-white disabled:opacity-60"
                >
                  {checkingId === item.crewItemId ? "…" : "Check In"}
                </button>
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}
