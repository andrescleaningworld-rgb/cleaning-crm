// The Cleaning World Score (Overview card): one number for how the whole
// company is doing on quality. It is the weighted average of the sub scores
// (the same score as on each sub's page, getSubcontractorPerformanceMap),
// each sub weighted by the total monthly sub pay of their active accounts, so
// a sub who does more of our work counts more. Subs with "Exclude from sub
// score" on, and subs with $0 sub pay, are left out.
//
// Same 0–10 scale and bands as the sub score. Rounded to one decimal.
//
// "Since last month": a snapshot per office day (migration 073,
// cw_score_snapshots), written when the card is read and by the daily cron.
// The score of 30 days ago cannot be worked out afterwards (which sub had
// which account at what pay is not kept, and closed complaints mostly have no
// real close date), so the change shows once a snapshot from about 30 days
// ago exists. Before migration 073 nothing is saved and no change is shown.

import { getSql } from "@/lib/db";
import { getSubcontractorPerformanceMap } from "@/lib/data/subs";
import { buildSubcontractorPerformanceKey } from "@/lib/subAccountMatching";
import { addDays, officeDay } from "@/lib/cleanings";

export type CwBand = "Excellent" | "Good" | "Needs Attention" | "High Risk";

export function cwBand(score: number): CwBand {
  if (score >= 9) return "Excellent";
  if (score >= 8) return "Good";
  if (score >= 7) return "Needs Attention";
  return "High Risk";
}

export type CwScoreSub = {
  /** For the sub's page: /subcontractors/<id>. */
  subId: string;
  name: string;
  score: number;
  monthlySubPay: number;
  /** Share of all counted sub pay, 0–1. */
  weight: number;
  /** Points this sub takes off the company score: weight × (10 − score). */
  pullDown: number;
};

export type CwScore = {
  /** null when no sub can be counted (no pay anywhere). */
  score: number | null;
  band: CwBand | null;
  subsCounted: number;
  totalPay: number;
  subsBelow7: number;
  /** Today's score minus the one about 30 days ago; null until there is history. */
  change: number | null;
  /** The day the change is measured from. */
  changeFrom: string;
  /** The first day with a snapshot ("" when none or before migration 073). */
  historySince: string;
  /** Biggest pull-down first; only subs that take something off. */
  pullingDown: CwScoreSub[];
};

const round1 = (value: number) => Math.round(value * 10) / 10;

let tableReady: boolean | null = null;
async function snapshotsReady(): Promise<boolean> {
  if (tableReady === true) return true;
  try {
    const rows = (await getSql()`SELECT to_regclass('public.cw_score_snapshots') IS NOT NULL AS ok`) as { ok: boolean }[];
    tableReady = rows[0]?.ok === true;
  } catch {
    tableReady = false;
  }
  return tableReady === true;
}

type SubRecord = { id: string; contact_name: string; company_name: string };

/** Works the score out now, saves today's snapshot (when migration 073 has run) and reads the change. */
export async function getCwScore(): Promise<CwScore> {
  const sql = getSql();
  const [performance, subs] = await Promise.all([
    getSubcontractorPerformanceMap(),
    sql`SELECT id, COALESCE(contact_name, '') AS contact_name, COALESCE(company_name, '') AS company_name FROM subcontractors ORDER BY id` as unknown as Promise<SubRecord[]>,
  ]);

  // One entry per score (two records with the same names share one score: counted once).
  const seen = new Set<string>();
  const counted: Omit<CwScoreSub, "weight" | "pullDown">[] = [];
  for (const sub of subs) {
    const key = buildSubcontractorPerformanceKey(sub.company_name, sub.contact_name);
    if (seen.has(key)) continue;
    const found = performance.get(key);
    if (!found || found.excluded || !(found.monthlySubPay > 0)) continue;
    seen.add(key);
    counted.push({ subId: sub.id, name: sub.company_name.trim() || sub.contact_name.trim() || sub.id, score: found.score, monthlySubPay: found.monthlySubPay });
  }

  const totalPay = counted.reduce((sum, sub) => sum + sub.monthlySubPay, 0);
  const score = totalPay > 0 ? round1(counted.reduce((sum, sub) => sum + sub.score * sub.monthlySubPay, 0) / totalPay) : null;
  const subsBelow7 = counted.filter((sub) => sub.score < 7).length;
  const pullingDown = counted
    .map((sub) => {
      const weight = totalPay > 0 ? sub.monthlySubPay / totalPay : 0;
      return { ...sub, weight, pullDown: weight * (10 - sub.score) };
    })
    .filter((sub) => sub.pullDown > 0)
    .sort((a, b) => b.pullDown - a.pullDown);

  let change: number | null = null;
  let changeFrom = "";
  let historySince = "";
  if (await snapshotsReady()) {
    const today = officeDay();
    try {
      if (score !== null) {
        await sql`
          INSERT INTO cw_score_snapshots (day, score, total_pay, subs_counted, subs_below_7, updated_at)
          VALUES (${today}, ${score}, ${round1(totalPay)}, ${counted.length}, ${subsBelow7}, now())
          ON CONFLICT (day) DO UPDATE SET score = EXCLUDED.score, total_pay = EXCLUDED.total_pay,
            subs_counted = EXCLUDED.subs_counted, subs_below_7 = EXCLUDED.subs_below_7, updated_at = now()`;
      }
      // The snapshot nearest 30 days ago, no more than a week either side.
      const target = addDays(today, -30);
      const [near, first] = await Promise.all([
        sql`SELECT day::text AS day, score::float AS score FROM cw_score_snapshots
            WHERE day BETWEEN ${addDays(target, -7)}::date AND ${addDays(target, 7)}::date
            ORDER BY abs(day - ${target}::date), day LIMIT 1` as unknown as Promise<{ day: string; score: number }[]>,
        sql`SELECT min(day)::text AS day FROM cw_score_snapshots` as unknown as Promise<{ day: string | null }[]>,
      ]);
      historySince = first[0]?.day ?? "";
      if (near[0] && score !== null) {
        change = round1(score - Number(near[0].score));
        changeFrom = near[0].day;
      }
    } catch (error) {
      console.error("[cw-score] snapshot:", error instanceof Error ? error.message : error);
    }
  }

  return { score, band: score === null ? null : cwBand(score), subsCounted: counted.length, totalPay, subsBelow7, change, changeFrom, historySince, pullingDown };
}

/** The daily cron: today's snapshot, even on a day nobody opens Overview. */
export async function saveCwScoreSnapshot(): Promise<{ score: number | null }> {
  const result = await getCwScore();
  return { score: result.score };
}
