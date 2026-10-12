// The sub score alert (db/migrations/030_office_extras.sql): when a
// subcontractor's score drops below 6, the office sees it on the Accounts
// Center nav item with who and why, the sub gets one clear email, and it
// leaves the list when someone in the office taps "Got it".
//
// The score itself is not worked out here: it is the one on the sub's page
// (getSubcontractorPerformanceMap). This file only watches it.
//
//   - Checked when a staff screen asks for the alerts, at most every 10
//     minutes. No cron.
//   - One alert per drop. A sub is only alerted again after the score came
//     back to 6 or more and dropped again.
//   - The first time the scores are ever checked, subs that are already
//     below 6 are listed for the office but get NO email: nothing dropped
//     today, and nobody should get a surprise email on the day this is
//     switched on. From then on a drop is emailed.
//
// Feature flag FEATURE_SUB_SCORE_ALERTS: "1" on, "0" off, unset = off on
// Production, on in local dev and on Vercel previews (the same rule as the
// other FEATURE_ switches). Emails obey OUTBOUND_DRY_RUN like every other.

import { getSql } from "@/lib/db";
import { getSubcontractorPerformanceMap } from "@/lib/data/subs";
import { sendHtmlEmail } from "@/lib/email";
import { buildSubcontractorPerformanceKey } from "@/lib/subAccountMatching";

/** A score under this is an alert. */
export const ALERT_BELOW = 6;
const CHECK_EVERY_MS = 10 * 60_000;

export type SubScoreAlert = {
  id: number;
  /** The id in the sub's page address (/subcontractors/<id>). */
  subcontractorId: string;
  subName: string;
  score: number;
  /** Plain sentences: why the score is where it is. */
  reasons: string[];
  /** Already below 6 when alerts were turned on: no email went to the sub. */
  baseline: boolean;
  emailed: boolean;
  createdAt: string;
};

export function subScoreAlertsFlagOn(): boolean {
  const flag = (process.env.FEATURE_SUB_SCORE_ALERTS ?? "").trim();
  if (flag === "1") return true;
  if (flag === "0") return false;
  if (process.env.NODE_ENV !== "production") return true;
  return process.env.VERCEL_ENV === "preview" || process.env.VERCEL_ENV === "development";
}

let ready: boolean | null = null;

export async function subScoreAlertsReady(): Promise<boolean> {
  if (!subScoreAlertsFlagOn()) return false;
  if (ready === true) return true;
  try {
    const rows = (await getSql()`SELECT to_regclass('public.sub_score_alerts') IS NOT NULL AND to_regclass('public.sub_score_alert_state') IS NOT NULL AS ok`) as { ok: boolean }[];
    ready = rows[0]?.ok === true;
  } catch {
    ready = false;
  }
  return ready === true;
}

type SubRow = { id: string; contact_name: string; company_name: string; email: string; status: string };
type LatestRow = { id: string; subcontractor_id: string; recovered_at: string | null; acknowledged_at: string | null };
type ComplaintRow = { account_name: string; priority: string; day: string | null; status: string };

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? "" : "s"}`;
const shortDay = (day: string) => new Date(`${day}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" });
const isOpen = (status: string) => ["", "open", "pending", "needs attention"].includes(status.trim().toLowerCase());

/** Why the score is low, in plain sentences, from the same things the score is made of. */
async function reasonsFor(subId: string, performance: { score: number; openComplaints: number; avgCondition: number | null; accountsAssigned: number }): Promise<string[]> {
  const complaints = (await getSql()`
    SELECT btrim(c.account_name) AS account_name, btrim(c.priority) AS priority, c.complaint_date::text AS day, c.status
    FROM complaints c JOIN accounts a ON a.id = c.account_ref
    WHERE a.subcontractor_id = ${subId}
      AND lower(btrim(c.complaint_validity)) NOT IN ('no', 'not valid', 'invalid', 'notvalid')
      AND c.complaint_date >= current_date - 90
    ORDER BY c.complaint_date DESC LIMIT 5
  `) as ComplaintRow[];
  const reasons: string[] = [];
  if (performance.openComplaints > 0) reasons.push(`${plural(performance.openComplaints, "complaint")} still open.`);
  for (const complaint of complaints) {
    reasons.push(`${complaint.day ? `${shortDay(complaint.day)}: ` : ""}complaint at ${complaint.account_name || "an account"}${complaint.priority ? ` (${complaint.priority})` : ""}${isOpen(complaint.status) ? ", still open" : ""}.`);
  }
  if (performance.avgCondition !== null && performance.avgCondition < 7) reasons.push(`Visits rate the cleaning ${performance.avgCondition} out of 10 on average.`);
  if (reasons.length === 0) reasons.push("Complaints on this sub's accounts brought the score down.");
  return reasons;
}

const escapeHtml = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** The one email a sub gets when the score drops below 6. English, then Spanish. */
async function emailSub(to: string, name: string, score: number, reasons: string[]): Promise<boolean> {
  const first = name.trim().split(/\s+/)[0] || "";
  const subject = `Your Cleaning World score dropped to ${score} out of 10`;
  const what = [
    "Fix the open complaints first, and tell your manager when each one is done.",
    "Call your manager today if you need help or think something here is wrong.",
    "The score goes back up as complaints are fixed and no new ones come in.",
  ];
  const text = [
    first ? `Hello ${first},` : "Hello,",
    "",
    `Your score at Cleaning World is now ${score} out of 10. It dropped below ${ALERT_BELOW}.`,
    "",
    "Why:",
    ...reasons.map((reason) => `- ${reason}`),
    "",
    "What to do now:",
    ...what.map((line) => `- ${line}`),
    "",
    `En español: su puntuación en Cleaning World es ahora ${score} de 10 (menos de ${ALERT_BELOW}). Por favor arregle las quejas abiertas y llame a su gerente hoy.`,
    "",
    "Cleaning World",
  ].join("\n");
  const html = `
    <div style="font-family:Arial,Helvetica,sans-serif;font-size:17px;line-height:1.5;color:#10233f;max-width:560px">
      <p>${first ? `Hello ${escapeHtml(first)},` : "Hello,"}</p>
      <p style="padding:14px 16px;border-radius:12px;background:#fdecea;border:2px solid #c62828;font-size:20px;font-weight:bold">
        Your score at Cleaning World is now ${score} out of 10.<br>It dropped below ${ALERT_BELOW}.
      </p>
      <p style="font-weight:bold;margin-bottom:4px">Why</p>
      <ul style="margin-top:0">${reasons.map((reason) => `<li>${escapeHtml(reason)}</li>`).join("")}</ul>
      <p style="font-weight:bold;margin-bottom:4px">What to do now</p>
      <ul style="margin-top:0">${what.map((line) => `<li>${escapeHtml(line)}</li>`).join("")}</ul>
      <p style="padding:12px 16px;border-radius:12px;background:#f1f4f8">
        <strong>En español:</strong> su puntuación en Cleaning World es ahora ${score} de 10 (menos de ${ALERT_BELOW}). Por favor arregle las quejas abiertas y llame a su gerente hoy.
      </p>
      <p>Cleaning World</p>
    </div>`;
  return sendHtmlEmail({ to: [to], subject, text, html, fromName: "Cleaning World" });
}

let lastCheck = 0;
let checking: Promise<void> | null = null;

/** Looks at every sub's score and opens, updates or settles alerts. At most every 10 minutes; `force` skips the wait. */
export async function checkSubScores(force = false): Promise<void> {
  if (!(await subScoreAlertsReady())) return;
  if (checking) return checking;
  if (!force && Date.now() - lastCheck < CHECK_EVERY_MS) return;
  lastCheck = Date.now();
  checking = runCheck().finally(() => {
    checking = null;
  });
  return checking;
}

async function runCheck(): Promise<void> {
  const sql = getSql();
  const [performance, subs, latest, state] = await Promise.all([
    getSubcontractorPerformanceMap(),
    sql`SELECT id, contact_name, company_name, email, status FROM subcontractors` as unknown as Promise<SubRow[]>,
    sql`SELECT DISTINCT ON (subcontractor_id) id::text AS id, subcontractor_id, recovered_at::text AS recovered_at, acknowledged_at::text AS acknowledged_at
        FROM sub_score_alerts ORDER BY subcontractor_id, created_at DESC` as unknown as Promise<LatestRow[]>,
    sql`SELECT 1 FROM sub_score_alert_state` as unknown as Promise<unknown[]>,
  ]);
  // The very first check: whoever is already below 6 is shown to the office, and no sub is emailed.
  const baseline = state.length === 0;
  const latestBySub = new Map(latest.map((row) => [row.subcontractor_id, row]));

  for (const sub of subs) {
    if (sub.status.trim().toLowerCase() === "inactive") continue;
    const found = performance.get(buildSubcontractorPerformanceKey(sub.company_name, sub.contact_name));
    // A sub with no accounts has nothing to score.
    if (!found || found.accountsAssigned === 0) continue;
    const last = latestBySub.get(sub.id);
    const open = last && last.recovered_at === null ? last : null;

    if (found.score >= ALERT_BELOW) {
      // Back to 6 or more: this drop is over. (It stays on the office's list until someone taps "Got it".)
      if (open) await sql`UPDATE sub_score_alerts SET recovered_at = now() WHERE id = ${Number(open.id)}`;
      continue;
    }

    const reasons = await reasonsFor(sub.id, found);
    if (open) {
      // Still below 6: keep the number and the reasons on the office's list current. No second email.
      if (open.acknowledged_at === null) await sql`UPDATE sub_score_alerts SET score = ${found.score}, reasons = ${JSON.stringify(reasons)}::jsonb WHERE id = ${Number(open.id)}`;
      continue;
    }

    const name = sub.contact_name.trim() || sub.company_name.trim() || "Subcontractor";
    const email = sub.email.trim();
    const created = (await sql`
      INSERT INTO sub_score_alerts (subcontractor_id, sub_name, sub_email, score, reasons, baseline)
      VALUES (${sub.id}, ${name}, ${email}, ${found.score}, ${JSON.stringify(reasons)}::jsonb, ${baseline})
      ON CONFLICT (subcontractor_id) WHERE recovered_at IS NULL DO NOTHING
      RETURNING id
    `) as { id: string }[];
    // Another screen opened the same alert a moment ago: it sends the email.
    if (created.length === 0 || baseline || !email) continue;
    try {
      if (await emailSub(email, name, found.score, reasons)) await sql`UPDATE sub_score_alerts SET emailed_at = now() WHERE id = ${Number(created[0].id)}`;
    } catch (error) {
      // The alert stays on the office's list, marked "no email went out".
      console.error("[sub score alert] email failed:", error instanceof Error ? error.message : error);
    }
  }
  if (baseline) await sql`INSERT INTO sub_score_alert_state (id) VALUES (true) ON CONFLICT (id) DO NOTHING`;
}

type AlertRow = { id: string; subcontractor_id: string; page_id: string | null; sub_name: string; score: string; reasons: unknown; baseline: boolean; emailed_at: string | null; created_at: string | Date };

/** The alerts nobody has tapped "Got it" on yet, newest first. */
export async function listSubScoreAlerts(): Promise<SubScoreAlert[]> {
  if (!(await subScoreAlertsReady())) return [];
  const rows = (await getSql()`
    SELECT a.id::text AS id, a.subcontractor_id, s.legacy_row_id AS page_id, a.sub_name, a.score::text AS score, a.reasons, a.baseline, a.emailed_at::text AS emailed_at, a.created_at
    FROM sub_score_alerts a LEFT JOIN subcontractors s ON s.id = a.subcontractor_id
    WHERE a.acknowledged_at IS NULL ORDER BY a.created_at DESC LIMIT 50
  `) as AlertRow[];
  return rows.map((row) => ({
    id: Number(row.id),
    subcontractorId: row.page_id || row.subcontractor_id,
    subName: row.sub_name,
    score: Number(row.score),
    reasons: Array.isArray(row.reasons) ? row.reasons.map(String) : [],
    baseline: row.baseline,
    emailed: row.emailed_at !== null,
    createdAt: new Date(row.created_at).toISOString(),
  }));
}

/** "Got it": the alert leaves the list. */
export async function acknowledgeSubScoreAlert(id: number, by: string): Promise<boolean> {
  if (!(await subScoreAlertsReady())) return false;
  const rows = (await getSql()`UPDATE sub_score_alerts SET acknowledged_at = now(), acknowledged_by = ${by} WHERE id = ${id} AND acknowledged_at IS NULL RETURNING id`) as unknown[];
  return rows.length > 0;
}
