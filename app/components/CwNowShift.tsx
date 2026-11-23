"use client";

// An account's CW Now shift: when it starts and ends, and "text the crew at
// shift start". The days come from the cleaning schedule.

import { useEffect, useState } from "react";
import { BigButton, Field, showToast } from "@/app/ui";
import type { CrewShift } from "@/lib/crewShifts";

export default function CwNowShift({ accountId }: { accountId: string }) {
  const [ready, setReady] = useState<boolean | null>(null);
  const [textsOn, setTextsOn] = useState(false);
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [textOn, setTextOn] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    fetch(`/api/crew-link/shift?accountId=${encodeURIComponent(accountId)}`, { cache: "no-store" })
      .then((response) => response.json())
      .then((data: { success?: boolean; ready?: boolean; textsOn?: boolean; shift?: CrewShift | null }) => {
        if (!alive || data.success !== true) return;
        setReady(data.ready === true);
        setTextsOn(data.textsOn === true);
        setStartTime(data.shift?.startTime ?? "");
        setEndTime(data.shift?.endTime ?? "");
        setTextOn(data.shift?.textOn === true);
      })
      .catch(() => alive && setError("The shift did not load."));
    return () => {
      alive = false;
    };
  }, [accountId]);

  async function save() {
    setError("");
    if (!startTime || !endTime) return setError("Pick the start and end time.");
    setBusy(true);
    try {
      const response = await fetch("/api/crew-link/shift", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "saveShift", accountId, startTime, endTime, textOn }) });
      const data = (await response.json().catch(() => ({}))) as { success?: boolean; error?: string };
      if (!response.ok || !data.success) throw new Error(data.error || "That did not save.");
      showToast("Shift saved ✓");
    } catch (err) {
      setError(err instanceof Error ? err.message : "That did not save.");
    } finally {
      setBusy(false);
    }
  }

  if (ready === false) return <p className="rounded-xl bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-900">Shift times turn on after database update 090.</p>;

  return (
    <div className="space-y-3 rounded-2xl border-2 border-slate-200 bg-white p-4" data-cw-shift>
      <p className="text-lg font-black text-slate-900">⏰ Shift time</p>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Starts" type="time" value={startTime} onChange={(event) => setStartTime(event.target.value)} />
        <Field label="Ends" type="time" value={endTime} onChange={(event) => setEndTime(event.target.value)} />
      </div>
      <p className="text-sm text-slate-500">Days come from the cleaning schedule.</p>
      <label className="flex min-h-[48px] items-center gap-3 text-lg font-bold text-slate-900">
        <input type="checkbox" checked={textOn} onChange={(event) => setTextOn(event.target.checked)} className="h-6 w-6" />
        Text the crew at shift start
      </label>
      {textOn && !textsOn ? <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-900">Saved, but crew texts are off for now. The owner turns them on.</p> : null}
      {error ? <p className="ui-field-error" role="alert">{error}</p> : null}
      <BigButton kind="second" busy={busy} busyLabel="Saving…" onClick={() => void save()}>Save shift</BigButton>
    </div>
  );
}
