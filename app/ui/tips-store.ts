// What first-time tips this person has already seen.
//
// Two memories, used together:
//   - this browser (always), so a tip never shows twice here even offline
//   - Postgres, for staff (/api/tips), so "Got it" on the phone also holds on
//     the computer. Subs and customers, and a database without the table,
//     simply keep the browser memory.
//
// A tip is per kind of screen ("to-do", "account"), never per record.

const SEEN_PREFIX = "cwTipsSeen:";
const OFF_KEY = "cwTipsOff";

let loaded: Promise<void> | null = null;
let serverReady = false;
const seen = new Set<string>();
let off = false;

function readLocal(key: string): string {
  try {
    return window.localStorage.getItem(key) ?? "";
  } catch {
    return "";
  }
}

function writeLocal(key: string, value: string) {
  try {
    if (value) window.localStorage.setItem(key, value);
    else window.localStorage.removeItem(key);
  } catch {
    // Private mode: nothing is kept here; the server memory still works for staff.
  }
}

const isStaff = () => readLocal("cwRole") === "admin";

function send(body: Record<string, unknown>) {
  if (!serverReady) return;
  void fetch("/api/tips", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), keepalive: true }).catch(() => {
    // The browser memory already has it; the server gets it on a later screen.
  });
}

/** Loads what the server remembers, once per page load. Never throws. */
export function loadTips(): Promise<void> {
  if (loaded) return loaded;
  off = readLocal(OFF_KEY) === "1";
  loaded = (async () => {
    if (!isStaff()) return;
    try {
      const response = await fetch("/api/tips", { cache: "no-store" });
      const data = (await response.json()) as { ready?: boolean; seen?: string[]; off?: boolean };
      if (!response.ok || data.ready !== true) return;
      serverReady = true;
      for (const id of data.seen ?? []) {
        seen.add(id);
        writeLocal(SEEN_PREFIX + id, "1");
      }
      if (data.off) {
        off = true;
        writeLocal(OFF_KEY, "1");
      } else if (off) {
        // Turned off on this device before the server knew: tell it.
        send({ off: true });
      }
      // Tips seen on this device before the server kept them: hand them over once.
      const local: string[] = [];
      try {
        for (let i = 0; i < window.localStorage.length; i++) {
          const key = window.localStorage.key(i) ?? "";
          if (key.startsWith(SEEN_PREFIX) && !seen.has(key.slice(SEEN_PREFIX.length))) local.push(key.slice(SEEN_PREFIX.length));
        }
      } catch {
        // Nothing to hand over.
      }
      if (local.length > 0) {
        for (const id of local) seen.add(id);
        send({ seen: local });
      }
    } catch {
      // Offline or logged out: the browser memory is used.
    }
  })();
  return loaded;
}

export const tipsAreOff = () => off;

export const tipWasSeen = (id: string) => seen.has(id) || readLocal(SEEN_PREFIX + id) === "1";

export function markTipSeen(id: string) {
  if (seen.has(id) && readLocal(SEEN_PREFIX + id) === "1") return;
  seen.add(id);
  writeLocal(SEEN_PREFIX + id, "1");
  send({ seen: [id] });
}

/** "Skip all" on a tip, and Settings -> "Don't show tips". */
export function setTipsOff(value: boolean) {
  off = value;
  writeLocal(OFF_KEY, value ? "1" : "");
  send({ off: value });
}
