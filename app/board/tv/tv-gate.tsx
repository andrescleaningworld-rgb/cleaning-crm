"use client";

// What a TV shows at /tv (or /board/tv): the board when it is allowed to, and
// otherwise a big 6-digit code and a QR code. The owner taps "Show on TV" on
// the board, types the code (or scans the QR), and this TV switches to the
// board. The TV remembers it is connected until it is disconnected in
// Settings -> Team.
//
// Three ways in, tried in this order:
//   1. a TV link pasted into the address bar (?k=...)
//   2. staff looking at TV mode from the board's tabs (logged in)
//   3. this TV's own secret, kept in this browser, once the owner connected it

import QRCode from "qrcode";
import { useCallback, useEffect, useRef, useState } from "react";
import { exitFullScreen } from "../full-screen";
import TvClient from "./tv-client";
import styles from "./tv.module.css";

const SECRET_KEY = "cwTvSecret";
const ASK_EVERY_MS = 3_000;
/** How many TV screens are up in this page: 1 on /board/tv, 0 once it is left. */
let tvScreens = 0;

type Mode = { kind: "checking" } | { kind: "board"; token: string } | { kind: "code"; code: string; secondsLeft: number } | { kind: "problem"; text: string };

function newSecret(): string {
  const bytes = new Uint8Array(24);
  window.crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** This TV's own secret. Kept in this browser; made the first time. "" when the browser keeps nothing. */
function readSecret(renew = false): string {
  try {
    let secret = renew ? "" : (window.localStorage.getItem(SECRET_KEY) ?? "");
    if (secret.length < 20) {
      secret = newSecret();
      window.localStorage.setItem(SECRET_KEY, secret);
    }
    return secret;
  } catch {
    return "";
  }
}

export default function TvGate({ token }: { token: string }) {
  const [mode, setMode] = useState<Mode>(token ? { kind: "board", token } : { kind: "checking" });
  const [qr, setQr] = useState("");
  const secret = useRef("");

  // While TV mode is up, the rest of the app is hidden (globals.css: html[data-tv-mode]).
  // Leaving TV mode, by any road, also ends full screen.
  useEffect(() => {
    tvScreens += 1;
    document.documentElement.setAttribute("data-tv-mode", "1");
    return () => {
      tvScreens -= 1;
      // Checked a moment later: in development React takes a screen down and puts it straight back.
      window.setTimeout(() => {
        if (tvScreens > 0) return;
        document.documentElement.removeAttribute("data-tv-mode");
        void exitFullScreen();
      }, 0);
    };
  }, []);

  /** Asks for this TV's code, or learns that it has been connected. */
  const ask = useCallback(async () => {
    try {
      if (!secret.current) secret.current = readSecret();
      if (!secret.current) return setMode({ kind: "problem", text: "This TV's browser does not keep anything, so it cannot stay connected. Use Copy TV link on the board instead." });
      const send = async () => {
        const response = await fetch("/api/board/tv/pair", { method: "POST", headers: { "Content-Type": "application/json" }, cache: "no-store", body: JSON.stringify({ secret: secret.current }) });
        const answer = (await response.json()) as { success?: boolean; ready?: boolean; state?: string; code?: string; secondsLeft?: number };
        if (!response.ok || answer.success !== true) throw new Error("failed");
        return answer;
      };
      let body = await send();
      if (body.state === "renew") {
        // Disconnected earlier: this TV starts over with a new secret and asks again.
        secret.current = readSecret(true);
        body = await send();
      }
      if (body.ready !== true) return setMode({ kind: "problem", text: "The Pin Board is not turned on here yet." });
      if (body.state === "connected") return setMode({ kind: "board", token: secret.current });
      if (body.state === "busy") return setMode({ kind: "problem", text: "Too many TVs are waiting for a code. Try again in a few minutes." });
      if (body.state === "waiting" && body.code) setMode({ kind: "code", code: body.code, secondsLeft: body.secondsLeft ?? 0 });
    } catch {
      // Keep showing the code it has; it asks again in a moment.
      setMode((current) => (current.kind === "checking" ? { kind: "problem", text: "The code did not load. It will try again." } : current));
    }
  }, []);

  // No TV link in the address: is someone on staff logged in here? Otherwise this TV's own secret.
  useEffect(() => {
    if (token) return;
    let alive = true;
    void (async () => {
      try {
        const response = await fetch("/api/board/tv", { cache: "no-store" });
        if (alive && response.ok) return setMode({ kind: "board", token: "" });
      } catch {
        // Not reachable right now: fall through to the code, which keeps trying.
      }
      if (alive) void ask();
    })();
    return () => {
      alive = false;
    };
  }, [token, ask]);

  // While the code is showing (or did not load), keep asking.
  const waiting = mode.kind === "code" || mode.kind === "problem";
  useEffect(() => {
    if (!waiting || token) return;
    const timer = window.setInterval(() => void ask(), ASK_EVERY_MS);
    return () => window.clearInterval(timer);
  }, [waiting, token, ask]);

  // The QR code opens "Show on TV" on a phone with the code already typed.
  const code = mode.kind === "code" ? mode.code : "";
  useEffect(() => {
    if (!code) return;
    let alive = true;
    QRCode.toDataURL(`${window.location.origin}/board?tv=${code}`, { margin: 1, width: 360 })
      .then((url) => alive && setQr(url))
      .catch(() => alive && setQr(""));
    return () => {
      alive = false;
    };
  }, [code]);

  if (mode.kind === "board") {
    // A TV connected with a code goes back to showing a code when it is disconnected.
    const mine = !token && mode.token !== "";
    return (
      <TvClient
        token={mode.token}
        onDenied={
          mine
            ? () => {
                setMode({ kind: "checking" });
                void ask();
              }
            : undefined
        }
      />
    );
  }

  if (mode.kind === "checking") {
    return (
      <div className={styles.message}>
        <p className={styles.messageTitle}>One moment</p>
      </div>
    );
  }

  if (mode.kind === "problem") {
    return (
      <div className={styles.message}>
        <p className={styles.messageTitle}>Not connected</p>
        <p>{mode.text}</p>
      </div>
    );
  }

  const minutes = Math.max(1, Math.ceil(mode.secondsLeft / 60));
  return (
    <div className={styles.pair}>
      <p className={styles.pairBrand}>Cleaning World</p>
      <h1 className={styles.pairTitle}>Show the board on this TV</h1>
      <div className={styles.pairRow}>
        <div className={styles.pairSide}>
          <p className={styles.pairStep}>On your phone, open the Board, tap Show on TV, and type:</p>
          <p className={styles.pairCode} aria-label={`Code ${mode.code.split("").join(" ")}`} data-tv-code={mode.code}>
            {mode.code.slice(0, 3)} {mode.code.slice(3)}
          </p>
          <p className={styles.pairNote}>
            This code works for {minutes} more minute{minutes === 1 ? "" : "s"}. A new one shows by itself after that.
          </p>
        </div>
        {qr ? (
          <div className={styles.pairSide}>
            <p className={styles.pairStep}>Or point your phone&apos;s camera here:</p>
            {/* A generated picture of the code's link; nothing to optimize. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={qr} alt="QR code to connect this TV" className={styles.pairQr} />
          </div>
        ) : null}
      </div>
    </div>
  );
}
