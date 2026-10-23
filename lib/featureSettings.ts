// Settings -> Reminders & check-ins: the switches and numbers the reminder
// features read (feature_settings, migration 056; lib/pg/feature-settings.ts).
// Plain TS, safe in the browser. A setting nobody saved is its default here.

/** Sub portal insurance upload, the banner and the email to the sub (sub-facing: off until turned on). */
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

export type FeatureSettings = {
  subInsurancePortal: SubInsurancePortalSetting;
  atRisk: AtRiskSetting;
  checkin: CheckinSetting;
};

export type FeatureSettingKey = keyof FeatureSettings;

export const DEFAULT_FEATURE_SETTINGS: FeatureSettings = {
  subInsurancePortal: { on: false },
  atRisk: {
    complaintsYellow: 1,
    complaintsRed: 2,
    visitDaysYellow: 45,
    visitDaysRed: 90,
    // 8 is where a sub stops being "Good" (the "Below target score" pill); under 6 is the sub score alert.
    scoreYellowBelow: 8,
    scoreRedBelow: 6,
    thumbsDownYellow: 1,
    thumbsDownRed: 2,
  },
  checkin: { on: false },
};

export const FEATURE_SETTING_KEYS = Object.keys(DEFAULT_FEATURE_SETTINGS) as FeatureSettingKey[];

export const isFeatureSettingKey = (value: unknown): value is FeatureSettingKey => typeof value === "string" && value in DEFAULT_FEATURE_SETTINGS;

/** A saved value laid over the default: only known fields, of the right kind, are kept. */
export function readFeatureSetting<K extends FeatureSettingKey>(key: K, saved: unknown): FeatureSettings[K] {
  const base = DEFAULT_FEATURE_SETTINGS[key] as Record<string, unknown>;
  const source = saved && typeof saved === "object" ? (saved as Record<string, unknown>) : {};
  const out: Record<string, unknown> = { ...base };
  for (const [field, fallback] of Object.entries(base)) {
    const value = source[field];
    if (typeof fallback === "boolean" && typeof value === "boolean") out[field] = value;
    if (typeof fallback === "number" && typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 10_000) out[field] = value;
  }
  return out as FeatureSettings[K];
}
