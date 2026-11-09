// How much a complaint counts, by its Validity. THE one place to change it.
//
// Sub score: the hit is (priority points) x (sub size factor) x (this weight).
// Account "At risk": each complaint in the last 30 days counts as this weight
// (a Subjective one counts as half a complaint).
// A weight of 0 leaves the complaint out entirely (score, open count, alerts).
//
// Used by the sub score (lib/googleSheets.ts buildSubcontractorPerformanceMap,
// which also feeds the Cleaning World Score), the sub score alerts
// (lib/pg/sub-score-alerts.ts) and the At risk flags (lib/pg/account-risk.ts).

export const COMPLAINT_VALIDITY_WEIGHTS = {
  valid: 1.0,
  needsReview: 1.0,
  subjective: 0.5,
  notValid: 0,
} as const;

// What each Validity is written as in the data (lower case). Old rows from
// the sheet used "yes" / "no" / "invalid" / "notvalid".
const SPELLINGS: Record<keyof typeof COMPLAINT_VALIDITY_WEIGHTS, string[]> = {
  valid: ["valid", "yes"],
  needsReview: ["needs review"],
  subjective: ["subjective"],
  notValid: ["not valid", "no", "invalid", "notvalid"],
};

/** The weight for a Validity value. Blank or anything unknown counts fully (as before). */
export function complaintValidityWeight(validity: unknown): number {
  const clean = String(validity ?? "").toLowerCase().trim();
  for (const [key, spellings] of Object.entries(SPELLINGS)) {
    if (spellings.includes(clean)) return COMPLAINT_VALIDITY_WEIGHTS[key as keyof typeof COMPLAINT_VALIDITY_WEIGHTS];
  }
  return 1;
}

/** The same weight as a SQL expression, for a validity column (e.g. "c.complaint_validity"). Built from the numbers above. */
export function complaintValidityWeightSql(column: string): string {
  const cases = Object.entries(SPELLINGS)
    .map(([key, spellings]) => {
      const weight = Number(COMPLAINT_VALIDITY_WEIGHTS[key as keyof typeof COMPLAINT_VALIDITY_WEIGHTS]);
      return `WHEN lower(btrim(${column})) IN (${spellings.map((s) => `'${s}'`).join(", ")}) THEN ${weight}::numeric`;
    })
    .join(" ");
  return `(CASE ${cases} ELSE 1::numeric END)`;
}

// Fast fix bonus (Nov 9, 2026): part of a complaint's hit comes back when it
// is fixed fast, with proof (an after photo, or staff "No photo needed").
// The clock starts when the sub was first told about it (the first email or
// text that went out, automatic or "Notify sub"); never told = when it was
// filed. Business days: Mon–Fri, 8 am – 5 pm New York (lib/responseClock.ts),
// so one business day = 9 business hours. Checked in order: the first window
// it fits gives that share back. Merged and Not Valid complaints get nothing
// (they cost nothing). The score never goes above 10.
export const FAST_FIX_BONUS = [
  { withinBusinessDays: 1, giveBack: 0.5 },
  { withinBusinessDays: 3, giveBack: 0.25 },
] as const;

export const BUSINESS_DAY_MINUTES = 9 * 60;

/** The share of the hit that comes back, given the business minutes from first notice (or filing) to the fix. 0 = none. */
export function fastFixShare(businessMinutes: number): number {
  for (const rule of FAST_FIX_BONUS) {
    if (businessMinutes <= rule.withinBusinessDays * BUSINESS_DAY_MINUTES) return rule.giveBack;
  }
  return 0;
}
