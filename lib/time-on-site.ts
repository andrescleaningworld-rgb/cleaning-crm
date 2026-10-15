// Approx. time on site: how long a cleaning takes at an account. Pure
// helpers, safe in both server code and "use client" components. Stored on
// accounts (migration 042); every account starts at 1h 30m, marked as an
// estimate, until the office or the sub confirms it.

export const DEFAULT_MINUTES_ON_SITE = 90;
export const MIN_MINUTES_ON_SITE = 15;
export const MAX_MINUTES_ON_SITE = 720;
/** The − / + buttons move by this much. */
export const MINUTES_ON_SITE_STEP = 15;
/** A sub's answer this far from what the office set is kept apart for the office to look at. */
export const SUB_ANSWER_REVIEW_MINUTES = 30;

/** est: the starting guess. office / sub: who confirmed it. */
export type TimeOnSiteSource = "est" | "office" | "sub";

export type TimeOnSite = {
  accountId: string;
  minutes: number;
  source: TimeOnSiteSource;
  by: string;
  at: string;
  /** What the sub said, when it differed from the office's figure by more than 30 minutes. */
  subMinutes: number | null;
  subAt: string;
};

export function clampMinutesOnSite(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_MINUTES_ON_SITE;
  const stepped = Math.round(value / MINUTES_ON_SITE_STEP) * MINUTES_ON_SITE_STEP;
  return Math.min(MAX_MINUTES_ON_SITE, Math.max(MIN_MINUTES_ON_SITE, stepped));
}

export function toTimeOnSiteSource(value: unknown): TimeOnSiteSource {
  return value === "office" || value === "sub" ? value : "est";
}

/** 90 → "1h 30m", 60 → "1h", 45 → "45m". */
export function formatMinutes(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest}m`;
  return rest === 0 ? `${hours}h` : `${hours}h ${rest}m`;
}

/** "1h 30m (est.)" until someone confirms it. */
export function describeTimeOnSite(time: Pick<TimeOnSite, "minutes" | "source">): string {
  return time.source === "est" ? `${formatMinutes(time.minutes)} (est.)` : formatMinutes(time.minutes);
}

export const TIME_ON_SITE_SOURCE_LABELS: Record<TimeOnSiteSource, string> = {
  est: "Estimate",
  office: "Set by the office",
  sub: "Confirmed by the sub",
};
