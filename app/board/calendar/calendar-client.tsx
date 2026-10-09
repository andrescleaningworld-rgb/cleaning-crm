"use client";

// The Cleaning calendar: which accounts are cleaned on which day, by which
// sub, and whether it happened. Green = cleaned, gray = scheduled (or, in
// the past, not confirmed), red = missed, blue = extra job.

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { BigButton, Counts, EmptyState, ErrorBox, MOTTO, Screen, SelectField, Sheet, SkeletonList, Tabs, showToast } from "@/app/ui";
import {
  PROOF_LABEL,
  STATUS_LABEL,
  addDays,
  countCleanings,
  dateToDay,
  dayToDate,
  mondayOf,
  officeDay,
  type CalendarData,
  type Cleaning,
} from "@/lib/cleanings";
import { BOARD_TABS, useBoardTabs } from "../board-client";
import boardStyles from "../board.module.css";
import styles from "./calendar.module.css";

type View = "today" | "week" | "month";
type State = "loading" | "off" | "failed" | "ready";

const VIEWS: { value: View; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "week", label: "Week" },
  { value: "month", label: "Month" },
];

const longDay = (day: string) => dayToDate(day).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
const shortDay = (day: string) => dayToDate(day).toLocaleDateString("en-US", { month: "short", day: "numeric" });
const weekdayName = (day: string) => dayToDate(day).toLocaleDateString("en-US", { weekday: "short" });

/** The days a view shows, from the day it is looking at. */
function rangeFor(view: View, day: string): { from: string; to: string } {
  if (view === "today") return { from: day, to: day };
  if (view === "week") {
    const monday = mondayOf(day);
    return { from: monday, to: addDays(monday, 6) };
  }
  const date = dayToDate(day);
  return { from: dateToDay(new Date(date.getFullYear(), date.getMonth(), 1, 12)), to: dateToDay(new Date(date.getFullYear(), date.getMonth() + 1, 0, 12)) };
}

function step(view: View, day: string, direction: 1 | -1): string {
  if (view === "today") return addDays(day, direction);
  if (view === "week") return addDays(day, 7 * direction);
  const date = dayToDate(day);
  return dateToDay(new Date(date.getFullYear(), date.getMonth() + direction, 1, 12));
}

async function postCalendar(body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const response = await fetch("/api/board/calendar", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok || data.success !== true) throw new Error(typeof data.error === "string" ? data.error : "That did not save. Try again.");
  return data;
}

export default function CalendarClient() {
  const [state, setState] = useState<State>("loading");
  const [data, setData] = useState<CalendarData | null>(null);
  const [view, setView] = useState<View>("week");
  const [day, setDay] = useState(() => officeDay());
  const [manager, setManager] = useState("");
  const [sub, setSub] = useState("");
  const [openKey, setOpenKey] = useState("");
  const [busy, setBusy] = useState(false);
  const changeTab = useBoardTabs("calendar");
  const range = useMemo(() => rangeFor(view, day), [view, day]);

  const load = useCallback(async () => {
    try {
      const response = await fetch(`/api/board/calendar?from=${range.from}&to=${range.to}`, { cache: "no-store" });
      const body = (await response.json()) as { success?: boolean; ready?: boolean } & Partial<CalendarData>;
      if (!response.ok || body.success !== true) throw new Error("failed");
      if (body.ready !== true) return setState("off");
      setData({ today: body.today ?? officeDay(), from: body.from ?? range.from, to: body.to ?? range.to, cleanings: body.cleanings ?? [], managers: body.managers ?? [], subs: body.subs ?? [] });
      setState("ready");
    } catch {
      setState("failed");
    }
  }, [range]);

  useEffect(() => {
    void load();
  }, [load]);

  const today = data?.today ?? officeDay();
  // The cleanings on screen belong to the days in the title (not to the view that was open a moment ago).
  const fresh = data !== null && data.from === range.from;
  const shown = useMemo(
    () => (fresh ? (data?.cleanings ?? []) : []).filter((cleaning) => (!manager || cleaning.manager === manager) && (!sub || cleaning.sub === sub)),
    [data, fresh, manager, sub]
  );
  const counts = countCleanings(shown);
  const keyOf = (cleaning: Cleaning) => `${cleaning.accountId}|${cleaning.day}|${cleaning.paperId}`;
  const open = shown.find((cleaning) => keyOf(cleaning) === openKey) ?? null;
  const byDay = useMemo(() => {
    const map = new Map<string, Cleaning[]>();
    for (const cleaning of shown) map.set(cleaning.day, [...(map.get(cleaning.day) ?? []), cleaning]);
    return map;
  }, [shown]);

  async function act(body: Record<string, unknown>, message: string) {
    setBusy(true);
    try {
      const result = await postCalendar(body);
      await load();
      showToast(body.action === "pinMissed" && result.pinned === false ? "It is already on the board." : message);
    } catch (error) {
      showToast(error instanceof Error ? error.message : "That did not save. Try again.", "bad");
    } finally {
      setBusy(false);
    }
  }

  const mark = (cleaning: Cleaning, value: "cleaned" | "missed" | "") =>
    act({ action: "mark", accountId: cleaning.accountId, day: cleaning.day, mark: value }, value === "cleaned" ? "Marked cleaned." : value === "missed" ? "Marked missed." : "Your answer is taken back.");
  const pin = (cleaning: Cleaning) => act({ action: "pinMissed", accountId: cleaning.accountId, day: cleaning.day }, "Pinned to the board.");

  function card(cleaning: Cleaning) {
    const canMark = cleaning.status !== "extra" && cleaning.day <= today && Boolean(cleaning.accountId);
    return (
      <li key={keyOf(cleaning)} className={`${styles.item} ${styles[cleaning.status]}`}>
        {cleaning.accountId ? (
          <Link className={styles.name} href={`/accounts/${encodeURIComponent(cleaning.accountId)}`}>
            {cleaning.accountName}
          </Link>
        ) : (
          <span className={styles.name}>{cleaning.accountName}</span>
        )}
        <span className={styles.sub}>{cleaning.sub || "No sub on the schedule"}</span>
        <span className={styles.foot}>
          <span className={styles.status}>
            {STATUS_LABEL[cleaning.status]}
            {cleaning.unscheduled && cleaning.status === "cleaned" ? " (not on the schedule)" : ""}
          </span>
          {canMark || cleaning.status === "missed" ? (
            <span className={styles.itemButtons}>
            {cleaning.status === "missed" ? (
              cleaning.pinned ? (
                <span className={styles.onBoard}>On the board</span>
              ) : (
                <button type="button" className={`ui-btn ui-btn-main ${styles.small}`} disabled={busy} onClick={() => void pin(cleaning)}>
                  Pin to board
                </button>
              )
            ) : null}
            {canMark ? (
              <button type="button" className={`ui-btn ui-btn-second ${styles.small}`} onClick={() => setOpenKey(keyOf(cleaning))}>
                Mark
              </button>
            ) : null}
            </span>
          ) : null}
        </span>
      </li>
    );
  }

  const title =
    view === "today"
      ? longDay(day)
      : view === "week"
        ? `${shortDay(range.from)} to ${shortDay(addDays(range.from, 5))}`
        : dayToDate(day).toLocaleDateString("en-US", { month: "long", year: "numeric" });
  const countsLabel = view === "today" ? (day === today ? "today" : "that day") : view === "week" ? "this week" : "this month";

  // Week: Monday to Saturday. Sunday only shows when something is on it.
  const weekDays = Array.from({ length: 7 }, (_, index) => addDays(range.from, index)).filter((d, index) => index < 6 || (byDay.get(d)?.length ?? 0) > 0);
  // Month: whole weeks, Monday first, with the days outside the month left blank.
  const monthCells = useMemo(() => {
    if (view !== "month") return [];
    const first = mondayOf(range.from);
    const cells: string[] = [];
    for (let d = first; d <= range.to || cells.length % 7 !== 0; d = addDays(d, 1)) cells.push(d);
    return cells;
  }, [view, range]);

  return (
    <Screen title="Cleaning calendar">
      <p className={boardStyles.motto}>{MOTTO.en}</p>
      <Tabs tabs={BOARD_TABS} value="calendar" onChange={changeTab} label="Pin Board views" />

      {state === "off" ? (
        <EmptyState title="Not turned on here yet" text="The Pin Board works once it is switched on and this database has its tables." />
      ) : state === "failed" ? (
        <ErrorBox title="The calendar did not load." onRetry={() => void load()} />
      ) : (
        <>
          <Tabs tabs={VIEWS} value={view} onChange={setView} label="Calendar view" />

          <div className={styles.nav}>
            <BigButton kind="second" onClick={() => setDay(step(view, day, -1))}>
              Earlier
            </BigButton>
            <h2 className={styles.title}>{title}</h2>
            <BigButton kind="second" onClick={() => setDay(step(view, day, 1))}>
              Later
            </BigButton>
          </div>
          {rangeFor(view, today).from !== range.from ? (
            <div>
              <BigButton kind="quiet" onClick={() => setDay(today)}>
                Back to today
              </BigButton>
            </div>
          ) : null}

          <Counts
            label={`Cleanings ${countsLabel}`}
            items={[
              { label: `Total ${countsLabel}`, value: counts.total, tone: "info" },
              { label: "Done", value: counts.done, tone: "good" },
              { label: "Missed", value: counts.missed, tone: counts.missed > 0 ? "bad" : "off" },
            ]}
          />

          <div className={styles.filters}>
            <SelectField label="Manager" value={manager} onChange={(event) => setManager(event.target.value)}>
              <option value="">All managers</option>
              {(data?.managers ?? []).map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </SelectField>
            <SelectField label="Sub" value={sub} onChange={(event) => setSub(event.target.value)}>
              <option value="">All subs</option>
              {(data?.subs ?? []).map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </SelectField>
          </div>

          <p className={styles.legend}>
            <span className={`${styles.swatch} ${styles.cleaned}`} /> Cleaned
            <span className={`${styles.swatch} ${styles.scheduled}`} /> Scheduled or not confirmed
            <span className={`${styles.swatch} ${styles.missed}`} /> Missed
            <span className={`${styles.swatch} ${styles.extra}`} /> Extra job
          </p>

          {state === "loading" || !data || !fresh ? (
            <SkeletonList rows={3} />
          ) : view === "today" ? (
            shown.length === 0 ? (
              <EmptyState title="No cleanings on this day" text="Nothing is on the schedule for the filters you picked." icon="check" />
            ) : (
              <ul className={`${styles.list} ${styles.todayList}`}>{shown.map(card)}</ul>
            )
          ) : view === "week" ? (
            <div className={styles.week}>
              {weekDays.map((d) => (
                <section key={d} className={`${styles.column} ${d === today ? styles.columnToday : ""}`} aria-label={longDay(d)}>
                  <h3 className={styles.columnHead}>
                    {weekdayName(d)} <span>{shortDay(d)}</span>
                    {d === today ? <span className={styles.todayTag}>Today</span> : null}
                  </h3>
                  {(byDay.get(d)?.length ?? 0) === 0 ? <p className="ui-muted">Nothing</p> : <ul className={styles.list}>{byDay.get(d)!.map(card)}</ul>}
                </section>
              ))}
            </div>
          ) : (
            <div className={styles.month}>
              {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((name) => (
                <span key={name} className={styles.monthHead}>
                  {name}
                </span>
              ))}
              {monthCells.map((d) => {
                const list = byDay.get(d) ?? [];
                const inMonth = d >= range.from && d <= range.to;
                const c = countCleanings(list);
                if (!inMonth) return <span key={d} className={styles.monthBlank} />;
                return (
                  <button
                    key={d}
                    type="button"
                    className={`${styles.monthCell} ${d === today ? styles.monthToday : ""}`}
                    onClick={() => {
                      setDay(d);
                      setView("today");
                    }}
                    aria-label={`${longDay(d)}: ${c.total} cleanings, ${c.done} done, ${c.missed} missed`}
                  >
                    <span className={styles.monthDay}>{dayToDate(d).getDate()}</span>
                    {c.total > 0 ? <span className={styles.monthTotal}>{c.total}</span> : null}
                    <span className={styles.monthDots}>
                      {c.done > 0 ? <span className={`${styles.dot} ${styles.cleaned}`}>{c.done}</span> : null}
                      {c.missed > 0 ? <span className={`${styles.dot} ${styles.missed}`}>{c.missed}</span> : null}
                      {list.some((cleaning) => cleaning.status === "extra") ? <span className={`${styles.dot} ${styles.extra}`}>{list.filter((cleaning) => cleaning.status === "extra").length}</span> : null}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* One cleaning: was it done? */}
      <Sheet open={Boolean(open)} title={open ? open.accountName : ""} text={open ? longDay(open.day) : ""} onClose={() => setOpenKey("")} closeLabel="Close" busy={busy}>
        {open ? (
          <div className="ui-stack">
            <p className={boardStyles.sheetLine}>
              <strong>{STATUS_LABEL[open.status]}</strong>
              {open.proof ? `. ${PROOF_LABEL[open.proof]}.` : "."}
            </p>
            <p className="ui-muted">
              {open.sub ? `Sub: ${open.sub}. ` : ""}
              {open.manager ? `Manager: ${open.manager}. ` : ""}
              {open.visited ? "A manager visited that day." : ""}
            </p>
            <div className={boardStyles.sheetButtons}>
              <BigButton disabled={busy || (open.status === "cleaned" && open.proof === "marked")} onClick={() => void mark(open, "cleaned")}>
                Cleaned
              </BigButton>
              <BigButton kind="danger" disabled={busy || (open.status === "missed" && open.proof === "marked")} onClick={() => void mark(open, "missed")}>
                Missed
              </BigButton>
              {open.proof === "marked" ? (
                <BigButton kind="second" disabled={busy} onClick={() => void mark(open, "")}>
                  Take my answer back
                </BigButton>
              ) : null}
            </div>
            {open.status === "missed" && !open.pinned ? (
              <BigButton kind="second" disabled={busy} onClick={() => void pin(open)}>
                Pin to board
              </BigButton>
            ) : null}
            <BigButton kind="second" href={`/accounts/${encodeURIComponent(open.accountId)}`}>
              Open account
            </BigButton>
          </div>
        ) : null}
      </Sheet>
    </Screen>
  );
}
