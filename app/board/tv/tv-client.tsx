"use client";

// Office TV mode: ONE fixed screen, the size of the TV, that never scrolls.
//
//   top strip      logo, the three counts, the "Today's cleanings" button,
//                  the clock and date. Always there.
//   middle         the pin board: only the squares that have notes, laid out
//                  so each one is as big as it can be. With 4 squares or
//                  fewer, today's cleanings sit in a column on the right;
//                  with 5 or more the squares get the full width.
//   bottom strip   the company rule, in green. Always there.
//
// A square shows its 3 oldest / most urgent notes, then "+N more". A click on
// a square opens all of its notes in the middle; "Today's cleanings" in the
// top strip opens today's cleanings there. Both have a big "Back to board"
// button and go back by themselves after 60 seconds.
//
// Slideshow: after a few minutes on the board, the middle shows about a
// minute of the photos staff gave the "Show on TV" star (and first, today's
// birthdays, anniversaries, holidays and company events), then the board
// again. A click anywhere goes straight back to the board. With no starred
// photos and nothing today, the board simply stays.
//
// The picture keeps a 4% margin from every edge of the screen (a TV cuts off
// its edges: overscan). Everything inside is sized from the picture itself
// (--u = 1% of its height, or less on a screen narrower than a TV), measured
// here, so it fits any screen, a TV browser whose toolbar takes part of it,
// and one too old for newer CSS units. Nothing is ever scrolled or cut off:
// a long name ends in "…".
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
import { EVENT_ICON, type OfficeEventKind } from "@/lib/officeEvents";
import { MOTTO } from "@/app/ui/words";
import PizzaTracker from "@/app/components/pizza-tracker";
import { FULL_SCREEN_EVENTS, enterFullScreen, exitFullScreen, fillsTheScreen, fullScreenSupported } from "../full-screen";
import styles from "./tv.module.css";

type TvCleaning = { accountName: string; sub: string; status: CleaningStatus };
type ListedCleaning = TvCleaning & { key: string };
type TvSlide = { url: string; caption: string };
type TvNote = { kind: OfficeEventKind; text: string };
type TvData = {
  today: string;
  settings: BoardSettings;
  managers: BoardManager[];
  papers: Paper[];
  counters: { pinned: number; stuck: number; doneToday: number };
  cleanings: TvCleaning[];
  /** The photos with the "Show on TV" star. */
  slides: TvSlide[];
  /** Today's birthdays, anniversaries, holidays, office closed, company events. */
  todayNotes: TvNote[];
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

/** The slideshow: this long on the board, then SLIDES_PER_SHOW slides of SLIDE_MS each (about a minute), and again. */
const BOARD_MS = 4 * 60_000;
const SLIDE_MS = 10_000;
const SLIDES_PER_SHOW = 6;
/** A list that was opened (a square, or today's cleanings) closes by itself after this long. */
const BACK_MS = 60_000;
/** The picture is a TV's shape, 16:9. On a narrower screen the width decides the size of everything. */
const UNITS_WIDE = 177.8;

/** Row heights, in units (they match tv.module.css). */
const NOTE_ROW = 7.6;
const CLEANING_ROW = 7.2;
const ROW_GAP = 0.8;
/** A square shows this many notes, then "+N more". */
const SQUARE_NOTES = 3;
/** A note in a square is never taller than MAX; three are not squeezed below MIN (fewer are shown then). */
const NOTE_ROW_MAX = 13;
const NOTE_ROW_MIN = 4.6;
/** "+N more" takes this much of a note's height. */
const MORE_PART = 0.55;
/** In an opened list, a column is at least this wide. */
const LIST_COLUMN = 52;
/** With this many squares or fewer, today's cleanings show beside the board. */
const SIDE_UP_TO = 4;

/** The size of a box on the screen, kept up to date. */
function useBoxSize(ready: unknown) {
  const box = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  useLayoutEffect(() => {
    const measure = () => {
      const width = box.current?.clientWidth ?? 0;
      const height = box.current?.clientHeight ?? 0;
      setSize((before) => (before.width === width && before.height === height ? before : { width, height }));
    };
    measure();
    window.addEventListener("resize", measure);
    const observer = typeof ResizeObserver === "undefined" || !box.current ? null : new ResizeObserver(measure);
    if (observer && box.current) observer.observe(box.current);
    return () => {
      window.removeEventListener("resize", measure);
      observer?.disconnect();
    };
  }, [ready]);
  return { box, ...size };
}

/** How many squares go in each row, so that every square is as big as the space allows. */
function squareRows(count: number, width: number, height: number): number[] {
  if (count === 0) return [];
  let columns = count <= 3 ? count : count === 4 ? 2 : count <= 9 ? 3 : 4;
  if (width > 0 && height > 0) {
    let best = 0;
    for (let c = 1; c <= count; c++) {
      // The biggest 1.6-wide card that fits one cell of a grid with c columns.
      const fit = Math.min(width / c / 1.6, height / Math.ceil(count / c));
      if (fit > best) {
        best = fit;
        columns = c;
      }
    }
  }
  const rows = Math.ceil(count / columns);
  // The same number in every row, give or take one: a short last row would leave a hole.
  return Array.from({ length: rows }, (_, index) => Math.floor(count / rows) + (index < count % rows ? 1 : 0));
}

/** The notes of one square: the first three, as tall as the square allows, then the rest as a pile ("+N more"). */
function SquareNotes<T>({ items, unit, keyOf, render }: { items: T[]; unit: number; keyOf: (item: T) => string; render: (item: T) => ReactNode }) {
  const { box, height } = useBoxSize(unit);
  const gap = ROW_GAP * unit;
  const rowFor = (shown: number) => {
    const more = items.length > shown;
    return (height - gap * (shown - 1 + (more ? 1 : 0))) / (shown + (more ? MORE_PART : 0));
  };
  let shown = Math.min(SQUARE_NOTES, items.length);
  while (shown > 1 && rowFor(shown) < NOTE_ROW_MIN * unit) shown--;
  const row = Math.max(0, Math.min(NOTE_ROW_MAX * unit, rowFor(shown)));
  const more = items.length - shown;
  const ready = height > 0 && unit > 0;

  return (
    <div ref={box} className={styles.fitting} style={{ ["--row" as string]: `${row}px` }}>
      {ready ? items.slice(0, shown).map((item) => <div key={keyOf(item)}>{render(item)}</div>) : null}
      {ready && more > 0 ? (
        // The rest of the square's notes, as one pile. Only to look at: a click on the square opens them all.
        <div className={styles.squarePile} data-pile>
          <span className={styles.pileSheet} aria-hidden="true" />
          <span className={styles.pileSheet} aria-hidden="true" />
          <span className={styles.pileSheet} aria-hidden="true" />
          <span className={styles.pilePin} aria-hidden="true" />
          <span className={styles.pileCount}>+{more}</span>
          <span className={styles.pileWord}>more</span>
        </div>
      ) : null}
    </div>
  );
}

/**
 * An opened list, in as many columns as fit. When there is more than one
 * screen of it, it turns to the next one on every tick and says which.
 */
function Paged<T>({ items, unit, row, tick, keyOf, render }: { items: T[]; unit: number; row: number; tick: number; keyOf: (item: T) => string; render: (item: T) => ReactNode }) {
  const { box, width, height } = useBoxSize(unit);
  const gap = ROW_GAP * unit;
  const ready = width > 0 && height > 0 && unit > 0;
  const columns = ready ? Math.max(1, Math.floor((width + gap) / (LIST_COLUMN * unit + gap))) : 1;
  const rows = ready ? Math.max(1, Math.floor((height + gap) / (row * unit + gap))) : 1;
  const perPage = columns * rows;
  const pages = Math.max(1, Math.ceil(items.length / perPage));
  const page = tick % pages;

  return (
    <div className={styles.paged} style={{ ["--row" as string]: `${row * unit}px` }}>
      <div ref={box} className={styles.pagedGrid} style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
        {ready ? items.slice(page * perPage, (page + 1) * perPage).map((item) => <div key={keyOf(item)}>{render(item)}</div>) : null}
      </div>
      <p className={styles.pagedFoot}>{ready && pages > 1 ? `Screen ${page + 1} of ${pages}` : ""}</p>
    </div>
  );
}

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

/* ---------- keeping the screen awake ----------
 *
 * A TV stick starts its screensaver when nobody touches the remote. Two
 * things keep the screen awake while the board is up, the way a video site
 * does:
 *
 *   1. the Screen Wake Lock, asked for again whenever the page comes back
 *      into view or the browser lets the lock go;
 *   2. a real video that plays for ever: /board/tv/keep-awake.mp4, one minute
 *      of the background's own blue with a silent sound track, looping. It
 *      is small, sits in the bottom corner in the screen's margin and is all
 *      but transparent, so it cannot be seen even by a TV that draws video on
 *      its own layer, and it makes no sound. If that file cannot be played, a
 *      picture made here (a tiny canvas that changes once a second) plays in
 *      its place.
 *
 * A browser may refuse to start a video by itself. So both are also started
 * by the first press on the remote, click or touch, and again by every later
 * one. While the video is not playing, a small line at the bottom says
 * "Press OK on the remote to keep the screen on"; it goes away once it plays.
 *
 * The video runs even when the wake lock was given: the lock alone was
 * already being asked for and the office Fire Stick still went to sleep.
 *
 * After the first press, the video plays un-muted: a stick may only count a
 * video with sound as playing. Its sound track is silence, so nothing is
 * heard. Until that press it is muted, which is all a browser lets start by
 * itself.
 *
 * A corner line says which of the two is on. It shows by itself for the
 * first two minutes after the page opens, then goes away, so nobody has to
 * type an address on the TV to check.
 *
 * In the TV's address:
 *   ?wakeinfo=1    the corner line stays for good
 *   ?wakesound=0   the video stays muted after a press too
 */

type WakeLockLike = { release: () => Promise<void>; addEventListener?: (type: "release", listener: () => void) => void };
type LockState = "none" | "off" | "on";
type VideoState = "none" | "off" | "on";
/** A lock or a video that stopped is started again within this long. */
const AWAKE_CHECK_MS = 15_000;
/** The video gets this long to start by itself before the "Press OK" line shows. */
const AWAKE_PROMPT_MS = 5_000;
/** The corner line that says what is on shows by itself for this long after the page opens. */
const AWAKE_INFO_MS = 2 * 60_000;
const AWAKE_VIDEO = "/board/tv/keep-awake.mp4";
/** What wakes both up: any key on the remote, a click, a touch. */
const AWAKE_GESTURES = ["keydown", "pointerdown", "click", "touchstart"] as const;

function KeepAwake() {
  const video = useRef<HTMLVideoElement>(null);
  const [lockState, setLockState] = useState<LockState>("off");
  const [videoState, setVideoState] = useState<VideoState>("off");
  // The corner line: on for the first two minutes, and for good with ?wakeinfo=1.
  const [justOpened, setJustOpened] = useState(true);
  const [keepInfo, setKeepInfo] = useState(false);
  const showInfo = justOpened || keepInfo;
  // False for the first few seconds, so the "Press OK" line does not flash while the video starts by itself.
  const [waited, setWaited] = useState(false);

  useEffect(() => {
    try {
      const asked = new URLSearchParams(window.location.search).get("wakeinfo");
      setKeepInfo(asked !== null && asked !== "0");
    } catch {
      // No address to read: the line goes away after the two minutes.
    }
    const timer = window.setTimeout(() => setWaited(true), AWAKE_PROMPT_MS);
    const infoTimer = window.setTimeout(() => setJustOpened(false), AWAKE_INFO_MS);
    return () => {
      window.clearTimeout(timer);
      window.clearTimeout(infoTimer);
    };
  }, []);

  // 1. The Screen Wake Lock.
  useEffect(() => {
    const wakeLock = (navigator as Navigator & { wakeLock?: { request: (type: "screen") => Promise<WakeLockLike> } }).wakeLock;
    if (!wakeLock) {
      setLockState("none");
      return;
    }
    let lock: WakeLockLike | null = null;
    let asking = false;
    let alive = true;
    const ask = async () => {
      if (lock || asking || document.visibilityState !== "visible") return;
      asking = true;
      try {
        const got = await wakeLock.request("screen");
        if (!alive) return void got.release().catch(() => null);
        lock = got;
        setLockState("on");
        // The browser lets it go when the page is hidden (and for its own reasons): ask again.
        got.addEventListener?.("release", () => {
          if (lock === got) lock = null;
          if (alive) setLockState("off");
        });
      } catch {
        // Refused: the video below keeps the screen awake.
        if (alive) setLockState("off");
      } finally {
        asking = false;
      }
    };
    void ask();
    const again = () => void ask();
    document.addEventListener("visibilitychange", again);
    for (const gesture of AWAKE_GESTURES) window.addEventListener(gesture, again, { capture: true, passive: true });
    const check = window.setInterval(again, AWAKE_CHECK_MS);
    return () => {
      alive = false;
      document.removeEventListener("visibilitychange", again);
      for (const gesture of AWAKE_GESTURES) window.removeEventListener(gesture, again, { capture: true });
      window.clearInterval(check);
      void lock?.release().catch(() => null);
    };
  }, []);

  // 2. The video nobody sees.
  useEffect(() => {
    const element = video.current;
    if (!element) {
      setVideoState("none");
      return;
    }
    // Un-muted after a press unless the address says ?wakesound=0.
    let wantSound = true;
    try {
      wantSound = new URLSearchParams(window.location.search).get("wakesound") !== "0";
    } catch {
      // No address to read: the usual way.
    }
    let stream: MediaStream | null = null;
    let frames = 0;
    let lastTime = -1;

    // The stand-in when the file cannot be played: a picture made here. Two
    // blues nobody can tell apart, one after the other: a picture that
    // changes is a video that plays.
    const useCanvas = () => {
      if (stream) return;
      const canvas = document.createElement("canvas");
      canvas.width = 16;
      canvas.height = 16;
      const context = canvas.getContext("2d");
      const capture = (canvas as HTMLCanvasElement & { captureStream?: (frameRate?: number) => MediaStream }).captureStream;
      if (!context || typeof capture !== "function") return setVideoState("none");
      let flip = false;
      const draw = () => {
        flip = !flip;
        context.fillStyle = flip ? "#0c447c" : "#0c447d";
        context.fillRect(0, 0, canvas.width, canvas.height);
      };
      draw();
      try {
        stream = capture.call(canvas, 2);
        element.removeAttribute("src");
        element.srcObject = stream;
        frames = window.setInterval(draw, 1_000);
        play(false);
      } catch {
        setVideoState("none");
      }
    };

    const play = (fromGesture: boolean) => {
      if (document.visibilityState !== "visible") return;
      // Only from a press: a browser never lets sound start by itself. (Not with ?wakesound=0.)
      if (fromGesture && wantSound) {
        element.muted = false;
        element.volume = 0.05;
      }
      if (!element.paused) return;
      void element.play().catch(() => {
        // Not allowed with sound after all: muted is what the browser lets through.
        if (!element.muted) {
          element.muted = true;
          void element.play().catch(() => null);
        }
      });
    };
    const report = () => setVideoState(element.paused ? "off" : "on");
    const onGesture = () => play(true);
    const onVisible = () => play(false);
    // A file that ends starts again even where "loop" is not honoured.
    const onEnded = () => {
      element.currentTime = 0;
      play(false);
    };

    element.muted = true;
    element.defaultMuted = true;
    element.loop = true;
    element.addEventListener("playing", report);
    element.addEventListener("pause", report);
    element.addEventListener("ended", onEnded);
    element.addEventListener("error", useCanvas);
    element.src = AWAKE_VIDEO;
    play(false);

    // Started again when it stopped, or when it says it plays but the time stands still.
    const check = window.setInterval(() => {
      const stuck = !element.paused && element.currentTime === lastTime;
      lastTime = element.currentTime;
      if (stuck) {
        setVideoState("off");
        element.pause();
      }
      play(false);
    }, AWAKE_CHECK_MS);
    document.addEventListener("visibilitychange", onVisible);
    for (const gesture of AWAKE_GESTURES) window.addEventListener(gesture, onGesture, { capture: true, passive: true });
    return () => {
      window.clearInterval(frames);
      window.clearInterval(check);
      document.removeEventListener("visibilitychange", onVisible);
      for (const gesture of AWAKE_GESTURES) window.removeEventListener(gesture, onGesture, { capture: true });
      element.removeEventListener("playing", report);
      element.removeEventListener("pause", report);
      element.removeEventListener("ended", onEnded);
      element.removeEventListener("error", useCanvas);
      element.pause();
      element.srcObject = null;
      element.removeAttribute("src");
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  const word = { none: "not in this browser", off: "off", on: "on" };
  return (
    <>
      <video ref={video} className={styles.awakeVideo} muted loop playsInline preload="auto" disablePictureInPicture disableRemotePlayback tabIndex={-1} aria-hidden="true" data-keep-awake />
      {waited && videoState === "off" ? (
        <p className={styles.awakePrompt} data-awake-prompt>
          Press OK on the remote to keep the screen on
        </p>
      ) : null}
      {showInfo ? (
        <p className={styles.awakeInfo} data-awake-info>
          Awake: wake lock {word[lockState]} · video {word[videoState]}
        </p>
      ) : null}
    </>
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
  const stage = useRef<HTMLDivElement>(null);
  // What the middle shows: "board", "cleanings" (today's cleanings), or the key of the square whose full list is open.
  const [view, setView] = useState("board");
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
        slides: body.slides ?? [],
        todayNotes: body.todayNotes ?? [],
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
  // One unit = 1% of the picture's real height (the screen less the safe margin, and less a TV browser's
  // toolbar). On a screen narrower than a TV the width decides, so nothing runs off the sides.
  useLayoutEffect(() => {
    const measure = () => {
      const height = stage.current?.clientHeight || window.innerHeight * 0.92;
      const width = stage.current?.clientWidth || window.innerWidth * 0.92;
      setUnit(Math.min(height / 100, width / UNITS_WIDE));
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [hasData, problem]);

  // An opened list closes by itself, so the TV is never left on it.
  useEffect(() => {
    if (view === "board") return;
    const timer = window.setTimeout(() => setView("board"), BACK_MS);
    return () => window.clearTimeout(timer);
  }, [view]);

  // The slideshow. `show` is the photo the running show started on (null = the board is up); `slide` is where it is.
  const [show, setShow] = useState<number | null>(null);
  const [slide, setSlide] = useState(0);
  const nextStart = useRef(0);
  const photoCount = data?.slides.length ?? 0;
  const hasNotes = (data?.todayNotes.length ?? 0) > 0;
  const photosPerShow = Math.min(photoCount, SLIDES_PER_SHOW - (hasNotes ? 1 : 0));
  const deckLength = (hasNotes ? 1 : 0) + photosPerShow;

  // The board has been up long enough: start a show, if there is anything to show.
  useEffect(() => {
    if (view !== "board" || show !== null || deckLength === 0) return;
    const timer = window.setTimeout(() => {
      setSlide(0);
      setShow(nextStart.current);
    }, BOARD_MS);
    return () => window.clearTimeout(timer);
  }, [view, show, deckLength]);

  // While a show runs: the next slide every few seconds, then back to the board. The next show goes on from where this one stopped.
  useEffect(() => {
    if (show === null) return;
    const timer = window.setTimeout(() => {
      if (slide + 1 < deckLength) return setSlide(slide + 1);
      nextStart.current = photoCount > 0 ? (show + photosPerShow) % photoCount : 0;
      setShow(null);
    }, SLIDE_MS);
    return () => window.clearTimeout(timer);
  }, [show, slide, deckLength, photoCount, photosPerShow]);

  /** Any click during the slideshow: the board is back at once. */
  const endShow = useCallback(() => setShow(null), []);

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

  // The board's own space; the squares are laid out again whenever it or their number changes.
  const board = useBoxSize(`${hasData}:${problem}:${view}:${squares.length}`);

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
  // A square that was open and has no notes any more: the board shows again.
  const opened = squares.find((square) => square.key === view) ?? null;
  const slideshow = show !== null && view === "board" && deckLength > 0 && data !== null;
  const showing = view === "cleanings" ? "cleanings" : opened ? "square" : slideshow ? "slides" : "board";
  // This show's slides: today's notes first (when there are any), then the next few starred photos.
  const notesSlide = slideshow && hasNotes && slide === 0;
  const photoSlide = slideshow && !notesSlide && data && photoCount > 0 ? data.slides[((show ?? 0) + slide - (hasNotes ? 1 : 0)) % photoCount] : null;
  // Today's cleanings sit beside the board only while few squares are in use; after that the squares get the full width.
  const sideShown = count <= SIDE_UP_TO;
  const rows = squareRows(count, board.width, board.height);
  const cleaned = data ? data.cleanings.filter((cleaning) => cleaning.status === "cleaned").length : 0;
  const total = data ? data.cleanings.length : 0;
  // Still to do first, so what needs attention is on screen longest.
  const cleanings: ListedCleaning[] = data
    ? data.cleanings.map((cleaning, index) => ({ ...cleaning, key: String(index) })).sort((a, b) => Number(a.status === "cleaned") - Number(b.status === "cleaned"))
    : [];
  const day = now.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
  const [dx, dy] = SHIFTS[shift];

  const renderNote = (paper: Paper) => {
    const overdue = isOverdue(paper, now);
    // A new account in the 8-step flow is late by its own rule: 2 work days with no progress on one step.
    const stuck = paper.flow ? paper.flow.red : data ? isOld(paper, data.settings, now) : false;
    return (
      <div className={`${styles.note} ${styles[paper.kind]} ${paper.label === "Account update" ? styles.updateNote : ""} ${overdue || stuck ? styles.late : ""}`} data-late={overdue || stuck ? "1" : "0"}>
        <p className={styles.noteType}>
          {paperLabel(paper)}
          {overdue ? ` · due ${dueLabel(paper.dueDate)}` : stuck && !paper.flow ? ` · ${daysLabel(daysPinned(paper, now))}` : ""}
          {paper.recordDone ? " · done ✓" : ""}
        </p>
        <p className={styles.noteName}>{paper.accountName || paperLabel(paper)}</p>
        {paper.flow ? <PizzaTracker view={paper.flow} size="pin" /> : null}
        {overdue || stuck ? <span className={styles.lateCorner} aria-hidden="true" /> : null}
      </div>
    );
  };
  const renderCleaning = (cleaning: ListedCleaning) => (
    <div className={`${styles.cleaning} ${styles[cleaning.status] ?? ""}`}>
      <p className={styles.cleaningName}>{cleaning.accountName}</p>
      <p className={styles.cleaningSub}>
        {STATUS_LABEL[cleaning.status]}
        {cleaning.sub ? ` · ${cleaning.sub}` : ""}
      </p>
    </div>
  );
  const progress = (
    <>
      <p className={styles.progressText} data-progress>
        <strong>{cleaned}</strong> of {total} cleaned
      </p>
      <div className={styles.progressBar}>
        <span style={{ width: `${total > 0 ? Math.round((cleaned / total) * 100) : 0}%` }} />
      </div>
    </>
  );
  const backButton = (
    <button type="button" className={styles.back} onClick={() => setView("board")} data-tv-back>
      Back to board
    </button>
  );
  // The squares, row by row.
  const squareRowList = rows.map((inRow, index) => {
    const start = rows.slice(0, index).reduce((sum, value) => sum + value, 0);
    return squares.slice(start, start + inRow);
  });

  return (
    <div className={`${styles.tv} ${idle ? styles.idle : ""}`} style={{ ["--u" as string]: unit > 0 ? `${unit}px` : undefined }} data-tv-screen aria-live="off">
      <KeepAwake />
      <span className={styles.awake} aria-hidden="true" />
      <div ref={stage} className={styles.stage} style={{ transform: `translate(${dx}px, ${dy}px)` }}>
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
            {/* Opens today's cleanings in the middle of the screen; a second click closes them. */}
            <button
              type="button"
              className={`${styles.counter} ${styles.counterButton} ${showing === "cleanings" ? styles.counterOn : ""}`}
              onClick={() => {
                setShow(null);
                setView(showing === "cleanings" ? "board" : "cleanings");
              }}
              aria-pressed={showing === "cleanings"}
              data-count="cleanings"
            >
              <span className={styles.counterLabel}>Today&apos;s cleanings</span>
              <span className={styles.counterSmall}>{data ? `${cleaned} of ${total} cleaned` : "–"}</span>
            </button>
          </div>
          <div className={styles.clockBox}>
            <p className={styles.clock}>{clock}</p>
            <p className={styles.day}>{reconnecting ? <span className={styles.reconnecting}>Reconnecting…</span> : day}</p>
          </div>
        </header>

        {showing === "slides" ? (
          // The slideshow takes the middle of the screen; the top strip and the company rule stay. A click ends it.
          <section className={styles.slides} onClick={endShow} aria-label="Photos" data-tv-slides={notesSlide ? "notes" : "photo"}>
            {notesSlide && data ? (
              <div className={styles.notes}>
                <p className={styles.notesTitle}>Today</p>
                {data.todayNotes.slice(0, 5).map((note, index) => (
                  <p key={index} className={styles.noteLine}>
                    <span aria-hidden="true">{EVENT_ICON[note.kind]}</span> {note.text}
                  </p>
                ))}
              </div>
            ) : photoSlide ? (
              <>
                <div className={styles.slidePhoto}>
                  <Image key={photoSlide.url} src={photoSlide.url} alt="" fill unoptimized sizes="92vw" className={styles.slideImage} />
                </div>
                {photoSlide.caption ? <p className={styles.slideCaption}>{photoSlide.caption}</p> : null}
              </>
            ) : null}
          </section>
        ) : showing === "board" ? (
          <div className={`${styles.body} ${sideShown ? "" : styles.bodyWide}`} data-tv-side={sideShown ? "1" : "0"}>
            <div ref={board.box} className={styles.board} role="region" aria-label="Pin board">
              {!data ? <p className={styles.empty}>{reconnecting ? "Reconnecting…" : "Loading the board"}</p> : null}
              {data && count === 0 ? <p className={styles.empty}>Nothing pinned. All clear.</p> : null}
              {squareRowList.map((inRow, rowIndex) => (
                <div key={rowIndex} className={styles.boardRow} style={{ gridTemplateColumns: `repeat(${inRow.length}, minmax(0, 1fr))` }}>
                  {inRow.map((item) => (
                    // The whole square works as one button: it opens the square's full list.
                    <div
                      key={item.key}
                      role="button"
                      tabIndex={0}
                      className={styles.square}
                      data-square={item.key}
                      aria-label={`${item.name}: ${item.papers.length} pinned. Open the full list.`}
                      onClick={() => setView(item.key)}
                      onKeyDown={(event) => {
                        if (event.key !== "Enter" && event.key !== " ") return;
                        event.preventDefault();
                        setView(item.key);
                      }}
                    >
                      <div className={styles.squareHead}>
                        <h2 className={styles.squareName}>{item.name}</h2>
                        <span className={styles.squareCount}>{item.papers.length}</span>
                      </div>
                      <SquareNotes items={item.papers} unit={unit} keyOf={(paper) => `${paper.kind}:${paper.itemId}`} render={renderNote} />
                    </div>
                  ))}
                </div>
              ))}
            </div>

            {sideShown ? (
              <aside className={styles.side} aria-label="Today's cleanings">
                <h2 className={styles.sideTitle}>Today&apos;s cleanings</h2>
                {progress}
                {data && total === 0 ? <p className={styles.empty}>No cleanings on the schedule today.</p> : null}
                <Fitting items={cleanings} unit={unit} row={CLEANING_ROW} tick={tick} keyOf={(cleaning) => cleaning.key} render={renderCleaning} />
              </aside>
            ) : null}
          </div>
        ) : (
          // An opened list takes the middle of the screen; the top strip and the company rule stay.
          <section className={`${styles.open} ${showing === "square" ? styles.openSquare : ""}`} aria-label={showing === "cleanings" ? "Today's cleanings" : (opened?.name ?? "")} data-tv-open={showing}>
            <div className={styles.openHead}>
              <div className={styles.openTitleBox}>
                <h2 className={styles.openTitle}>{showing === "cleanings" ? "Today's cleanings" : opened?.name}</h2>
                {showing === "cleanings" ? progress : <p className={styles.openCount}>{opened?.papers.length} pinned</p>}
              </div>
              {backButton}
            </div>
            {showing === "cleanings" ? (
              <>
                {data && total === 0 ? <p className={styles.empty}>No cleanings on the schedule today.</p> : null}
                <Paged items={cleanings} unit={unit} row={CLEANING_ROW} tick={tick} keyOf={(cleaning) => cleaning.key} render={renderCleaning} />
              </>
            ) : (
              <Paged items={opened?.papers ?? []} unit={unit} row={NOTE_ROW} tick={tick} keyOf={(paper) => `${paper.kind}:${paper.itemId}`} render={renderNote} />
            )}
          </section>
        )}

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
