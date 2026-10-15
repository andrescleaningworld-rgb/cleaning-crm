"use client";

// Coverage → "Who's free?": pick one or more days, a start time and how long
// the new job takes; every sub shows 🟢 Free, 🟡 Tight or 🔴 Busy for each
// day from their current cleanings, their crews and the drive between sites
// (lib/availability.ts). The sub's colour is the worst of the days.
//
// The spot is the address typed in "Find closest subcontractors" above, and
// the map's own account positions are sent along, so both boxes measure the
// same way. Changing a day, the time, the length or the address clears the
// results: what shows always matches the picks.

import { useEffect, useRef, useState } from "react";
import { BigButton, ErrorBox, Sheet, showToast } from "@/app/ui";
import PlusMinus from "../components/plus-minus";
import { describeSpan, WEEK_ORDER, type Availability, type DayAvailability, type SubAvailability } from "@/lib/availability";
import { formatClock, parseClock, START_TIME_MAX, START_TIME_MIN, START_TIME_STEP, toClock } from "@/lib/schedule-time";
import { DEFAULT_MINUTES_ON_SITE, formatMinutes, MAX_MINUTES_ON_SITE, MIN_MINUTES_ON_SITE, MINUTES_ON_SITE_STEP } from "@/lib/time-on-site";

type Point = { lat: number; lng: number };

const WEEKDAYS_ONLY = WEEK_ORDER.slice(0, 5);
const LOOK: Record<Availability, { emoji: string; word: string; color: string; background: string }> = {
  free: { emoji: "🟢", word: "Free", color: "#166534", background: "#dcfce7" },
  tight: { emoji: "🟡", word: "Tight", color: "#854d0e", background: "#fef9c3" },
  busy: { emoji: "🔴", word: "Busy", color: "#991b1b", background: "#fee2e2" },
};

function friendlyDay(iso: string): string {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

// What was asked, kept with its answer: the header can only describe these results.
type Asked = { days: string[]; start: number; minutes: number };

export default function WhoIsFree({ point, points }: { point: Point | null; points: Record<string, [number, number]> }) {
  const [days, setDays] = useState<string[]>([]);
  const [start, setStart] = useState(19 * 60);
  const [minutes, setMinutes] = useState(DEFAULT_MINUTES_ON_SITE);
  const [answer, setAnswer] = useState<{ asked: Asked; results: SubAvailability[] } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Any change to the picks or the address: the old results go. A check that
  // comes back after the picks changed is dropped.
  const pickKey = `${days.join(",")}|${start}|${minutes}|${point ? `${point.lat},${point.lng}` : ""}`;
  const latestKey = useRef(pickKey);
  useEffect(() => {
    latestKey.current = pickKey;
    setAnswer(null);
    setError("");
  }, [pickKey]);

  const toggleDay = (day: string) => setDays((chosen) => WEEK_ORDER.filter((d) => (d === day ? !chosen.includes(d) : chosen.includes(d))));

  async function check() {
    if (days.length === 0) return;
    const asked: Asked = { days, start, minutes };
    const askedKey = pickKey;
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/availability", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "check", days, start: toClock(start), minutes, point, points }),
      });
      const data = (await response.json()) as { success?: boolean; results?: SubAvailability[]; error?: string };
      if (!data.success || !data.results) throw new Error(data.error || "Availability did not load.");
      if (askedKey === latestKey.current) setAnswer({ asked, results: data.results });
    } catch (err) {
      if (askedKey === latestKey.current) setError(err instanceof Error ? err.message : "Availability did not load.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="ui-card">
      <p className="ui-label" style={{ fontSize: 20 }}>
        Who&apos;s free?
      </p>

      <p className="ui-label">Days</p>
      <div className="ui-chips" role="group" aria-label="Days of the new job">
        {WEEK_ORDER.map((day) => (
          <button key={day} type="button" className="ui-chip" aria-pressed={days.includes(day)} onClick={() => toggleDay(day)}>
            {day.slice(0, 3)}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap gap-3" style={{ marginTop: 8 }}>
        <button type="button" className="ui-btn ui-btn-second" onClick={() => setDays(WEEKDAYS_ONLY)}>
          Mon–Fri
        </button>
        <button type="button" className="ui-btn ui-btn-second" onClick={() => setDays([])} disabled={days.length === 0}>
          Clear
        </button>
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
        <BigButton busy={loading} busyLabel="Checking…" disabled={days.length === 0} onClick={check}>
          Who&apos;s free?
        </BigButton>
      </div>
      {days.length === 0 ? <p className="ui-muted">Pick at least one day.</p> : null}
      {point ? null : <p className="ui-muted">Type the address in &quot;Find closest subcontractors&quot; above to count the drive.</p>}

      {error ? <ErrorBox title={error} onRetry={check} /> : null}

      {answer ? (
        <>
          <p className="ui-muted" style={{ marginTop: 12 }}>
            {answer.asked.days.map((day) => day.slice(0, 3)).join(", ")} · {describeSpan(answer.asked.start, answer.asked.start + answer.asked.minutes)} · next 4 weeks
          </p>
          <ul className="ui-list-plain" style={{ marginTop: 8, gap: 8 }}>
            {answer.results.map((result) => (
              <ResultCard key={result.subId} result={result} newStart={answer.asked.start} newEnd={answer.asked.start + answer.asked.minutes} />
            ))}
          </ul>
          {answer.results.length === 0 ? <p className="ui-muted">No sub has an active account yet.</p> : null}
        </>
      ) : null}

      <EveningEnds />
    </div>
  );
}

function ResultCard({ result, newStart, newEnd }: { result: SubAvailability; newStart: number; newEnd: number }) {
  const look = LOOK[result.status];
  // The name on the sub's accounts, which "Find closest subcontractors" lists them by.
  const showContact = result.contactName !== "" && result.contactName.toLowerCase() !== result.name.toLowerCase();
  return (
    <li className="ui-card" style={{ borderLeft: `8px solid ${look.color}` }}>
      <div className="flex flex-wrap items-center gap-3">
        <span className="rounded-lg px-3 py-1 text-lg font-black" style={{ color: look.color, background: look.background }}>
          {look.emoji} {look.word.toUpperCase()}
        </span>
        <span className="ui-strong" style={{ fontSize: 18 }}>
          {result.name}
          {showContact ? <span className="ui-muted"> ({result.contactName})</span> : null}
        </span>
        {result.distanceMiles !== null ? <span className="ui-strong ui-nowrap">{result.distanceMiles.toFixed(1)} mi</span> : null}
        {result.crews > 1 ? <span className="ui-muted ui-nowrap">{result.crews} crews</span> : null}
      </div>
      {result.days.map((day) => (
        <DayLine key={day.weekday} day={day} newStart={newStart} newEnd={newEnd} />
      ))}
      {result.unscheduled > 0 ? (
        <p style={{ marginTop: 6, color: "#92400e", fontWeight: 700 }}>
          ⚠ {result.unscheduled} account{result.unscheduled === 1 ? "" : "s"} with no schedule not counted
        </p>
      ) : null}
    </li>
  );
}

// One chosen day: its own colour, then that day's cleanings with the new job in its place.
function DayLine({ day, newStart, newEnd }: { day: DayAvailability; newStart: number; newEnd: number }) {
  const look = LOOK[day.status];
  const partWeeks = day.status === "busy" ? day.busyWeeks : day.status === "tight" ? day.tightWeeks : 0;
  const line = [
    ...day.day.map((cleaning) => ({
      start: cleaning.start,
      text: `${cleaning.exact ? "📌 " : ""}${cleaning.accountName} ${describeSpan(cleaning.start, cleaning.end)}${cleaning.estimated ? " (est.)" : ""}`,
      isNew: false,
    })),
    { start: newStart, text: `new ${describeSpan(newStart, newEnd)}`, isNew: true },
  ].sort((a, b) => a.start - b.start);
  return (
    <p style={{ marginTop: 8 }}>
      <strong style={{ color: look.color }}>
        {day.weekday.slice(0, 3)} {look.emoji} {look.word}
        {partWeeks > 0 && partWeeks < day.weeks ? ` ${partWeeks} of ${day.weeks} weeks` : ""}
      </strong>
      <span className="ui-muted">
        {" "}
        — {friendlyDay(day.dayDate)}:{" "}
        {line.map((item, index) => (
          <span key={index}>
            {index > 0 ? " · " : ""}
            {item.isNew ? <strong>({item.text})</strong> : item.text}
          </span>
        ))}
      </span>
    </p>
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
