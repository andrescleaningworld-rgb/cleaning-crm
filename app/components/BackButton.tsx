"use client";

// The one Back button of the app. It works like the browser's back button:
// when the page before this one (in this tab) is a page of the app, Back goes
// there. When there is none (a link opened in a new tab, from a text, a
// bookmark), it goes to the page's fallback instead: the parent the page names
// (Account → Accounts, Visit → Visits, a sub portal screen → the sub portal),
// or home.
//
// <Screen> (app/ui/core.tsx) and the navy bar (CWHeader.tsx) both draw their
// back arrow with it, so every screen gets this without naming it. A page
// that draws its own Back link can use it directly.

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, type MouseEvent, type ReactNode } from "react";

// Screens that are never a place to go back to: the sign-in screens.
const SKIP = /\/login(\/|$)|^\/portal\/(forgot|set-password)/;

// Older browsers without the Navigation API: how many times the page changed
// inside the app since this tab loaded it. Reset by a full page load.
let movesInApp = 0;
let lastPath = "";
let pathBefore = "";

type NavEntry = { url: string | null; index: number };
type NavApi = { canGoBack: boolean; currentEntry: NavEntry | null; entries: () => NavEntry[] };

function previousPagePath(): string | null {
  if (typeof window === "undefined") return null;
  const nav = (window as unknown as { navigation?: NavApi }).navigation;
  if (nav && nav.currentEntry && typeof nav.entries === "function") {
    // Only same-site pages are in this list, so "one before" is a page of the app.
    if (!nav.canGoBack) return null;
    const before = nav.entries().find((entry) => entry.index === (nav.currentEntry?.index ?? 0) - 1);
    if (!before?.url) return null;
    try {
      const url = new URL(before.url);
      return url.origin === window.location.origin ? url.pathname : null;
    } catch {
      return null;
    }
  }
  return movesInApp > 0 && window.history.length > 1 ? pathBefore : null;
}

/** True when Back can go to the page before this one, inside the app. */
export function canGoBackInApp(): boolean {
  const path = previousPagePath();
  return path !== null && !SKIP.test(path);
}

/** Mounted once in the root layout: counts page changes for browsers without the Navigation API. */
export function NavHistoryTracker() {
  const pathname = usePathname();
  useEffect(() => {
    if (lastPath && pathname !== lastPath) {
      movesInApp += 1;
      pathBefore = lastPath;
    }
    lastPath = pathname;
  }, [pathname]);
  return null;
}

/**
 * A Back link. Looks like whatever `className` says (pass the same class the
 * old Back link had). Goes back in the app's history, or to `fallback`.
 * A middle-click or "open in new tab" opens the fallback.
 */
export default function BackButton({
  fallback = "/",
  className,
  ariaLabel = "Back",
  children,
}: {
  /** Where Back goes when there is no earlier app page in this tab. Default home. */
  fallback?: string;
  className?: string;
  ariaLabel?: string;
  children: ReactNode;
}) {
  const router = useRouter();
  function onClick(event: MouseEvent<HTMLAnchorElement>) {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    if (!canGoBackInApp()) return; // The link itself goes to the fallback.
    event.preventDefault();
    router.back();
  }
  return (
    <Link href={fallback} className={className} aria-label={ariaLabel} onClick={onClick}>
      {children}
    </Link>
  );
}
