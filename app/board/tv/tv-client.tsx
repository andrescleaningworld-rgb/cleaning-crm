"use client";

// Office TV mode: ONE fixed screen, the size of the TV, that never scrolls.
//
//   top strip      logo, the three counts, the clock and date
//   left (70%)     the pin board: only the squares that have notes
//   right (30%)    today's cleanings, with a progress bar
//   bottom strip   the company rule, in green, always there
//
// A square (or the cleanings list) shows as many rows as fit. When there are
// more, it shows "+N more" and turns to the next rows every 8 seconds, so
// nothing is ever cut off. Late and stuck notes are red and come first.
//
// Everything is sized from the real height of the screen (--u = 1% of it),
// measured here, so it also fits a TV browser whose toolbar takes part of the
// screen and one too old for newer CSS units. Nothing needs a click.
//
// Full screen (no browser tabs or address bar) starts with the click on the
// board's "TV Mode (Full Screen)" button. When it is not on (Esc was pressed,
// or the TV opened its own link), moving the mouse shows one big "Full
// screen" button; a browser that cannot do it gets a small "Press F11" hint,
// once. The mouse pointer, that button and "Exit TV mode" (for staff who came
// from the board) all go away after a few seconds without the mouse moving.
// The page asks for fresh data every minute and keeps the last board when a
// refresh fails ("Reconnecting…" in the top strip).

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { SHARED_SQUARES, daysLabel, daysPinned, dueLabel, isOld, isOverdue, paperLabel, papersIn, type BoardManager, type BoardSettings, type Paper } from "@/lib/board";
import { STATUS_LABEL, type CleaningStatus } from "@/lib/cleanings";
import { MOTTO } from "@/app/ui/words";
import { FULL_SCREEN_EVENTS, enterFullScreen, exitFullScreen, fillsTheScreen, fullScreenSupported } from "../full-screen";
import styles from "./tv.module.css";

type TvCleaning = { accountName: string; sub: string; status: CleaningStatus };
type ListedCleaning = TvCleaning & { key: string };
type TvData = {
  today: string;
  settings: BoardSettings;
  managers: BoardManager[];
  papers: Paper[];
  counters: { pinned: number; stuck: number; doneToday: number };
  cleanings: TvCleaning[];
};

const REFRESH_MS = 60_000;
const ROTATE_MS = 8_000;
const SHIFT_MS = 10 * 60_000;
/** The mouse pointer and the buttons go away after this long without the mouse moving. */
const IDLE_MS = 4_000;
const HINT_MS = 12_000;
const HINT_KEY = "cwTvF11Hint";
/** Where the whole picture sits, in pixels; it moves to the next one every 10 minutes so nothing burns into the TV. */
const SHIFTS: [number, number][] = [
  [0, 0],
  [4, 2],
  [-3, 4],
  [3, -3],
  [-4, -2],
];

/** Row heights, in hundredths of the screen height (they match tv.module.css). */
const NOTE_ROW = 7.6;
const CLEANING_ROW = 7.2;
const ROW_GAP = 0.8;

/**
 * Shows as many rows as fit in the space it has. When there are more, the
 * last row says "+N more" and the rows turn over on every tick.
 */
function Fitting<T>({ items, unit, row, tick, keyOf, render }: { items: T[]; unit: number; row: number; tick: number; keyOf: (item: T) => string; render: (item: T) => ReactNode }) {
  const box = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(0);

  useLayoutEffect(() => {
    const measure = () => setHeight(box.current?.clientHeight ?? 0);
    measure();
    window.addEventListener("resize", measure);
    const observer = typeof ResizeObserver === "undefined" || !box.current ? null : new ResizeObserver(measure);
    if (observer && box.current) observer.observe(box.current);
    return () => {
      window.removeEventListener("resize", measure);
      observer?.disconnect();
    };
  }, [unit]);

  const rowPx = row * unit;
  const gapPx = ROW_GAP * unit;
  const capacity = rowPx > 0 ? Math.max(1, Math.floor((height + gapPx) / (rowPx + gapPx))) : 1;
  let shown = items;
  let more = 0;
  if (items.length > capacity) {
    // One row is kept for "+N more" (when there is room for more than one row at all).
    const perPage = Math.max(1, capacity - 1);
    const pages = Math.ceil(items.length / perPage);
    const start = (tick % pages) * perPage;
    shown = items.slice(start, start + perPage);
    more = capacity > 1 ? items.length - shown.length : 0;
  }

  return (
    <div ref={box} className={styles.fitting}>
      {height > 0 ? shown.map((item) => <div key={keyOf(item)}>{render(item)}</div>) : null}
      {height > 0 && more > 0 ? <p className={styles.more}>+{more} more</p> : null}
    </div>
  );
}

export default function TvClient({ token, onDenied }: { token: string; onDenied?: () => void }) {
  const [data, setData] = useState<TvData | null>(null);
  const [problem, setProblem] = useState<"" | "off" | "denied">("");
  const [reconnecting, setReconnecting] = useState(false);
  const [clock, setClock] = useState("");
  const [now, setNow] = useState(() => new Date());
  const [tick, setTick] = useState(0);
  const [shift, setShift] = useState(0);
  const [unit, setUnit] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  // Full screen: on or not, whether this browser can do it when asked, and the F11 hint.
  const [full, setFull] = useState(true);
  const [canFull, setCanFull] = useState(false);
  const [hint, setHint] = useState(false);
  const [idle, setIdle] = useState(false);

  const load = useCallback(async () => {
    try {
      const response = await fetch(`/api/board/tv${token ? `?k=${encodeURIComponent(token)}` : ""}`, { cache: "no-store" });
      if (response.status === 401) {
        // Disconnected: the board comes off this screen right away.
        setData(null);
        setProblem("denied");
        onDenied?.();
        return;
      }
      const body = (await response.json()) as { success?: boolean; ready?: boolean } & Partial<TvData>;
      if (!response.ok || body.success !== true) throw new Error("failed");
      if (body.ready !== true) return setProblem("off");
      setData({
        today: body.today ?? "",
        settings: body.settings!,
        managers: body.managers ?? [],
        papers: body.papers ?? [],
        counters: body.counters ?? { pinned: 0, stuck: 0, doneToday: 0 },
        cleanings: body.cleanings ?? [],
      });
      setProblem("");
      setReconnecting(false);
    } catch {
      // Keep showing the last board; the top strip says it is reconnecting.
      setReconnecting(true);
    }
  }, [token, onDenied]);

  // Data every minute, the rows every 8 seconds, the clock, and the small shift every 10 minutes.
  useEffect(() => {
    void load();
    const refresh = window.setInterval(() => void load(), REFRESH_MS);
    const rotate = window.setInterval(() => setTick((value) => value + 1), ROTATE_MS);
    const move = window.setInterval(() => setShift((value) => (value + 1) % SHIFTS.length), SHIFT_MS);
    const time = () => {
      const date = new Date();
      setNow(date);
      setClock(date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }));
    };
    time();
    const clockTimer = window.setInterval(time, 5_000);
    return () => {
      window.clearInterval(refresh);
      window.clearInterval(rotate);
      window.clearInterval(move);
      window.clearInterval(clockTimer);
    };
  }, [load]);

  const hasData = data !== null;
  // One unit = 1% of the screen's real height (what is left under a TV browser's toolbar).
  useLayoutEffect(() => {
    const measure = () => {
      const height = root.current?.clientHeight || window.innerHeight;
      setUnit(height / 100);
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [hasData, problem]);

  // The page behind never scrolls while the TV screen is up.
  useEffect(() => {
    const html = document.documentElement;
    const before = [html.style.overflow, document.body.style.overflow];
    html.style.overflow = "hidden";
    document.body.style.overflow = "hidden";
    return () => {
      html.style.overflow = before[0];
      document.body.style.overflow = before[1];
    };
  }, []);

  /** "Press F11 for full screen": shown once per time the browser is opened, for a browser that cannot do it itself. */
  const showHint = useCallback(() => {
    try {
      if (window.sessionStorage.getItem(HINT_KEY)) return;
      window.sessionStorage.setItem(HINT_KEY, "1");
    } catch {
      // A browser that keeps nothing: the hint just shows.
    }
    setHint(true);
    window.setTimeout(() => setHint(false), HINT_MS);
  }, []);

  // Is the browser out of the way? Checked again whenever full screen starts or ends (Esc), or the window changes.
  useEffect(() => {
    const check = () => {
      setFull(fillsTheScreen());
      setCanFull(fullScreenSupported());
    };
    check();
    if (!fillsTheScreen() && !fullScreenSupported()) showHint();
    FULL_SCREEN_EVENTS.forEach((name) => document.addEventListener(name, check));
    window.addEventListener("resize", check);
    return () => {
      FULL_SCREEN_EVENTS.forEach((name) => document.removeEventListener(name, check));
      window.removeEventListener("resize", check);
    };
  }, [showHint]);

  // No mouse movement for a few seconds: the pointer and the buttons go away. Any movement brings them back.
  useEffect(() => {
    let timer = 0;
    let last = "";
    const wake = () => {
      setIdle(false);
      window.clearTimeout(timer);
      timer = window.setTimeout(() => setIdle(true), IDLE_MS);
    };
    const moved = (event: MouseEvent) => {
      // A browser also reports a "move" when the picture changes under a still mouse; only a real move counts.
      const at = `${event.screenX},${event.screenY}`;
      if (at === last) return;
      last = at;
      wake();
    };
    wake();
    window.addEventListener("mousemove", moved);
    window.addEventListener("mousedown", wake);
    window.addEventListener("touchstart", wake);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("mousemove", moved);
      window.removeEventListener("mousedown", wake);
      window.removeEventListener("touchstart", wake);
    };
  }, []);

  /** The big "Full screen" button. A browser only allows it from inside a click, which this is. */
  const goFull = async () => {
    if (!(await enterFullScreen())) showHint();
  };

  // Keep the screen awake. A browser that refuses still has the tiny moving dot (styles.awake).
  useEffect(() => {
    type Lock = { release: () => Promise<void> };
    let lock: Lock | null = null;
    let alive = true;
    const ask = async () => {
      try {
        const wakeLock = (navigator as Navigator & { wakeLock?: { request: (type: "screen") => Promise<Lock> } }).wakeLock;
        if (!wakeLock || document.visibilityState !== "visible") return;
        const got = await wakeLock.request("screen");
        if (alive) lock = got;
        else void got.release();
      } catch {
        // Refused: the moving dot keeps the screen busy.
      }
    };
    void ask();
    document.addEventListener("visibilitychange", ask);
    return () => {
      alive = false;
      document.removeEventListener("visibilitychange", ask);
      void lock?.release().catch(() => null);
    };
  }, []);

  // The squares that have notes, late and stuck notes first in each.
  const squares = useMemo(() => {
    if (!data) return [];
    const late = (paper: Paper) => (isOverdue(paper, now) || isOld(paper, data.settings, now) ? 0 : 1);
    const sorted = (list: Paper[]) => [...list].sort((a, b) => late(a) - late(b) || a.pinnedAt.localeCompare(b.pinnedAt));
    const all = [
      ...SHARED_SQUARES.map((square) => ({ key: `shared:${square.kind}`, name: square.label, papers: papersIn(data.papers, { shared: square.kind }) })),
      { key: "shared:note", name: "Office", papers: papersIn(data.papers, { shared: "note" }) },
      ...data.managers.map((manager) => ({ key: `mgr:${manager.id}`, name: manager.name, papers: papersIn(data.papers, { manager: manager.id }) })),
    ];
    return all.filter((square) => square.papers.length > 0).map((square) => ({ ...square, papers: sorted(square.papers) }));
  }, [data, now]);

  // Leaving TV mode also ends full screen.
  const exit =
    token || idle ? null : (
      <Link href="/board" className={styles.exit} onClick={() => void exitFullScreen()}>
        Exit TV mode
      </Link>
    );

  if (problem === "denied" || problem === "off") {
    return (
      <div className={styles.message}>
        {exit}
        <p className={styles.messageTitle}>{problem === "denied" ? "This TV is not connected" : "The Pin Board is not turned on here yet"}</p>
        {problem === "denied" ? <p>Ask the owner to connect this TV again: open /tv on this TV.</p> : null}
      </div>
    );
  }

  const count = squares.length;
  const columns = count <= 3 ? Math.max(1, count) : count === 4 ? 2 : count <= 9 ? 3 : 4;
  const cleaned = data ? data.cleanings.filter((cleaning) => cleaning.status === "cleaned").length : 0;
  const total = data ? data.cleanings.length : 0;
  // Still to do first, so what needs attention is on screen longest.
  const cleanings: ListedCleaning[] = data
    ? data.cleanings.map((cleaning, index) => ({ ...cleaning, key: String(index) })).sort((a, b) => Number(a.status === "cleaned") - Number(b.status === "cleaned"))
    : [];
  const day = now.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
  const [dx, dy] = SHIFTS[shift];

  return (
    <div ref={root} className={`${styles.tv} ${idle ? styles.idle : ""}`} style={{ ["--u" as string]: unit > 0 ? `${unit}px` : undefined }} data-tv-screen aria-live="off">
      <span className={styles.awake} aria-hidden="true" />
      <div className={styles.stage} style={{ transform: `translate(${dx}px, ${dy}px)` }}>
        <header className={styles.strip}>
          <div className={styles.brandBox}>
            {/* The same logo, on the same white tile, as the app's own top bar. */}
            <span className={styles.logo}>
              <Image src="/cw-emblem.png" alt="" width={276} height={180} priority unoptimized className="h-full w-full object-contain" />
            </span>
            <p className={styles.brand}>Cleaning World</p>
          </div>
          <div className={styles.counters}>
            <div className={styles.counter} data-count="pinned">
              <span className={styles.counterNumber}>{data ? data.counters.pinned : "–"}</span>
              <span className={styles.counterLabel}>Pinned</span>
            </div>
            <div className={`${styles.counter} ${data && data.counters.stuck > 0 ? styles.counterBad : ""}`} data-count="stuck">
              <span className={styles.counterNumber}>{data ? data.counters.stuck : "–"}</span>
              <span className={styles.counterLabel}>Stuck too long</span>
            </div>
            <div className={`${styles.counter} ${styles.counterGood}`} data-count="done">
              <span className={styles.counterNumber}>{data ? data.counters.doneToday : "–"}</span>
              <span className={styles.counterLabel}>Done today</span>
            </div>
          </div>
          <div className={styles.clockBox}>
            <p className={styles.clock}>{clock}</p>
            <p className={styles.day}>{reconnecting ? <span className={styles.reconnecting}>Reconnecting…</span> : day}</p>
          </div>
        </header>

        <div className={styles.body}>
          <section className={styles.board} style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }} aria-label="Pin board">
            {!data ? <p className={styles.empty}>{reconnecting ? "Reconnecting…" : "Loading the board"}</p> : null}
            {data && count === 0 ? <p className={styles.empty}>Nothing pinned. All clear.</p> : null}
            {squares.map((square) => (
              <div key={square.key} className={styles.square} data-square={square.key}>
                <div className={styles.squareHead}>
                  <h2 className={styles.squareName}>{square.name}</h2>
                  <span className={styles.squareCount}>{square.papers.length}</span>
                </div>
                <Fitting
                  items={square.papers}
                  unit={unit}
                  row={NOTE_ROW}
                  tick={tick}
                  keyOf={(paper) => `${paper.kind}:${paper.itemId}`}
                  render={(paper) => {
                    const overdue = isOverdue(paper, now);
                    const stuck = data ? isOld(paper, data.settings, now) : false;
                    return (
                      <div className={`${styles.note} ${styles[paper.kind]} ${paper.label === "Account update" ? styles.updateNote : ""} ${overdue || stuck ? styles.late : ""}`} data-late={overdue || stuck ? "1" : "0"}>
                        <p className={styles.noteType}>
                          {paperLabel(paper)}
                          {overdue ? ` · due ${dueLabel(paper.dueDate)}` : stuck ? ` · ${daysLabel(daysPinned(paper, now))}` : ""}
                          {paper.recordDone ? " · done ✓" : ""}
                        </p>
                        <p className={styles.noteName}>{paper.accountName || paperLabel(paper)}</p>
                        {overdue || stuck ? <span className={styles.lateCorner} aria-hidden="true" /> : null}
                      </div>
                    );
                  }}
                />
              </div>
            ))}
          </section>

          <aside className={styles.side} aria-label="Today's cleanings">
            <h2 className={styles.sideTitle}>Today&apos;s cleanings</h2>
            <p className={styles.progressText} data-progress>
              <strong>{cleaned}</strong> of {total} cleaned
            </p>
            <div className={styles.progressBar}>
              <span style={{ width: `${total > 0 ? Math.round((cleaned / total) * 100) : 0}%` }} />
            </div>
            {data && total === 0 ? <p className={styles.empty}>No cleanings on the schedule today.</p> : null}
            <Fitting
              items={cleanings}
              unit={unit}
              row={CLEANING_ROW}
              tick={tick}
              keyOf={(cleaning) => cleaning.key}
              render={(cleaning) => (
                <div className={`${styles.cleaning} ${styles[cleaning.status] ?? ""}`}>
                  <p className={styles.cleaningName}>{cleaning.accountName}</p>
                  <p className={styles.cleaningSub}>
                    {STATUS_LABEL[cleaning.status]}
                    {cleaning.sub ? ` · ${cleaning.sub}` : ""}
                  </p>
                </div>
              )}
            />
          </aside>
        </div>

        {/* The company rule: its own strip under the board, so it never covers a square. */}
        <footer className={styles.rule} data-tv-rule>
          <p className={styles.ruleText}>{MOTTO.en}</p>
        </footer>
      </div>
      {!full && canFull && !idle ? (
        <button type="button" className={styles.fullButton} onClick={() => void goFull()}>
          Full screen
        </button>
      ) : null}
      {hint && !full ? <p className={styles.hint}>Press F11 for full screen</p> : null}
      {exit}
    </div>
  );
}
