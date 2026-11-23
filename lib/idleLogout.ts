// Auto logout for staff on a desktop computer: the rules. Plain TS, no browser
// calls. The watcher is app/components/IdleLogout.tsx.

/** No mouse or keyboard for this long, on any tab of this browser: logged out. */
export const IDLE_LOGOUT_MS = 30 * 60_000;
/** The "Still there?" warning shows for this long first. */
export const IDLE_WARNING_MS = 60_000;

/** A mouse or trackpad computer. Phones and tablets are left alone. */
export const DESKTOP_QUERY = "(hover: hover) and (pointer: fine)";

export type IdleStep = { step: "active" } | { step: "warn"; secondsLeft: number } | { step: "logout" };

export function idleStep(now: number, lastActive: number): IdleStep {
  const left = IDLE_LOGOUT_MS - (now - lastActive);
  if (left <= 0) return { step: "logout" };
  return left <= IDLE_WARNING_MS ? { step: "warn", secondsLeft: Math.ceil(left / 1000) } : { step: "active" };
}

// Never logged out here: the login page, the office TV (it must stay up all
// day), and the no-login pages used by crews and customers.
const NOT_WATCHED = ["/login", "/board/tv", "/porter", "/team-hub", "/equipment-check", "/checkin", "/sub-packet"];

export const idleWatched = (pathname: string) => !NOT_WATCHED.some((path) => pathname === path || pathname.startsWith(`${path}/`));
