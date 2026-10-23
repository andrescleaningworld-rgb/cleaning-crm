// "At risk" accounts: one flag per account, green / yellow / red, from what
// the CRM already has. Plain TS, safe in the browser. The numbers come from
// Settings -> Reminders & check-ins (lib/featureSettings.ts AtRiskSetting);
// the database side is lib/pg/account-risk.ts. Staff only: never shown to a
// sub or a customer.
//
// The flag is the worst of:
//   complaints in the last 30 days (not the ones marked invalid)
//   days since the last manager visit (since the start, with no visit yet)
//   the account's sub's score
//   👎 answers to the monthly check-in in the last 60 days
// The reason is the one line that made it that colour ("2 complaints this month").

import type { AtRiskSetting } from "@/lib/featureSettings";

export type RiskLevel = "green" | "yellow" | "red";

export type RiskSignals = {
  complaints30: number;
  /** Days since the last visit (or the start); null when neither is known. */
  daysSinceVisit: number | null;
  /** True when daysSinceVisit counts from the start date: there was no visit yet. */
  noVisitYet: boolean;
  subScore: number | null;
  thumbsDown60: number;
};

export type RiskFlag = { level: RiskLevel; reason: string };

const RANK: Record<RiskLevel, number> = { green: 0, yellow: 1, red: 2 };

export function riskOf(signals: RiskSignals, t: AtRiskSetting): RiskFlag {
  const found: RiskFlag[] = [];
  const add = (level: RiskLevel, reason: string) => {
    if (level !== "green") found.push({ level, reason });
  };

  const c = signals.complaints30;
  add(c >= t.complaintsRed ? "red" : c >= t.complaintsYellow ? "yellow" : "green", `${c} complaint${c === 1 ? "" : "s"} this month`);

  if (signals.daysSinceVisit !== null) {
    const d = signals.daysSinceVisit;
    add(d > t.visitDaysRed ? "red" : d > t.visitDaysYellow ? "yellow" : "green", signals.noVisitYet ? `No visit yet (${d} days)` : `No visit in ${d} days`);
  }

  if (signals.subScore !== null) {
    const s = signals.subScore;
    add(s < t.scoreRedBelow ? "red" : s < t.scoreYellowBelow ? "yellow" : "green", `Sub score ${s.toFixed(1)}`);
  }

  const n = signals.thumbsDown60;
  add(n >= t.thumbsDownRed ? "red" : n >= t.thumbsDownYellow ? "yellow" : "green", `${n} 👎 from the customer`);

  if (found.length === 0) return { level: "green", reason: "All good" };
  // The worst colour; the first reason of that colour, in the order above.
  const worst = found.reduce((a, b) => (RANK[b.level] > RANK[a.level] ? b : a));
  return worst;
}

export const RISK_WORDS: Record<RiskLevel, string> = { green: "OK", yellow: "Watch", red: "At risk" };
export const RISK_DOT: Record<RiskLevel, string> = { green: "🟢", yellow: "🟡", red: "🔴" };
