"use client";

// Auto logout for staff on a desktop computer (rules: lib/idleLogout.ts). Any
// mouse, keyboard or scroll use on any tab counts as active; background data
// refreshes do not. A "Still there?" warning shows first. It uses the normal
// /api/logout, then opens the login page, which returns to the same page.

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { BigButton } from "@/app/ui";
import { DESKTOP_QUERY, idleStep, idleWatched } from "@/lib/idleLogout";

const LAST_ACTIVE_KEY = "cwLastActive";
/** How often the time is shared with the other tabs while someone is moving the mouse. */
const SHARE_EVERY_MS = 5_000;
const EVENTS = ["mousemove", "mousedown", "keydown", "wheel", "pointerdown", "touchstart", "scroll"] as const;
// The same identity notes the Logout button clears (LogoutButton.tsx).
const IDENTITY_KEYS = ["cwRole", "cwUserRole", "userRole", "cwAdminLoggedIn", "isAdminLoggedIn", "cwManagerId"];

function stored(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function store(key: string, value: string | null): void {
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch {
    // Private mode: this tab still keeps its own time.
  }
}

/** A page that would ask "Leave this page?" right now has work running. */
function workInProgress(): boolean {
  const question = new Event("beforeunload", { cancelable: true });
  window.dispatchEvent(question);
  return question.defaultPrevented;
}

const toLogin = () => window.location.assign(`/login?next=${encodeURIComponent(`${window.location.pathname}${window.location.search}`)}`);

export default function IdleLogout() {
  const pathname = usePathname();
  const path = useRef(pathname);
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const warning = useRef<HTMLDivElement>(null);

  // Just logged in: the clock starts now.
  useEffect(() => {
    if (path.current === "/login" && pathname !== "/login") store(LAST_ACTIVE_KEY, String(Date.now()));
    path.current = pathname;
  }, [pathname]);

  useEffect(() => {
    if (!window.matchMedia(DESKTOP_QUERY).matches) return;
    let here = 0;
    let shared = 0;
    let leaving = false;
    if (!Number(stored(LAST_ACTIVE_KEY))) {
      here = Date.now();
      store(LAST_ACTIVE_KEY, String(here));
    }

    async function logOut() {
      if (leaving) return;
      leaving = true;
      const run = async () => {
        const response = await fetch("/api/logout", { method: "POST" });
        if (!response.ok) throw new Error("logout failed");
        for (const key of IDENTITY_KEYS) store(key, null);
        store(LAST_ACTIVE_KEY, null);
        toLogin();
      };
      try {
        // Several tabs: only one calls the server. The others follow when the staff note goes.
        if (navigator.locks) await navigator.locks.request("cw-idle-logout", { ifAvailable: true }, async (lock) => (lock ? run() : undefined));
        else await run();
      } catch {
        // No connection: tried again on the next check, so the computer never stays signed in by accident.
      } finally {
        leaving = false;
      }
    }

    function check() {
      if (!idleWatched(path.current) || stored("cwRole") !== "admin") return setSecondsLeft(null);
      const state = idleStep(Date.now(), Math.max(here, Number(stored(LAST_ACTIVE_KEY)) || 0));
      // A photo import is running (the page asks before closing): that counts as active, on every tab.
      if (state.step !== "active" && workInProgress()) return active();
      setSecondsLeft(state.step === "warn" ? state.secondsLeft : state.step === "logout" ? 0 : null);
      if (state.step === "logout") void logOut();
    }

    function active() {
      const now = Date.now();
      here = now;
      if (now - shared >= SHARE_EVERY_MS) {
        shared = now;
        store(LAST_ACTIVE_KEY, String(now));
      }
      setSecondsLeft(null);
    }

    // Logged out in another tab: this one does not stay open on staff data.
    function otherTab(event: StorageEvent) {
      if (event.key === "cwRole" && event.oldValue === "admin" && event.newValue === null && idleWatched(path.current)) toLogin();
      if (event.key === LAST_ACTIVE_KEY) check();
    }

    const options = { passive: true, capture: true } as const;
    for (const name of EVENTS) window.addEventListener(name, active, options);
    window.addEventListener("storage", otherTab);
    // Back from sleep or from another window: checked right away.
    window.addEventListener("focus", check);
    document.addEventListener("visibilitychange", check);
    const first = window.setTimeout(check, 0);
    const timer = window.setInterval(check, 1_000);
    return () => {
      for (const name of EVENTS) window.removeEventListener(name, active, options);
      window.removeEventListener("storage", otherTab);
      window.removeEventListener("focus", check);
      document.removeEventListener("visibilitychange", check);
      window.clearTimeout(first);
      window.clearInterval(timer);
    };
  }, []);

  // Above any open form sheet, without taking the cursor out of what someone is typing.
  const showing = secondsLeft !== null;
  useEffect(() => {
    const box = warning.current;
    if (showing && box?.showPopover && !box.matches(":popover-open")) box.showPopover();
  }, [showing]);

  if (secondsLeft === null) return null;
  return (
    <div
      ref={warning}
      popover="manual"
      role="alertdialog"
      aria-label="Still there?"
      className="no-print"
      data-idle-warning
      style={{ position: "fixed", inset: "auto 16px 16px auto", margin: 0, maxWidth: "min(360px, calc(100vw - 32px))", padding: 16, background: "#fff", color: "#0f172a", border: "3px solid #b45309", borderRadius: 14, boxShadow: "0 8px 30px rgba(15, 23, 42, 0.3)", zIndex: 1000 }}
    >
      <p className="ui-strong" style={{ margin: "0 0 4px", fontSize: 20 }}>Still there?</p>
      <p style={{ margin: "0 0 12px" }}>You will be logged out in {secondsLeft} second{secondsLeft === 1 ? "" : "s"}.</p>
      <BigButton onClick={() => setSecondsLeft(null)}>Stay logged in</BigButton>
    </div>
  );
}
