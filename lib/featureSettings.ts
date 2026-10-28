// Settings -> Reminders & check-ins: the switches and numbers the reminder
// features read (feature_settings, migration 056; lib/pg/feature-settings.ts).
// Plain TS, safe in the browser. A setting nobody saved is its default here.

import { DEFAULT_SURVEY_SHOTS } from "@/lib/setupWizard";

/** Sub portal insurance upload, the banner and the reminder emails to subs (sub-facing; on from the start since Oct 24, 2026). */
export type SubInsurancePortalSetting = { on: boolean };

/** "At risk" accounts (lib/accountRisk.ts). Yellow at the first number, red at the second. */
export type AtRiskSetting = {
  /** Complaints in the last 30 days. */
  complaintsYellow: number;
  complaintsRed: number;
  /** Days since the last manager visit (or since the start, with no visit yet). */
  visitDaysYellow: number;
  visitDaysRed: number;
  /** The sub's score: yellow below the first, red below the second. */
  scoreYellowBelow: number;
  scoreRedBelow: number;
  /** 👎 answers to the monthly check-in in the last 60 days. */
  thumbsDownYellow: number;
  thumbsDownRed: number;
};

/** The customer monthly check-in (customer-facing: off until turned on). */
export type CheckinSetting = { on: boolean };

/**
 * Not on the Settings page: the day each reminder started, so what was
 * already due that day gets no paper (no flood on day one). "" = not started.
 */
export type BaselinesSetting = { priceReviewStartedOn: string };

/** The setup wizard's "Take pictures" shot list, in order. "Anything else" is always added at the end. */
export type SurveyShotsSetting = { labels: string[] };

export type FeatureSettings = {
  subInsurancePortal: SubInsurancePortalSetting;
  atRisk: AtRiskSetting;
  checkin: CheckinSetting;
  baselines: BaselinesSetting;
  surveyShots: SurveyShotsSetting;
};

export type FeatureSettingKey = keyof FeatureSettings;

export const DEFAULT_FEATURE_SETTINGS: FeatureSettings = {
  subInsurancePortal: { on: true },
  atRisk: {
    complaintsYellow: 1,
    complaintsRed: 2,
    // Manager visits are logged rarely (Oct 2026: 126 active accounts had none), so a long gap only: 180 / 365.
    visitDaysYellow: 180,
    visitDaysRed: 365,
    // 8 is where a sub stops being "Good" (the "Below target score" pill); under 6 is the sub score alert.
    scoreYellowBelow: 8,
    scoreRedBelow: 6,
    thumbsDownYellow: 1,
    thumbsDownRed: 2,
  },
  checkin: { on: false },
  baselines: { priceReviewStartedOn: "" },
  surveyShots: { labels: [...DEFAULT_SURVEY_SHOTS] },
};

export const FEATURE_SETTING_KEYS = Object.keys(DEFAULT_FEATURE_SETTINGS) as FeatureSettingKey[];

export const isFeatureSettingKey = (value: unknown): value is FeatureSettingKey => typeof value === "string" && value in DEFAULT_FEATURE_SETTINGS;

/** The ones the Settings page may change (the baselines are set by the reminders themselves). */
export const isEditableSettingKey = (value: unknown): value is Exclude<FeatureSettingKey, "baselines"> => isFeatureSettingKey(value) && value !== "baselines";

/** A saved value laid over the default: only known fields, of the right kind, are kept. */
export function readFeatureSetting<K extends FeatureSettingKey>(key: K, saved: unknown): FeatureSettings[K] {
  const base = DEFAULT_FEATURE_SETTINGS[key] as Record<string, unknown>;
  const source = saved && typeof saved === "object" ? (saved as Record<string, unknown>) : {};
  const out: Record<string, unknown> = { ...base };
  for (const [field, fallback] of Object.entries(base)) {
    const value = source[field];
    if (typeof fallback === "boolean" && typeof value === "boolean") out[field] = value;
    if (typeof fallback === "number" && typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 10_000) out[field] = value;
    if (typeof fallback === "string" && typeof value === "string") out[field] = value.slice(0, 40);
    // A list of short words (the shot list): trimmed, no blanks or repeats, at most 30.
    if (Array.isArray(fallback) && Array.isArray(value)) {
      const seen = new Set<string>();
      const list = value
        .map((entry) => String(entry ?? "").trim().slice(0, 40))
        .filter((entry) => entry && !seen.has(entry.toLowerCase()) && seen.add(entry.toLowerCase()))
        .slice(0, 30);
      out[field] = list;
    }
  }
  return out as FeatureSettings[K];
}
