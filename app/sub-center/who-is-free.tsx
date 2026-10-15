"use client";

// Coverage → "Who's free?": pick a day, a start time and how long the new
// job takes; every sub shows 🟢 Free, 🟡 Tight or 🔴 Busy from their current
// cleanings, their crews and the drive between sites (lib/availability.ts).
// The spot picked in "Find closest subcontractors" above is the new job's
// place; without one, travel to it counts as 15 minutes.

import { useEffect, useState } from "react";
import { BigButton, ErrorBox, Sheet, showToast } from "@/app/ui";
import PlusMinus from "../components/plus-minus";
import { describeSpan, type Availability, type SubAvailability } from "@/lib/availability";
import { formatClock, parseClock, START_TIME_MAX, START_TIME_MIN, START_TIME_STEP, toClock } from "@/lib/schedule-time";
import { DEFAULT_MINUTES_ON_SITE, formatMinutes, MAX_MINUTES_ON_SITE, MIN_MINUTES_ON_SITE, MINUTES_ON_SITE_STEP } from "@/lib/time-on-site";

const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const LOOK: Record<Availability, { label: string; color: string; background: string }> = {
  free: { label: "🟢 FREE", color: "#166534", background: "#dcfce7" },
  tight: { label: "🟡 TIGHT", color: "#854d0e", background: "#fef9c3" },
  busy: { label: "🔴 BUSY", color: "#991b1b", background: "#fee2e2" },
};

function friendlyDay(iso: string): string {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

export default function WhoIsFree({ point }: { point: { lat: number; lng: number } | null }) {
  const [weekday, setWeekday] = useState("Tuesday");
  const [start, setStart] = useState(19 * 60);
  const [minutes, setMinutes] = useState(DEFAULT_MINUTES_ON_SITE);
  const [results, setResults] = useState<SubAvailability[] | null>(null);
  const [asked, setAsked] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function check() {
    setLoading(true);
    setError("");
    try {
      const query = new URLSearchParams({ weekday, start: toClock(start), minutes: String(minutes) });
      if (point) {
        query.set("lat", String(point.lat));
        query.set("lng", String(point.lng));
      }
      const response = await fetch(`/api/availability?${query}`, { cache: "no-store" });
      const data = (await response.json()) as { success?: boolean; results?: SubAvailability[]; error?: string };
      if (!data.success || !data.results) throw new Error(data.error || "Availability did not load.");
      setResults(data.results);
      setAsked(`${weekday} ${describeSpan(start, start + minutes)}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Availability did not load.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="ui-card">
      <p className="ui-label" style={{ fontSize: 20 }}>
        Who&apos;s free?
      </p>

      <p className="ui-label">Day</p>
      <div className="ui-chips" role="group" aria-label="Day of the new job">
        {WEEKDAYS.map((day) => (
          <button key={day} type="button" className="ui-chip" aria-pressed={weekday === day} onClick={() => setWeekday(day)}>
            {day.slice(0, 3)}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-x-8 gap-y-3" style={{ marginTop: 12 }}>
        <div>
          <p className="ui-label">Time</p>
          <PlusMinus value={start} onChange={setStart} step={START_TIME_STEP} min={START_TIME_MIN} max={START_TIME_MAX} label="Start time of the new job" format={formatClock} />
        </div>
        <div>
          <p className="ui-label">Length</p>
          <PlusMinus value={minutes} onChange={setMinutes} step={MINUTES_ON_SITE_STEP} min={MIN_MINUTES_ON_SITE} max={MAX_MINUTES_ON_SITE} label="Length of the new job" format={formatMinutes} />
        </div>
      </div>

      <div style={{ marginTop: 14 }}>
        <BigButton busy={loading} busyLabel="Checking…" onClick={check}>
          Who&apos;s free?
        </BigButton>
      </div>
      {point ? null : <p className="ui-muted">Pick the spot above to count the drive.</p>}

      {error ? <ErrorBox title={error} onRetry={check} /> : null}

      {results ? (
        <>
          <p className="ui-muted" style={{ marginTop: 12 }}>
            {asked} · next 4 weeks
          </p>
          <ul className="ui-list-plain" style={{ marginTop: 8, gap: 8 }}>
            {results.map((result) => (
              <ResultCard key={result.subId} result={result} newStart={start} newEnd={start + minutes} />
            ))}
          </ul>
          {results.length === 0 ? <p className="ui-muted">No sub has an active account yet.</p> : null}
        </>
      ) : null}

      <EveningEnds />
    </div>
  );
}

function ResultCard({ result, newStart, newEnd }: { result: SubAvailability; newStart: number; newEnd: number }) {
  const look = LOOK[result.status];
  const partWeeks = result.status === "busy" ? result.busyWeeks : result.status === "tight" ? result.tightWeeks : 0;
  // The day with the new job in its place, in time order.
  const line = [
    ...result.day.map((cleaning) => ({
      start: cleaning.start,
      text: `${cleaning.exact ? "📌 " : ""}${cleaning.accountName} ${describeSpan(cleaning.start, cleaning.end)}${cleaning.estimated ? " (est.)" : ""}`,
      isNew: false,
    })),
    { start: newStart, text: `new ${describeSpan(newStart, newEnd)}`, isNew: true },
  ].sort((a, b) => a.start - b.start);

  return (
    <li className="ui-card" style={{ borderLeft: `8px solid ${look.color}` }}>
      <div className="flex flex-wrap items-center gap-3">
        <span className="rounded-lg px-3 py-1 text-lg font-black" style={{ color: look.color, background: look.background }}>
          {look.label}
        </span>
        <span className="ui-strong" style={{ fontSize: 18 }}>
          {result.name}
        </span>
        {result.distanceMiles !== null ? <span className="ui-strong ui-nowrap">{result.distanceMiles.toFixed(1)} mi</span> : null}
        {result.crews > 1 ? <span className="ui-muted ui-nowrap">{result.crews} crews</span> : null}
      </div>
      {partWeeks > 0 && partWeeks < result.weeks ? (
        <p className="ui-strong" style={{ marginTop: 6 }}>
          {result.status === "busy" ? "Busy" : "Tight"} {partWeeks} of {result.weeks} weeks
        </p>
      ) : null}
      <p className="ui-muted" style={{ marginTop: 6 }}>
        {friendlyDay(result.dayDate)}:{" "}
        {line.map((item, index) => (
          <span key={index}>
            {index > 0 ? " · " : ""}
            {item.isNew ? <strong>({item.text})</strong> : item.text}
          </span>
        ))}
      </p>
      {result.unscheduled > 0 ? (
        <p style={{ marginTop: 6, color: "#92400e", fontWeight: 700 }}>
          ⚠ {result.unscheduled} account{result.unscheduled === 1 ? "" : "s"} with no schedule not counted
        </p>
      ) : null}
    </li>
  );
}

// The office setting: when "Evening" ends (11:00 pm unless changed).
function EveningEnds() {
  const [ends, setEnds] = useState<number | null>(null);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(23 * 60);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let alive = true;
    fetch("/api/availability?settings=1", { cache: "no-store" })
      .then((response) => response.json())
      .then((data: { eveningEnds?: string }) => {
        if (alive) setEnds(parseClock(data.eveningEnds));
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  if (ends === null) return null;

  async function save() {
    setSaving(true);
    try {
      const response = await fetch("/api/availability", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "eveningEnds", time: toClock(draft) }),
      });
      const data = (await response.json()) as { success?: boolean; eveningEnds?: string; error?: string };
      if (!data.success) throw new Error(data.error || "Not saved.");
      setEnds(parseClock(data.eveningEnds) ?? draft);
      setOpen(false);
      showToast(`Evening ends at ${formatClock(parseClock(data.eveningEnds) ?? draft)} ✓`);
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Not saved.", "bad");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="ui-muted" style={{ marginTop: 14 }}>
      Evening ends at {formatClock(ends)} ·{" "}
      <button
        type="button"
        className="font-bold underline"
        onClick={() => {
          setDraft(ends);
          setOpen(true);
        }}
      >
        Change
      </button>
      <Sheet
        open={open}
        title="Evening ends at"
        text="The latest an Evening cleaning can finish."
        onClose={() => {
          if (!saving) setOpen(false);
        }}
        busy={saving}
        actions={
          <BigButton busy={saving} busyLabel="Saving…" onClick={save}>
            Save
          </BigButton>
        }
      >
        <div className="flex justify-center py-2">
          <PlusMinus value={draft} onChange={setDraft} step={30} min={19 * 60} max={23 * 60 + 30} label="Evening ends at" format={formatClock} disabled={saving} />
        </div>
      </Sheet>
    </div>
  );
}
