"use client";

// UI kit, part 3: the pieces that make a screen feel alive on a phone.
//   <Tips>           first-time pop-up tips that point at the main buttons
//   <SwipeRow>       swipe a card left for quick actions
//   <PullToRefresh>  pull a list down to load it again
//   <Tile>           a big light-green action tile (icon + label)
// Styles are the .ui-* classes in app/globals.css.

import Link from "next/link";
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { addShellTips, SHOW_TIPS_EVENT } from "./shell";

/* ---------- Tips ---------- */

export type TipStep = {
  /** CSS selector of the thing the tip points at, e.g. '[data-tip="open"]'. */
  target: string;
  text: string;
};

const TIPS_SEEN_PREFIX = "cwTipsSeen:";

function firstVisible(selector: string): HTMLElement | null {
  for (const el of Array.from(document.querySelectorAll<HTMLElement>(selector))) {
    const rect = el.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) return el;
  }
  return null;
}

/**
 * Two or three short tips, shown one at a time the first time someone opens
 * a screen. "Got it" moves on; after the last one they never show again on
 * this device, until the "?" in the top bar is tapped.
 */
export function Tips({ id, steps, ready = true }: { id: string; steps: TipStep[]; ready?: boolean }) {
  // -1 = not showing.
  const [index, setIndex] = useState(-1);
  const [box, setBox] = useState<{ top: number; left: number; width: number; height: number } | null>(null);
  const bubbleRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    addShellTips(1);
    return () => addShellTips(-1);
  }, []);

  // First visit: start once the screen has its content.
  useEffect(() => {
    if (!ready) return;
    let seen = true;
    try {
      seen = window.localStorage.getItem(TIPS_SEEN_PREFIX + id) === "1";
    } catch {
      seen = true;
    }
    if (seen) return;
    const start = window.setTimeout(() => setIndex(0), 500);
    return () => window.clearTimeout(start);
  }, [id, ready]);

  // The "?" in the top bar.
  useEffect(() => {
    const show = () => setIndex(0);
    window.addEventListener(SHOW_TIPS_EVENT, show);
    return () => window.removeEventListener(SHOW_TIPS_EVENT, show);
  }, []);

  const finish = useCallback(() => {
    setIndex(-1);
    setBox(null);
    try {
      window.localStorage.setItem(TIPS_SEEN_PREFIX + id, "1");
    } catch {
      // Private mode: the tips simply show again next time.
    }
  }, [id]);

  // Point at the step's target; a step whose target is not on screen is skipped.
  useLayoutEffect(() => {
    if (index < 0) return;
    if (index >= steps.length) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      finish();
      return;
    }
    const target = firstVisible(steps[index].target);
    if (!target) {
      setIndex((value) => value + 1);
      return;
    }
    target.scrollIntoView({ block: "center", behavior: "auto" });
    const measure = () => {
      const rect = target.getBoundingClientRect();
      setBox({ top: rect.top, left: rect.left, width: rect.width, height: rect.height });
    };
    measure();
    window.addEventListener("scroll", measure, true);
    window.addEventListener("resize", measure);
    return () => {
      window.removeEventListener("scroll", measure, true);
      window.removeEventListener("resize", measure);
    };
  }, [index, steps, finish]);

  useEffect(() => {
    if (index >= 0 && box) bubbleRef.current?.querySelector("button")?.focus({ preventScroll: true });
  }, [index, box]);

  if (index < 0 || index >= steps.length || !box) return null;

  const viewportHeight = typeof window === "undefined" ? 800 : window.innerHeight;
  const below = box.top + box.height + 190 < viewportHeight;
  const last = index === steps.length - 1;

  return (
    <div className="ui-tip-layer" role="dialog" aria-label="Tip" onKeyDown={(event) => event.key === "Escape" && finish()}>
      <div className="ui-tip-ring" style={{ top: box.top - 6, left: box.left - 6, width: box.width + 12, height: box.height + 12 }} />
      <div
        ref={bubbleRef}
        className={`ui-tip ${below ? "ui-tip-below" : "ui-tip-above"}`}
        style={below ? { top: box.top + box.height + 16 } : { bottom: viewportHeight - box.top + 16 }}
      >
        <p className="ui-tip-text">{steps[index].text}</p>
        <div className="ui-tip-row">
          <span className="ui-tip-count">
            Tip {index + 1} of {steps.length}
          </span>
          <button type="button" className="ui-btn ui-btn-main ui-tip-btn" onClick={() => (last ? finish() : setIndex(index + 1))}>
            Got it
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---------- SwipeRow ---------- */

/**
 * Swipe the row left to uncover `actions` (two quick buttons). Everything in
 * `actions` must also be reachable another way (the More button), because a
 * mouse or keyboard cannot swipe.
 */
export function SwipeRow({ actions, children, className = "" }: { actions: ReactNode; children: ReactNode; className?: string }) {
  const contentRef = useRef<HTMLDivElement>(null);
  const actionsRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const drag = useRef<{ x: number; y: number; base: number; swiping: boolean | null } | null>(null);

  const place = (x: number, animate: boolean) => {
    const el = contentRef.current;
    if (!el) return;
    el.style.transition = animate ? "transform 0.16s ease" : "none";
    el.style.transform = x === 0 ? "" : `translateX(${x}px)`;
  };

  const width = () => actionsRef.current?.offsetWidth ?? 0;

  const settle = (next: boolean) => {
    setOpen(next);
    place(next ? -width() : 0, true);
  };

  // A tap anywhere else closes it.
  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) settle(false);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return (
    <div ref={rootRef} className={`ui-swipe ${className}`.trim()}>
      <div ref={actionsRef} className="ui-swipe-actions" aria-hidden={!open} inert={!open} onClick={() => settle(false)}>
        {actions}
      </div>
      <div
        ref={contentRef}
        className="ui-swipe-content"
        onTouchStart={(event) => {
          const touch = event.touches[0];
          drag.current = { x: touch.clientX, y: touch.clientY, base: open ? -width() : 0, swiping: null };
        }}
        onTouchMove={(event) => {
          const state = drag.current;
          if (!state) return;
          const touch = event.touches[0];
          const dx = touch.clientX - state.x;
          const dy = touch.clientY - state.y;
          // Decide once whether this finger is swiping sideways or scrolling the page.
          if (state.swiping === null) {
            if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
            state.swiping = Math.abs(dx) > Math.abs(dy);
          }
          if (!state.swiping) return;
          place(Math.max(-width(), Math.min(0, state.base + dx)), false);
        }}
        onTouchEnd={(event) => {
          const state = drag.current;
          drag.current = null;
          if (!state?.swiping) return;
          const dx = event.changedTouches[0].clientX - state.x;
          settle(state.base + dx < -width() / 2);
        }}
        onTouchCancel={() => {
          drag.current = null;
          settle(open);
        }}
      >
        {children}
      </div>
    </div>
  );
}

/* ---------- PullToRefresh ---------- */

const PULL_TRIGGER = 70;

/**
 * Pull the page down from its very top to load the list again. Listens on
 * the whole page (a list can start below the fold), and shows a small
 * message under the top bar while pulling.
 */
export function PullToRefresh({ onRefresh, children }: { onRefresh: () => Promise<unknown> | void; children?: ReactNode }) {
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const onRefreshRef = useRef(onRefresh);
  useEffect(() => {
    onRefreshRef.current = onRefresh;
  });

  useEffect(() => {
    // The browser's own pull-to-reload would reload the whole app instead.
    const root = document.documentElement;
    const before = root.style.overscrollBehaviorY;
    root.style.overscrollBehaviorY = "contain";

    let start: { x: number; y: number; pulling: boolean | null } | null = null;
    let distance = 0;
    let busy = false;

    const onStart = (event: TouchEvent) => {
      start = null;
      distance = 0;
      if (busy || window.scrollY > 0) return;
      // Not while a sheet or a tip is open.
      const target = event.target as Element | null;
      if (target?.closest?.("dialog, .ui-tip-layer")) return;
      const touch = event.touches[0];
      start = { x: touch.clientX, y: touch.clientY, pulling: null };
    };
    const onMove = (event: TouchEvent) => {
      if (!start) return;
      const touch = event.touches[0];
      const dy = touch.clientY - start.y;
      const dx = touch.clientX - start.x;
      if (start.pulling === null) {
        if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
        start.pulling = dy > 0 && Math.abs(dy) > Math.abs(dx) && window.scrollY <= 0;
      }
      if (!start.pulling) return;
      distance = Math.min(110, Math.max(0, dy / 2));
      setPull(distance);
    };
    const onEnd = () => {
      const wasPulling = start?.pulling;
      start = null;
      setPull(0);
      if (!wasPulling || distance < PULL_TRIGGER) return;
      busy = true;
      setRefreshing(true);
      Promise.resolve(onRefreshRef.current())
        .catch(() => {})
        .finally(() => {
          busy = false;
          setRefreshing(false);
        });
    };

    window.addEventListener("touchstart", onStart, { passive: true });
    window.addEventListener("touchmove", onMove, { passive: true });
    window.addEventListener("touchend", onEnd);
    window.addEventListener("touchcancel", onEnd);
    return () => {
      root.style.overscrollBehaviorY = before;
      window.removeEventListener("touchstart", onStart);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", onEnd);
      window.removeEventListener("touchcancel", onEnd);
    };
  }, []);

  return (
    <>
      {refreshing || pull > 0 ? (
        <div className="ui-ptr-bar" role="status" aria-live="polite" style={{ transform: `translateY(${refreshing ? 0 : Math.min(0, pull - 40)}px)` }}>
          {refreshing ? (
            <>
              <span className="ui-spinner" aria-hidden="true" /> Refreshing…
            </>
          ) : pull >= PULL_TRIGGER ? (
            "Let go to refresh"
          ) : (
            "Pull down to refresh"
          )}
        </div>
      ) : null}
      {children}
    </>
  );
}

/* ---------- Tile ---------- */

const TILE_ICONS = {
  call: "M5 4h4l2 5-2.5 1.5a11 11 0 005 5L15 13l5 2v4a2 2 0 01-2 2A15 15 0 013 6a2 2 0 012-2z",
  todo: "M9 11l3 3 8-8M20 12v7a1 1 0 01-1 1H5a1 1 0 01-1-1V5a1 1 0 011-1h11",
  problem: "M12 8v5m0 3.5v.5M10.3 3.9L2.6 17.3A2 2 0 004.3 20h15.4a2 2 0 001.7-2.7L13.7 3.9a2 2 0 00-3.4 0z",
  visit: "M8 3v3m8-3v3M4 9h16M5 5h14a1 1 0 011 1v13a1 1 0 01-1 1H5a1 1 0 01-1-1V6a1 1 0 011-1zm4 9l2 2 4-4",
  key: "M14 10a4 4 0 10-3.5 4L12 15.5V18h2.5v2.5H18V17l-4.3-4.3A4 4 0 0014 10zm-5-1h.01",
  more: "M5 12h.01M12 12h.01M19 12h.01",
  map: "M12 21s-6.5-5.7-6.5-11a6.5 6.5 0 0113 0c0 5.3-6.5 11-6.5 11zm0-8.5a2.5 2.5 0 100-5 2.5 2.5 0 000 5z",
  money: "M12 3v18m4-14.5c-.8-1-2.2-1.5-4-1.5-2.5 0-4 1.2-4 3s1.500 2.600 4 3 4 1.200 4 3-1.500 3-4 3c-1.800 0-3.200-.500-4-1.500",
  edit: "M4 20h4L19 9l-4-4L4 16v4zM13.500 6.500l4 4",
  status: "M4 12a8 8 0 0113.700-5.700L20 8.500M20 4v4.500h-4.500M20 12a8 8 0 01-13.700 5.700L4 15.500M4 20v-4.500h4.500",
  print: "M7 8V4h10v4M7 17H5a1 1 0 01-1-1v-6a1 1 0 011-1h14a1 1 0 011 1v6a1 1 0 01-1 1h-2M7 14h10v6H7v-6z",
  note: "M6 3h9l4 4v13a1 1 0 01-1 1H6a1 1 0 01-1-1V4a1 1 0 011-1zm3 8h6m-6 4h6",
} as const;

export type TileIcon = keyof typeof TILE_ICONS;

export function TileIconSvg({ name }: { name: TileIcon }) {
  return (
    <svg className="ui-acttile-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={TILE_ICONS[name]} />
    </svg>
  );
}

/** A big light-green action tile: icon on top, label under it. A link with href, a button with onClick. */
export function Tile({
  icon,
  label,
  detail,
  href,
  onClick,
  disabled,
  external,
  ...rest
}: {
  icon: TileIcon;
  label: string;
  /** One short line under the label, e.g. the phone number. */
  detail?: string;
  href?: string;
  onClick?: () => void;
  disabled?: boolean;
  /** tel: and other non-app links. */
  external?: boolean;
  "data-tip"?: string;
  "aria-expanded"?: boolean;
  "aria-controls"?: string;
}) {
  const inner = (
    <>
      <TileIconSvg name={icon} />
      <span className="ui-acttile-label">{label}</span>
      {detail ? <span className="ui-acttile-detail">{detail}</span> : null}
    </>
  );
  if (href && !disabled) {
    return external ? (
      <a href={href} className="ui-acttile" {...rest}>
        {inner}
      </a>
    ) : (
      <Link href={href} className="ui-acttile" {...rest}>
        {inner}
      </Link>
    );
  }
  return (
    <button type="button" className="ui-acttile" onClick={onClick} disabled={disabled} {...rest}>
      {inner}
    </button>
  );
}
