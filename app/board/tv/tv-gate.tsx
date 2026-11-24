"use client";

// What a TV shows at /tv (or /board/tv): the board when it is allowed to, and
// otherwise a big code like K7P-3QX and a QR code. The owner types the code in
// Settings -> TV links (or Show on TV on the board, or scans the QR), and this
// TV switches to the board. The TV remembers it is connected until that link
// is turned off.
//
// Three ways in, tried in this order:
//   1. a TV link pasted into the address bar (?k=...)
//   2. staff looking at TV mode from the board's tabs (logged in)
//   3. this TV's own secret, kept in this browser, once the owner connected it
// Once 3 says "connected", the page opens again as 1, with that secret as its
// key: on the office Fire Stick only a board opened from its address kept
// asking for fresh data. A TV whose link is turned off goes back to a code.

import QRCode from "qrcode";
import { useCallback, useEffect, useRef, useState } from "react";
import { showTvCode } from "@/lib/board";
import TvClient from "./tv-client";
import { TvSafety } from "./tv-safety";
import styles from "./tv.module.css";

const SECRET_KEY = "cwTvSecret";

const MOVED_KEY = "cwTvMovedAt";
/** At most one move to the address with the key in this long, so two pages can never send the TV back and forth. */
const MOVE_GAP_MS = 30_000;

/**
 * This page again, with the TV's key in the address (?k=), keeping anything else there (?slideshow=now).
 * False when it moved there moments ago already (or the browser keeps nothing): the board opens here instead.
 */
function openWithKey(key: string): boolean {
  try {
    const last = Number(window.sessionStorage.getItem(MOVED_KEY)) || 0;
    if (Date.now() - last < MOVE_GAP_MS) return false;
    window.sessionStorage.setItem(MOVED_KEY, String(Date.now()));
    const url = new URL(window.location.href);
    url.searchParams.set("k", key);
    window.location.replace(url.toString());
    return true;
  } catch {
    return false;
  }
}

/** This page again without a key, so the TV asks for a code (its link was turned off). */
function openWithoutKey(): void {
  const url = new URL(window.location.href);
  url.searchParams.delete("k");
  window.location.replace(url.toString());
}
/** The board's blue (tv.module.css .tv), behind everything while TV mode is up. */
const TV_BLUE = "#0c447c";
/** Resizes are acted on once they have stopped for this long, and only when the height moved more than this. */
const RESIZE_WAIT_MS = 150;
const SIZE_SLACK_PX = 2;
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
  // Leaving TV mode puts the page back the way it was. Full screen is left alone: only a button press changes it.
  useEffect(() => {
    tvScreens += 1;
    const html = document.documentElement;
    html.setAttribute("data-tv-mode", "1");
    // Any gap a TV browser leaves (its toolbar sliding away) shows the board's blue, never white.
    const before = [html.style.background, document.body.style.background];
    html.style.background = TV_BLUE;
    document.body.style.background = TV_BLUE;
    // The real visible height, for a TV browser without "dvh" (tv.module.css: --vh). Measured again
    // whenever the window, the screen's turn or the visible part changes (Silk's toolbar hiding).
    // Only a real change (more than 2px) is written, and only once a burst of resizes has settled.
    // Writing --vh changes only the board's own fixed box, never the page, so it cannot cause another resize.
    let applied = -1;
    const sizeUp = () => {
      const height = window.visualViewport?.height || window.innerHeight;
      if (height <= 0 || Math.abs(height - applied) <= SIZE_SLACK_PX) return;
      applied = height;
      html.style.setProperty("--vh", `${height / 100}px`);
    };
    sizeUp();
    let timer = 0;
    const later = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(sizeUp, RESIZE_WAIT_MS);
    };
    window.addEventListener("resize", later);
    window.addEventListener("orientationchange", later);
    window.visualViewport?.addEventListener("resize", later);
    return () => {
      tvScreens -= 1;
      window.clearTimeout(timer);
      window.removeEventListener("resize", later);
      window.removeEventListener("orientationchange", later);
      window.visualViewport?.removeEventListener("resize", later);
      // Checked a moment later: in development React takes a screen down and puts it straight back.
      // Full screen is not ended here: only a button press turns it on or off ("Exit TV mode" ends it).
      window.setTimeout(() => {
        if (tvScreens > 0) return;
        html.removeAttribute("data-tv-mode");
        html.style.removeProperty("--vh");
        html.style.background = before[0];
        document.body.style.background = before[1];
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
      // Connected: the board opens with this TV's key in the address, the same way a TV link opens it.
      // On the office Fire Stick a board that started here, after the code screen, got its data once and
      // then stopped asking for more until the page was reloaded; one opened from its address keeps going.
      if (body.state === "connected") {
        if (!openWithKey(secret.current)) setMode({ kind: "board", token: secret.current });
        return;
      }
      if (body.state === "busy") return setMode({ kind: "problem", text: "Too many TVs are waiting for a code. Try again in a few minutes." });
      if (body.state === "waiting" && body.code) setMode({ kind: "code", code: body.code, secondsLeft: body.secondsLeft ?? 0 });
    } catch {
      // Keep showing the code it has; it asks again in a moment.
      setMode((current) => (current.kind === "checking" ? { kind: "problem", text: "The code did not load. It will try again." } : current));
    }
  }, []);

  // A TV link in the address is kept as this TV's secret, so next time just /tv opens the board.
  // It stays a normal TV link: Turn off in Settings still logs this TV out, and it shows a code again.
  useEffect(() => {
    if (!token || token.length < 20 || token.length > 100) return;
    try {
      window.localStorage.setItem(SECRET_KEY, token);
    } catch {
      // A browser that keeps nothing: the link in the address still works this time.
    }
  }, [token]);

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

  // This TV's link was turned off in Settings. With its key in the address: open the page without it, so
  // it asks for a code (its old key is renewed there). The same function every time, so the board's own
  // refresh is never set up again by a re-draw of this page.
  const whenTurnedOff = useCallback(() => {
    if (token) return openWithoutKey();
    setMode({ kind: "checking" });
    void ask();
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
    // The safety net: a board that fails to draw says so and tries again by itself, never a black screen.
    // A TV whose link is turned off goes back to showing a code (staff looking at TV mode do not).
    return (
      <TvSafety>
        <TvClient token={mode.token} onDenied={mode.token ? whenTurnedOff : undefined} />
      </TvSafety>
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
          <p className={styles.pairStep}>Go to Settings → TV links on your computer and enter this code.</p>
          <p className={styles.pairCode} aria-label={`Code ${mode.code.split("").join(" ")}`} data-tv-code={mode.code}>
            {showTvCode(mode.code)}
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
