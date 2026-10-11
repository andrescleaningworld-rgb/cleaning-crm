// Real full screen for TV mode (no browser tabs, address bar or toolbars).
//
// A browser only goes full screen from inside a click, so the board's
// "TV Mode (Full Screen)" button calls enterFullScreen() in its own click and
// then opens /board/tv; full screen stays on across that move because the
// page is not reloaded. The older "webkit" names are tried too, for a TV
// browser that only knows those.

type FullScreenDocument = Document & {
  webkitFullscreenEnabled?: boolean;
  webkitFullscreenElement?: Element | null;
  webkitExitFullscreen?: () => Promise<void> | void;
};
type FullScreenElement = HTMLElement & { webkitRequestFullscreen?: () => Promise<void> | void };

/** The event that says full screen started or ended, under both of its names. */
export const FULL_SCREEN_EVENTS = ["fullscreenchange", "webkitfullscreenchange"] as const;

/** Can this browser go full screen when asked? (Some TV browsers, and pages inside a frame, cannot.) */
export function fullScreenSupported(): boolean {
  if (typeof document === "undefined") return false;
  const doc = document as FullScreenDocument;
  const element = document.documentElement as FullScreenElement;
  const can = typeof element.requestFullscreen === "function" || typeof element.webkitRequestFullscreen === "function";
  return can && (doc.fullscreenEnabled ?? doc.webkitFullscreenEnabled ?? true) !== false;
}

/** Full screen that the page asked for (not the F11 kind, which the page cannot see or end). */
export function inFullScreen(): boolean {
  if (typeof document === "undefined") return false;
  const doc = document as FullScreenDocument;
  return Boolean(doc.fullscreenElement ?? doc.webkitFullscreenElement);
}

/** Nothing of the browser showing: full screen that the page asked for, or F11. */
export function fillsTheScreen(): boolean {
  if (typeof window === "undefined") return false;
  if (inFullScreen()) return true;
  if (typeof window.matchMedia === "function" && window.matchMedia("(display-mode: fullscreen)").matches) return true;
  return window.screen.height > 0 && window.innerHeight >= window.screen.height;
}

/** Call from inside a click. True when the browser went (or already was) full screen. */
export async function enterFullScreen(): Promise<boolean> {
  if (inFullScreen()) return true;
  if (!fullScreenSupported()) return false;
  try {
    const element = document.documentElement as FullScreenElement;
    if (typeof element.requestFullscreen === "function") await element.requestFullscreen();
    else await element.webkitRequestFullscreen?.();
    return inFullScreen();
  } catch {
    // Blocked (no click behind it, or a browser setting): the caller falls back.
    return false;
  }
}

export async function exitFullScreen(): Promise<void> {
  if (!inFullScreen()) return;
  try {
    const doc = document as FullScreenDocument;
    if (typeof doc.exitFullscreen === "function") await doc.exitFullscreen();
    else await doc.webkitExitFullscreen?.();
  } catch {
    // Already ended.
  }
}
