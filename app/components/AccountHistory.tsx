"use client";

// "History" on an account (account page and Crew Link): every save, who
// made it and when, and each field's old → new value — so a manager can see
// what was there before (e.g. "Monthly Revenue: $200 → $100"). Saves from
// before this was added show only "Updated" (no field detail was kept).
import { useEffect, useState } from "react";
import { formatCrewDateTime } from "@/lib/crewDateTime";

type Entry = { id: number; action: string; actorName: string; detail: string | null; createdAt: string };

export default function AccountHistory({ accountId }: { accountId: string }) {
  const [open, setOpen] = useState(false);
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    fetch(`/api/admin/account-history?accountId=${encodeURIComponent(accountId)}`, { cache: "no-store" })
      .then((res) => res.json())
      .then((data: { success?: boolean; entries?: Entry[]; error?: string }) => {
        if (cancelled) return;
        if (data.success) setEntries(data.entries ?? []);
        else setError(data.error || "Could not load history.");
      })
      .catch(() => {
        if (!cancelled) setError("Could not load history.");
      });
    return () => {
      cancelled = true;
    };
  }, [open, accountId]);

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="flex w-full items-center justify-between text-left">
        <span className="text-base font-black text-slate-900">History</span>
        <span className="text-sm font-bold text-blue-700">{open ? "Hide" : "Show changes"}</span>
      </button>
      {open ? (
        <div className="mt-3">
          {error ? <p className="text-sm font-semibold text-red-700">{error}</p> : null}
          {entries === null && !error ? <p className="text-sm text-slate-500">Loading…</p> : null}
          {entries && entries.length === 0 ? <p className="text-sm text-slate-500">No changes recorded yet.</p> : null}
          {entries && entries.length > 0 ? (
            <ul className="divide-y divide-slate-100">
              {entries.map((entry) => {
                const lines = (entry.detail ?? "").split("\n").filter(Boolean);
                return (
                  <li key={entry.id} className="py-3">
                    <p className="text-sm font-bold text-slate-900">
                      {entry.actorName || "Someone"} · <span className="font-semibold text-slate-500">{formatCrewDateTime(entry.createdAt)}</span>
                    </p>
                    {lines.length === 0 ? (
                      <p className="text-sm text-slate-600">{entry.action === "create" ? "Created the account" : "Updated (details not recorded)"}</p>
                    ) : (
                      <ul className="mt-1 space-y-0.5">
                        {lines.map((line, i) => {
                          const [field, ...rest] = line.split(": ");
                          return (
                            <li key={i} className="text-sm text-slate-700">
                              {rest.length ? (
                                <>
                                  <span className="font-semibold text-slate-900">{field}:</span> {rest.join(": ")}
                                </>
                              ) : (
                                line
                              )}
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </li>
                );
              })}
            </ul>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
