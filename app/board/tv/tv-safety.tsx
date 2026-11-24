"use client";

// A safety net around the TV's board. If drawing the board fails (an older TV
// browser that cannot run something), the TV does not go black: it says so in
// big words and tries again by itself, after 1 minute, then 2, 4, 8, and at
// most every 10 minutes, so it can never get stuck reloading fast.
//
// Each error is also sent to /api/board/tv/report, so it shows in the Vercel
// logs: only the message, a trimmed stack, the browser's name and version and
// the time (lib/tvErrorReport.ts scrubs them first). Never the page address,
// the TV's key or any token. At most a few reports per page, no repeats.

import { Component, Fragment, useEffect, type ErrorInfo, type ReactNode } from "react";
import { TV_REPORT_LIMITS, tvErrorReport } from "@/lib/tvErrorReport";
import styles from "./tv.module.css";

const FIRST_WAIT_MS = 60_000;
const LONGEST_WAIT_MS = 10 * 60_000;
/** A board that has stayed up this long since the last error starts again from the 1-minute wait. */
const CALM_MS = 15 * 60_000;
const MAX_REPORTS = 5;

let reportsSent = 0;
const reported = new Set<string>();

/** Sends one error to the server log. Never throws, never repeats the same message, at most a few per page. */
export function reportTvError(error: unknown, extraStack = ""): void {
  try {
    const raw = error instanceof Error ? error : new Error(String(error ?? "unknown error"));
    const report = tvErrorReport({
      message: `${raw.name}: ${raw.message}`,
      stack: `${raw.stack ?? ""}${extraStack ? `\n${extraStack}` : ""}`,
      browser: typeof navigator === "undefined" ? "" : navigator.userAgent,
      at: new Date().toISOString(),
    });
    if (reported.has(report.message) || reportsSent >= MAX_REPORTS) return;
    reported.add(report.message);
    reportsSent += 1;
    const body = JSON.stringify(report).slice(0, TV_REPORT_LIMITS.body);
    void fetch("/api/board/tv/report", { method: "POST", headers: { "Content-Type": "application/json" }, body, keepalive: true }).catch(() => null);
  } catch {
    // Reporting must never be the next problem.
  }
}

/** Errors outside drawing (timers, promises): reported only, the board carries on. */
export function TvErrorListener() {
  useEffect(() => {
    const onError = (event: ErrorEvent) => reportTvError(event.error ?? event.message);
    const onRejection = (event: PromiseRejectionEvent) => reportTvError(event.reason);
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);
  return null;
}

type State = { failed: boolean; tries: number; lastErrorAt: number; round: number };

export class TvSafety extends Component<{ children: ReactNode }, State> {
  state: State = { failed: false, tries: 0, lastErrorAt: 0, round: 0 };
  private timer = 0;

  static getDerivedStateFromError(): Partial<State> {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    reportTvError(error, info.componentStack ?? "");
    const now = Date.now();
    // Calm for a while before this error: back to the short wait.
    const tries = now - this.state.lastErrorAt > CALM_MS ? 1 : this.state.tries + 1;
    this.setState({ tries, lastErrorAt: now });
    window.clearTimeout(this.timer);
    const wait = Math.min(LONGEST_WAIT_MS, FIRST_WAIT_MS * 2 ** (tries - 1));
    // Trying again puts a fresh board up: it loads its data again from the start.
    this.timer = window.setTimeout(() => this.setState((state) => ({ failed: false, round: state.round + 1 })), wait);
  }

  componentWillUnmount(): void {
    window.clearTimeout(this.timer);
  }

  render() {
    if (this.state.failed) {
      const minutes = Math.round(Math.min(LONGEST_WAIT_MS, FIRST_WAIT_MS * 2 ** Math.max(0, this.state.tries - 1)) / 60_000);
      return (
        <div className={styles.message} data-tv-problem>
          <p className={styles.messageTitle}>The board hit a problem</p>
          <p>
            Trying again in {minutes} minute{minutes === 1 ? "" : "s"}. If it keeps happening, tell the office.
          </p>
        </div>
      );
    }
    return (
      <>
        <TvErrorListener />
        <Fragment key={this.state.round}>{this.props.children}</Fragment>
      </>
    );
  }
}
