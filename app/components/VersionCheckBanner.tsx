"use client";

import { useEffect, useState } from "react";

// How often to poll /api/version in the background — matches the "a few
// minutes" cadence, not tight enough to add any meaningful load.
const POLL_INTERVAL_MS = 5 * 60 * 1000;

type VersionResponse = {
  version?: string;
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

  if (!newVersionAvailable) return null;

  return (
    <div className="no-print flex w-full items-center justify-center gap-4 bg-blue-700 px-4 py-2 text-sm font-semibold text-white">
      <span>New update available — click Refresh to install.</span>
      <button
        type="button"
        onClick={() => window.location.reload()}
        className="rounded-full bg-white px-4 py-1 text-xs font-bold text-blue-800 shadow-sm transition hover:bg-blue-50"
      >
        Refresh
      </button>
    </div>
  );
}
