"use client";

// Office TV mode: the board and "Today's cleanings", taking turns every 30
// seconds. Nothing here can be tapped. It asks for fresh data every minute.
//
// The one exception: staff who opened TV mode from the board's tabs (logged
// in, no TV link) get a small "Exit TV mode" button when they move the
// mouse. A TV opened with its secret link never shows it: there is nothing
// behind it for that TV to go back to.

import Link from "next/link";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { MOTTO } from "@/app/ui";
import type { BoardManager, BoardSettings, Paper } from "@/lib/board";
import { STATUS_LABEL, type CleaningStatus } from "@/lib/cleanings";
import BoardCanvas from "../board-canvas";
import styles from "./tv.module.css";

type TvCleaning = { accountName: string; sub: string; status: CleaningStatus };
type TvData = {
  today: string;
  settings: BoardSettings;
  managers: BoardManager[];
  papers: Paper[];
  counters: { pinned: number; stuck: number; doneToday: number };
  cleanings: TvCleaning[];
};

const REFRESH_MS = 60_000;
const ROTATE_MS = 30_000;

/** Shrinks its content to fit the space it has, so a full board never needs scrolling on the TV. */
function FitToScreen({ children, watch }: { children: React.ReactNode; watch: unknown }) {
  const outer = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  useLayoutEffect(() => {
    const fit = () => {
      if (!outer.current || !inner.current) return;
      const room = outer.current.clientHeight;
      const need = inner.current.scrollHeight;
      setScale(need > room && need > 0 ? Math.max(0.35, room / need) : 1);
    };
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, [watch]);
  return (
    <div ref={outer} className={styles.fit}>
      <div ref={inner} style={{ transform: `scale(${scale})`, transformOrigin: "top center", width: `${100 / scale}%`, marginLeft: `${(100 - 100 / scale) / 2}%` }}>
        {children}
      </div>
    </div>
  );
}

const EXIT_SHOWN_MS = 3_000;

/** "Exit TV mode": shows when the mouse moves, hides again after 3 seconds. Never for a TV link. */
function ExitButton({ token }: { token: string }) {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    if (token) return;
    let timer = 0;
    const show = () => {
      setShown(true);
      window.clearTimeout(timer);
      timer = window.setTimeout(() => setShown(false), EXIT_SHOWN_MS);
    };
    window.addEventListener("mousemove", show);
    return () => {
      window.removeEventListener("mousemove", show);
      window.clearTimeout(timer);
    };
  }, [token]);
  if (token || !shown) return null;
  return (
    <Link href="/board" className={styles.exit}>
      Exit TV mode
    </Link>
  );
}

export default function TvClient({ token }: { token: string }) {
  const [data, setData] = useState<TvData | null>(null);
  const [problem, setProblem] = useState<"" | "off" | "denied" | "failed">("");
  const [screen, setScreen] = useState<"board" | "today">("board");
  const [clock, setClock] = useState("");

  const load = useCallback(async () => {
    try {
      const response = await fetch(`/api/board/tv${token ? `?k=${encodeURIComponent(token)}` : ""}`, { cache: "no-store" });
      if (response.status === 401) return setProblem("denied");
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
    } catch {
      // Keep showing the last board; a TV should not go blank over one missed refresh.
      setProblem((current) => (current === "" ? "failed" : current));
    }
  }, [token]);

  useEffect(() => {
    void load();
    const refresh = window.setInterval(() => void load(), REFRESH_MS);
    const rotate = window.setInterval(() => setScreen((current) => (current === "board" ? "today" : "board")), ROTATE_MS);
    const tick = () => setClock(new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }));
    tick();
    const clockTimer = window.setInterval(tick, 5_000);
    return () => {
      window.clearInterval(refresh);
      window.clearInterval(rotate);
      window.clearInterval(clockTimer);
    };
  }, [load]);

  if (!data) {
    return (
      <div className={styles.message}>
        <ExitButton token={token} />
        <p className={styles.messageTitle}>
          {problem === "denied" ? "This TV link is off" : problem === "off" ? "The Pin Board is not turned on here yet" : problem === "failed" ? "The board did not load" : "Loading the board"}
        </p>
        {problem === "denied" ? <p>Ask the owner to make a new TV link in Settings.</p> : null}
        {problem === "failed" ? <p>It will try again in a minute.</p> : null}
      </div>
    );
  }

  const day = new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
  const done = data.cleanings.filter((cleaning) => cleaning.status === "cleaned").length;

  return (
    <div className={styles.tv} aria-live="off">
      <ExitButton token={token} />
      <header className={styles.top}>
        <div>
          <p className={styles.brand}>Cleaning World</p>
          <p className={styles.motto}>{MOTTO.en}</p>
        </div>
        <div className={styles.counters}>
          <div className={styles.counter}>
            <span className={styles.counterNumber}>{data.counters.pinned}</span>
            <span className={styles.counterLabel}>Pinned</span>
          </div>
          <div className={`${styles.counter} ${data.counters.stuck > 0 ? styles.counterBad : ""}`}>
            <span className={styles.counterNumber}>{data.counters.stuck}</span>
            <span className={styles.counterLabel}>Stuck too long</span>
          </div>
          <div className={`${styles.counter} ${styles.counterGood}`}>
            <span className={styles.counterNumber}>{data.counters.doneToday}</span>
            <span className={styles.counterLabel}>Done today</span>
          </div>
        </div>
        <div className={styles.clockBox}>
          <p className={styles.clock}>{clock}</p>
          <p className={styles.day}>{day}</p>
        </div>
      </header>

      {screen === "board" ? (
        <FitToScreen key="board" watch={data}>
          <BoardCanvas papers={data.papers} managers={data.managers} settings={data.settings} tv />
        </FitToScreen>
      ) : (
        <FitToScreen key="today" watch={data}>
          <section className={styles.today}>
            <h1 className={styles.todayTitle}>
              Today&apos;s cleanings
              <span className={styles.todayCount}>
                {done} of {data.cleanings.length} cleaned
              </span>
            </h1>
            {data.cleanings.length === 0 ? (
              <p className={styles.todayEmpty}>No cleanings on the schedule today.</p>
            ) : (
              <ul className={styles.todayGrid}>
                {data.cleanings.map((cleaning, index) => (
                  <li key={`${cleaning.accountName}-${index}`} className={`${styles.todayItem} ${styles[cleaning.status]}`}>
                    <span className={styles.todayName}>{cleaning.accountName}</span>
                    <span className={styles.todaySub}>{cleaning.sub || "No sub on the schedule"}</span>
                    <span className={styles.todayStatus}>{STATUS_LABEL[cleaning.status]}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </FitToScreen>
      )}
    </div>
  );
}
