"use client";

// The one schedule form, used everywhere a cleaning schedule is set: the
// account page, Add / Edit Account and Sub Center. Big buttons, day chips,
// times from a list (15-minute steps), and a plain-English line that updates
// as you tap. Mistakes are shown in plain words; nothing typed is cleared.
//
// It only edits a plan (lib/schedule-plan.ts). Saving is up to the screen
// (app/components/account-schedule.tsx saveSchedule).

import { useId } from "react";
import {
  describePlan,
  FREQUENCY_CHOICES,
  isByWeekday,
  isMonthly,
  planIsEmpty,
  planNotes,
  planProblems,
  planSlots,
  timeFor,
  visitsNeeded,
  WEEK_DAYS,
  WEEK_POSITIONS,
  type DayTime,
  type MonthlyVisit,
  type SchedulePlan,
} from "@/lib/schedule-plan";
import { formatClock } from "@/lib/schedule-time";
import { formatMinutes, MAX_MINUTES_ON_SITE, MIN_MINUTES_ON_SITE } from "@/lib/time-on-site";

const SHORT_DAY: Record<string, string> = {
  Monday: "Mon",
  Tuesday: "Tue",
  Wednesday: "Wed",
  Thursday: "Thu",
  Friday: "Fri",
  Saturday: "Sat",
  Sunday: "Sun",
};

const PRESETS: { id: string; label: string; days: string[] }[] = [
  { id: "weekdays", label: "Mon–Fri", days: WEEK_DAYS.slice(0, 5) },
  { id: "every", label: "Every day", days: WEEK_DAYS },
  { id: "weekends", label: "Weekends", days: ["Saturday", "Sunday"] },
];

// Times from 5:00 am to 11:45 pm in 15-minute steps; "To" may also be midnight.
const FIRST_TIME = 5 * 60;
const LAST_TIME = 23 * 60 + 45;
const MIDNIGHT = 23 * 60 + 59;
const COMMON_TIMES = [6, 7, 8, 9, 10, 12, 13, 15, 17, 18, 19, 20, 21, 22, 23].map((hour) => hour * 60);
const ALL_TIMES = Array.from({ length: (LAST_TIME - FIRST_TIME) / 15 + 1 }, (_, index) => FIRST_TIME + index * 15);

const sameDays = (a: string[], b: string[]) => a.length === b.length && a.every((day) => b.includes(day));

type Props = {
  value: SchedulePlan;
  onChange: (next: SchedulePlan) => void;
  disabled?: boolean;
  /** Show "Pick at least one day" etc. even before anything is picked (after a save was tried). */
  showProblems?: boolean;
};

export default function ScheduleEditor({ value: plan, onChange, disabled = false, showProblems = false }: Props) {
  const slots = planSlots(plan);
  const problems = planProblems(plan);
  const notes = planNotes(plan);
  const started = !planIsEmpty(plan);

  function setDays(days: string[]) {
    // Picking days means a weekly kind of schedule.
    const frequency = isByWeekday(plan.frequency) ? plan.frequency : "WEEKLY";
    onChange({ ...plan, frequency, days: WEEK_DAYS.filter((day) => days.includes(day)) });
  }

  function toggleDay(day: string) {
    setDays(plan.days.includes(day) ? plan.days.filter((d) => d !== day) : [...plan.days, day]);
  }

  function setFrequency(frequency: SchedulePlan["frequency"]) {
    const visits = [...plan.visits];
    while (visits.length < visitsNeeded(frequency)) visits.push({ position: "", weekday: "" });
    onChange({ ...plan, frequency, visits });
  }

  function setVisit(index: number, visit: MonthlyVisit) {
    const visits = [...plan.visits];
    visits[index] = visit;
    onChange({ ...plan, visits });
  }

  function setTime(key: string, time: DayTime) {
    if (plan.sameTime) onChange({ ...plan, all: time });
    else onChange({ ...plan, perDay: { ...plan.perDay, [key]: time } });
  }

  function setSameTime(sameTime: boolean) {
    if (sameTime) {
      onChange({ ...plan, sameTime });
      return;
    }
    // Each day starts from the shared time; a day typed before keeps its own.
    const perDay = { ...plan.perDay };
    for (const slot of slots) if (!perDay[slot.key]) perDay[slot.key] = { ...plan.all };
    onChange({ ...plan, sameTime, perDay });
  }

  const pickDaysOn = isByWeekday(plan.frequency) && !PRESETS.some((preset) => sameDays(plan.days, preset.days));

  return (
    <fieldset className="ui-sched" disabled={disabled}>
      <legend className="sr-only">Cleaning schedule</legend>

      <div>
        <p className="ui-label">Quick pick</p>
        <div className="ui-sched-choices ui-sched-choices-4">
          {PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              className="ui-sched-choice"
              aria-pressed={isByWeekday(plan.frequency) && sameDays(plan.days, preset.days)}
              onClick={() => setDays(preset.days)}
            >
              {preset.label}
            </button>
          ))}
          <button type="button" className="ui-sched-choice" aria-pressed={pickDaysOn} onClick={() => setDays([])}>
            Pick days
          </button>
        </div>
      </div>

      <div>
        <p className="ui-label">How often?</p>
        <div className="ui-sched-choices">
          {FREQUENCY_CHOICES.map((choice) => (
            <button key={choice.id} type="button" className="ui-sched-choice" aria-pressed={plan.frequency === choice.id} onClick={() => setFrequency(choice.id)}>
              {choice.label}
            </button>
          ))}
        </div>
      </div>

      {plan.frequency === "" || isByWeekday(plan.frequency) ? (
        <div>
          <p className="ui-label">Which days?</p>
          <DayChips label="Days of the week" selected={plan.days} onToggle={toggleDay} />
        </div>
      ) : null}

      {isMonthly(plan.frequency)
        ? Array.from({ length: visitsNeeded(plan.frequency) }, (_, index) => {
            const visit = plan.visits[index] ?? { position: "", weekday: "" };
            const title = visitsNeeded(plan.frequency) === 1 ? "Which week and day?" : `Visit ${index + 1}: which week and day?`;
            return (
              <div key={index} className="ui-sched-box">
                <p className="ui-label">{title}</p>
                <div className="ui-chips" role="group" aria-label={`${title} Week`}>
                  {WEEK_POSITIONS.map((position) => (
                    <button
                      key={position}
                      type="button"
                      className="ui-chip ui-sched-chip"
                      aria-pressed={visit.position === position}
                      onClick={() => setVisit(index, { ...visit, position })}
                    >
                      {position}
                    </button>
                  ))}
                </div>
                <div style={{ marginTop: 8 }}>
                  <DayChips label={`${title} Day`} selected={visit.weekday ? [visit.weekday] : []} onToggle={(day) => setVisit(index, { ...visit, weekday: day })} />
                </div>
              </div>
            );
          })
        : null}

      {plan.frequency === "AS_NEEDED" ? <p className="ui-hint">No set days. Each cleaning is added when it comes up.</p> : null}

      {plan.frequency !== "AS_NEEDED" && slots.length > 1 ? (
        <label className="ui-check ui-sched-same">
          <input type="checkbox" checked={plan.sameTime} onChange={(event) => setSameTime(event.target.checked)} />
          <span>Same time every day</span>
        </label>
      ) : null}

      {plan.frequency !== "AS_NEEDED" ? (
        plan.sameTime || slots.length <= 1 ? (
          <TimeBlock title={slots.length > 1 ? "Time for every day" : "Time"} time={timeFor(plan, slots[0]?.key ?? "")} onChange={(time) => setTime(slots[0]?.key ?? "", time)} />
        ) : (
          slots.map((slot) => <TimeBlock key={slot.key} title={slot.label} time={timeFor(plan, slot.key)} onChange={(time) => setTime(slot.key, time)} />)
        )
      ) : null}

      <p className="ui-sched-summary" aria-live="polite">
        <span aria-hidden="true">📅 </span>
        {describePlan(plan)}
      </p>

      {(started || showProblems) && problems.length > 0 ? (
        <ul className="ui-sched-problems" role="alert">
          {problems.map((problem) => (
            <li key={problem}>⚠ {problem}</li>
          ))}
        </ul>
      ) : null}
      {notes.length > 0 ? (
        <ul className="ui-sched-notes">
          {notes.map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ul>
      ) : null}
    </fieldset>
  );
}

function DayChips({ label, selected, onToggle }: { label: string; selected: string[]; onToggle: (day: string) => void }) {
  return (
    <div className="ui-chips ui-sched-days" role="group" aria-label={label}>
      {WEEK_DAYS.map((day) => (
        <button key={day} type="button" className="ui-chip ui-sched-chip" aria-pressed={selected.includes(day)} aria-label={day} onClick={() => onToggle(day)}>
          {SHORT_DAY[day]}
        </button>
      ))}
    </div>
  );
}

// One day's time: "Anytime between…" or "At exactly…", then the time on site.
function TimeBlock({ title, time, onChange }: { title: string; time: DayTime; onChange: (time: DayTime) => void }) {
  function setKind(kind: DayTime["kind"]) {
    if (kind === time.kind) return;
    // Going back to "between": keep the end when it still fits, else 4 hours later.
    const end = time.end > time.start ? time.end : Math.min(MIDNIGHT, time.start + 4 * 60);
    onChange({ ...time, kind, end });
  }

  return (
    <div className="ui-sched-box">
      <p className="ui-label">{title}</p>
      <div className="ui-sched-choices ui-sched-choices-2">
        <button type="button" className="ui-sched-choice" aria-pressed={time.kind === "between"} onClick={() => setKind("between")}>
          Anytime between…
        </button>
        <button type="button" className="ui-sched-choice" aria-pressed={time.kind === "exact"} onClick={() => setKind("exact")}>
          At exactly…
        </button>
      </div>

      <div className="ui-sched-row">
        {time.kind === "between" ? (
          <>
            <TimeSelect label="From" value={time.start} onChange={(start) => onChange({ ...time, start })} />
            <TimeSelect label="To" value={time.end} withMidnight onChange={(end) => onChange({ ...time, end })} />
          </>
        ) : (
          <TimeSelect label="Starts at" value={time.start} onChange={(start) => onChange({ ...time, start })} />
        )}
      </div>

      <TimeOnSite minutes={time.minutes} onChange={(minutes) => onChange({ ...time, minutes })} />
    </div>
  );
}

function TimeSelect({ label, value, onChange, withMidnight = false }: { label: string; value: number; onChange: (minutes: number) => void; withMidnight?: boolean }) {
  const id = useId();
  const listed = ALL_TIMES.includes(value) || (withMidnight && value === MIDNIGHT);
  return (
    <div className="ui-field">
      <label className="ui-label" htmlFor={id}>
        {label}
      </label>
      <select id={id} className="ui-input ui-sched-select" value={String(value)} onChange={(event) => onChange(Number(event.target.value))}>
        {/* A saved time that is not on the list stays as its own choice. */}
        {!listed ? <option value={String(value)}>{formatClock(value)}</option> : null}
        <optgroup label="Common times">
          {COMMON_TIMES.map((minutes) => (
            <option key={`c${minutes}`} value={String(minutes)}>
              {formatClock(minutes)}
            </option>
          ))}
        </optgroup>
        <optgroup label="Every 15 minutes">
          {ALL_TIMES.filter((minutes) => !COMMON_TIMES.includes(minutes)).map((minutes) => (
            <option key={minutes} value={String(minutes)}>
              {formatClock(minutes)}
            </option>
          ))}
          {withMidnight ? <option value={String(MIDNIGHT)}>Midnight</option> : null}
        </optgroup>
      </select>
    </div>
  );
}

// Hours and minutes. "Not sure" leaves it empty.
function TimeOnSite({ minutes, onChange }: { minutes: number | null; onChange: (minutes: number | null) => void }) {
  const hoursId = useId();
  const minutesId = useId();
  const hours = minutes === null ? "" : String(Math.floor(minutes / 60));
  const rest = minutes === null ? 0 : minutes % 60;

  function set(nextHours: string, nextRest: number) {
    if (nextHours === "") {
      onChange(null);
      return;
    }
    const total = Number(nextHours) * 60 + nextRest;
    onChange(total === 0 ? null : Math.min(MAX_MINUTES_ON_SITE, Math.max(MIN_MINUTES_ON_SITE, total)));
  }

  return (
    <div style={{ marginTop: 12 }}>
      <p className="ui-label">Time on site</p>
      <div className="ui-sched-row">
        <div className="ui-field">
          <label className="ui-hint" htmlFor={hoursId}>
            Hours
          </label>
          <select id={hoursId} className="ui-input ui-sched-select" value={hours} onChange={(event) => set(event.target.value, event.target.value === "" ? 0 : rest)}>
            <option value="">Not sure</option>
            {Array.from({ length: 13 }, (_, hour) => (
              <option key={hour} value={String(hour)}>
                {hour}h
              </option>
            ))}
          </select>
        </div>
        <div className="ui-field">
          <label className="ui-hint" htmlFor={minutesId}>
            Minutes
          </label>
          <select id={minutesId} className="ui-input ui-sched-select" value={String(rest)} disabled={hours === ""} onChange={(event) => set(hours || "0", Number(event.target.value))}>
            {[0, 15, 30, 45].map((value) => (
              <option key={value} value={String(value)}>
                {value}m
              </option>
            ))}
          </select>
        </div>
      </div>
      {minutes !== null ? <p className="ui-hint">About {formatMinutes(minutes)} each visit.</p> : null}
    </div>
  );
}
