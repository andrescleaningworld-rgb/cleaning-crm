"use client";

import { useEffect, useState } from "react";

// How often to poll /api/version in the background — matches the "a few
// minutes" cadence, not tight enough to add any meaningful load.
const POLL_INTERVAL_MS = 5 * 60 * 1000;

type VersionResponse = {
  version?: string;
};

type ChangelogEntry = {
  date: string;
  version: string;
  description: string;
};

type ChangelogResponse = {
  success?: boolean;
  entries?: ChangelogEntry[];
};

// Renders nothing on mount and stays invisible unless /api/version reports a
// different build than the one this page loaded with — a signal fully
// independent of the service worker's own update/reload logic (public/sw.js
// is untouched by this). Placed in the root layout (not per-portal) so it
// covers admin/staff, subcontractor, and customer pages from one place.
export default function VersionCheckBanner({
  initialVersion,
}: {
  initialVersion: string;
}) {
  const [newVersionAvailable, setNewVersionAvailable] = useState(false);
  const [showChangelog, setShowChangelog] = useState(false);
  const [changelogEntries, setChangelogEntries] = useState<ChangelogEntry[]>([]);
  const [changelogLoading, setChangelogLoading] = useState(false);

  useEffect(() => {
    // "dev" is the local-dev fallback both server and client resolve to when
    // VERCEL_GIT_COMMIT_SHA is unset — never worth polling for in that case.
    if (initialVersion === "dev") return;

    let cancelled = false;

    async function checkVersion() {
      try {
        const response = await fetch("/api/version", { cache: "no-store" });
        const data: VersionResponse = await response.json();
        if (!cancelled && data.version && data.version !== initialVersion) {
          setNewVersionAvailable(true);
        }
      } catch {
        // Best-effort only — a failed check just means no signal at this
        // moment, not an error condition worth surfacing to the user.
      }
    }

    void checkVersion();

    const interval = window.setInterval(checkVersion, POLL_INTERVAL_MS);

    // Same focus/visibility-refetch pattern already used on the dashboard
    // (app/page.tsx) — catches the common case of a laptop reopened or a
    // background tab revisited long after a deploy went out.
    function handleFocusOrVisible() {
      if (document.visibilityState === "visible") {
        void checkVersion();
      }
    }

    document.addEventListener("visibilitychange", handleFocusOrVisible);
    window.addEventListener("focus", handleFocusOrVisible);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", handleFocusOrVisible);
      window.removeEventListener("focus", handleFocusOrVisible);
    };
  }, [initialVersion]);

  async function openChangelog() {
    setShowChangelog(true);
    setChangelogLoading(true);
    try {
      const response = await fetch("/api/changelog");
      const data: ChangelogResponse = await response.json();
      setChangelogEntries(data.success ? data.entries ?? [] : []);
    } catch {
      setChangelogEntries([]);
    } finally {
      setChangelogLoading(false);
    }
  }

  if (!newVersionAvailable) return null;

  return (
    <>
      <div className="no-print flex w-full items-center justify-center gap-4 bg-blue-700 px-4 py-2 text-sm font-semibold text-white">
        <span>New update available — click Refresh to install.</span>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="rounded-full bg-white px-4 py-1 text-xs font-bold text-blue-800 shadow-sm transition hover:bg-blue-50"
        >
          Refresh
        </button>
        <button
          type="button"
          onClick={openChangelog}
          title="What's new"
          aria-label="What's new"
          className="flex h-6 w-6 items-center justify-center rounded-full border border-white/50 text-xs font-bold text-white transition hover:bg-white/15"
        >
          ⓘ
        </button>
      </div>

      {showChangelog ? (
        <div className="no-print fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
          <div className="w-full max-w-md rounded-3xl bg-white p-5 shadow-2xl sm:p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.2em] text-blue-700">
                  What&apos;s new
                </p>
                <h2 className="mt-2 text-2xl font-black text-slate-950">Recent updates</h2>
              </div>

              <button
                type="button"
                onClick={() => setShowChangelog(false)}
                className="rounded-full bg-slate-100 px-3 py-2 text-sm font-black text-slate-600 hover:bg-slate-200"
              >
                X
              </button>
            </div>

            <div className="mt-5 grid gap-3">
              {changelogLoading ? (
                <p className="text-sm font-semibold text-slate-500">Loading...</p>
              ) : changelogEntries.length === 0 ? (
                <p className="text-sm font-semibold text-slate-500">
                  No update notes are available right now.
                </p>
              ) : (
                changelogEntries.map((entry, index) => (
                  <div
                    key={`${entry.date}-${index}`}
                    className="rounded-2xl border border-slate-200 bg-slate-50 px-5 py-4"
                  >
                    <p className="text-xs font-black uppercase tracking-wide text-slate-400">
                      {entry.date}
                    </p>
                    <p className="mt-1 text-sm font-semibold text-slate-800">
                      {entry.description}
                    </p>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
