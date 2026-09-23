"use client";

// Always-visible bottom button on the Checklist screen, and the crew-facing
// content for the standalone "issues" module tile (both reuse this same
// small component — see docs/team-hub-spec.md). Note only, no photo until
// Phase 4.
import { useState } from "react";
import type { TeamHubLang } from "../teamHubStrings";
import { teamHubStrings } from "../teamHubStrings";

export default function ReportProblemButton({ token, lang }: { token: string; lang: TeamHubLang }) {
  const s = teamHubStrings(lang).checklist;
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  async function send() {
    if (!note.trim()) return;
    setSending(true);
    setError("");
    try {
      const res = await fetch(`/api/team-hub/${encodeURIComponent(token)}/issues`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setError(data.error || teamHubStrings(lang).common.somethingWrong);
        return;
      }
      navigator.vibrate?.(15);
      setSent(true);
      setNote("");
      setTimeout(() => {
        setSent(false);
        setOpen(false);
      }, 1500);
    } catch {
      setError(teamHubStrings(lang).common.noSignalSaved);
    } finally {
      setSending(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="min-h-[64px] w-full rounded-2xl border-2 border-red-200 bg-red-50 text-base font-bold text-red-700"
      >
        ⚠️ {s.reportProblem}
      </button>
    );
  }

  return (
    <div className="rounded-2xl border-2 border-red-200 bg-red-50 p-4">
      {sent ? (
        <p className="text-center text-base font-bold text-green-700">✓ {s.problemSent}</p>
      ) : (
        <>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={s.reportProblemPlaceholder}
            rows={3}
            autoFocus
            className="w-full rounded-xl border border-red-200 bg-white p-3 text-lg"
          />
          {error && <p className="mt-2 text-sm font-semibold text-red-700">{error}</p>}
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="min-h-[64px] flex-1 rounded-xl bg-white text-base font-bold text-slate-700"
            >
              {s.cancel}
            </button>
            <button
              type="button"
              onClick={send}
              disabled={sending || !note.trim()}
              className="min-h-[64px] flex-1 rounded-xl bg-red-700 text-base font-bold text-white disabled:opacity-50"
            >
              {s.send}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
