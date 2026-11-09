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
