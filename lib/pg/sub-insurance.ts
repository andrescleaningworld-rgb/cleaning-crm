// Sub insurance (COI) tracker: the database side (migration 056). Server only.
// Rules and words: lib/subInsurance.ts. Emails: lib/subInsuranceEmail.ts.
//
// The date that counts is the sub's own insurance expiration (the field on
// the sub's page; the sheet had it twice, so the later of the two is used).
// An office upload is approved at once and sets that date. A sub's upload
// from the portal waits for the office (a paper in the Office square, and
// Sub Center -> Insurance); only Approve sets the date. Until then the old
// date and its badge stay.
//
// Office reminders (runInsuranceChecks, once a day from app/api/cron/daily-reminders):
//   30 days before   a paper in the Office square and an email to info@
//   on expiry        the same again
// Each once per sub and expiration date (sub_coi_alerts). Insurance that ran
// out more than 30 days ago gets no office reminder (no flood on the first
// day); it still shows red everywhere and in the list.
//
// Reminders to subs (runSubInsuranceReminders, same daily job), while
// Settings -> Reminders -> sub portal insurance is on: every ACTIVE sub with
// at least one active account whose insurance is
//   missing (no date on file) or expired   every 7 days until a COI is approved
//   expiring within 30 days                 at 30, 14 and 3 days before
// in English, Spanish and Portuguese, with the portal link. None while a COI
// the sub sent waits for approval; they go on if it is rejected. Each one is
// logged (sub_insurance_reminders) and written to the sub's History.
//
// Paper ids: "coi:<sub id>:soon:<date>", "coi:<sub id>:expired:<date>",
// "coi:<sub id>:review:<document id>". A new approved COI takes all of the
// sub's papers down.

import { getSql } from "@/lib/db";
import { logActivity } from "@/lib/activityLog";
import { sendHtmlEmail } from "@/lib/email";
import { getFeatureSetting } from "@/lib/pg/feature-settings";
import { pinOnce, takeDownPapers } from "@/lib/pg/auto-pins";
import {
  INSURANCE_OFFICE_EMAIL,
  INSURANCE_SOON_DAYS,
  daysBetween,
  easternToday,
  insuranceState,
  looseDate,
  type CoiDoc,
  type SubInsurance,
} from "@/lib/subInsurance";
import { officeInsuranceEmail, subInsuranceEmail } from "@/lib/subInsuranceEmail";
import { accountLive } from "@/lib/pg/account-live";

let readyCache = false;

/** True once migration 056 is on this database. Before it, the badges still work from the subs' own dates. */
export async function subInsuranceReady(): Promise<boolean> {
  if (readyCache) return true;
  try {
    const rows = (await getSql()`SELECT to_regclass('public.sub_coi_documents') IS NOT NULL AND to_regclass('public.sub_coi_alerts') IS NOT NULL AS ok`) as { ok: boolean }[];
    readyCache = rows[0]?.ok === true;
  } catch {
    readyCache = false;
  }
  return readyCache;
}

const clean = (value: unknown) => String(value ?? "").trim();
const iso = (value: unknown) => (value ? new Date(value as string).toISOString() : "");

type SubRow = {
  id: string;
  legacy_row_id: string | null;
  extra_id_raw: string;
  display_id_raw: string;
  contact_name: string;
  company_name: string;
  email: string;
  status: string;
  exp_date: string | null;
  insurance_expiration_raw: string;
  extra_insurance_raw: string;
};

type DocRow = {
  id: string;
  sub_id: string;
  file_url: string;
  file_name: string;
  content_type: string;
  expires_on: string;
  source: CoiDoc["source"];
  status: CoiDoc["status"];
  uploaded_by: string;
  uploaded_at: string | Date;
  reviewed_by: string;
  reviewed_at: string | Date | null;
  reject_reason: string;
};

function toDoc(row: DocRow): CoiDoc {
  return {
    id: row.id,
    fileUrl: row.file_url,
    fileName: row.file_name,
    expiresOn: clean(row.expires_on).slice(0, 10),
    source: row.source,
    status: row.status,
    uploadedBy: row.uploaded_by,
    uploadedAt: iso(row.uploaded_at),
    reviewedBy: row.reviewed_by,
    reviewedAt: iso(row.reviewed_at),
    rejectReason: row.reject_reason,
  };
}

/** The date that counts: the later of the sub's two expiration fields. */
function subExpiration(row: Pick<SubRow, "exp_date" | "insurance_expiration_raw" | "extra_insurance_raw">): string {
  const dates = [clean(row.exp_date).slice(0, 10), looseDate(row.insurance_expiration_raw), looseDate(row.extra_insurance_raw)].filter(Boolean).sort();
  return dates[dates.length - 1] ?? "";
}

const inactive = (status: string) => /^(inactive|terminated|do not use)/i.test(status.trim());

async function subRows(where = "TRUE", params: unknown[] = []): Promise<SubRow[]> {
  return (await getSql().query(
    `SELECT id, legacy_row_id, extra_id_raw, display_id_raw, contact_name, company_name, email, status,
            insurance_expiration::text AS exp_date, insurance_expiration_raw, extra_insurance_raw
     FROM subcontractors WHERE ${where}`,
    params
  )) as SubRow[];
}

/** Every sub's insurance (inactive subs left out). */
export async function listSubInsurance(today = easternToday()): Promise<SubInsurance[]> {
  const sql = getSql();
  const ready = await subInsuranceReady();
  const [subs, approved, pending] = await Promise.all([
    subRows(),
    ready
      ? (sql`SELECT DISTINCT ON (sub_id) * FROM sub_coi_documents WHERE status = 'approved' ORDER BY sub_id, reviewed_at DESC NULLS LAST, id DESC` as unknown as Promise<DocRow[]>)
      : Promise.resolve([] as DocRow[]),
    ready
      ? (sql`SELECT DISTINCT ON (sub_id) * FROM sub_coi_documents WHERE status = 'pending' ORDER BY sub_id, uploaded_at DESC, id DESC` as unknown as Promise<DocRow[]>)
      : Promise.resolve([] as DocRow[]),
  ]);
  return subs
    .filter((row) => !inactive(row.status))
    .map((row) => {
      const expiresOn = subExpiration(row);
      const keys = [row.id, row.legacy_row_id, row.extra_id_raw, row.display_id_raw, row.contact_name, row.company_name]
        .map((value) => clean(value).toLowerCase())
        .filter(Boolean);
      const pendingRow = pending.find((doc) => doc.sub_id === row.id);
      return {
        subId: row.id,
        pageId: clean(row.extra_id_raw) || clean(row.legacy_row_id) || row.id,
        keys: Array.from(new Set(keys)),
        name: clean(row.contact_name) || clean(row.company_name),
        company: clean(row.company_name),
        email: clean(row.email),
        expiresOn,
        state: insuranceState(expiresOn, today),
        daysLeft: expiresOn ? daysBetween(today, expiresOn) : null,
        fileUrl: approved.find((doc) => doc.sub_id === row.id)?.file_url ?? "",
        pending: pendingRow ? toDoc(pendingRow) : null,
      };
    });
}

/** The sub (by any id a screen has) as its database id; "" when not found. */
export async function resolveSubId(anyId: string): Promise<string> {
  const id = anyId.trim();
  if (!id) return "";
  const rows = (await getSql()`
    SELECT id FROM subcontractors WHERE id = ${id} OR legacy_row_id = ${id} OR (btrim(extra_id_raw) <> '' AND btrim(extra_id_raw) = ${id}) LIMIT 1
  `) as { id: string }[];
  return rows[0]?.id ?? "";
}

/** A logged-in sub (portal session) as its database id: by the id in the session, else by email. */
export async function subIdForPortal(sessionId: string, email: string): Promise<string> {
  const byId = sessionId ? await resolveSubId(sessionId) : "";
  if (byId) return byId;
  const rows = (await getSql()`SELECT id FROM subcontractors WHERE lower(btrim(email)) = lower(btrim(${email})) AND btrim(email) <> '' ORDER BY updated_at DESC LIMIT 1`) as { id: string }[];
  return rows[0]?.id ?? "";
}

export async function listCoiDocs(subId: string): Promise<CoiDoc[]> {
  if (!(await subInsuranceReady())) return [];
  const rows = (await getSql()`SELECT * FROM sub_coi_documents WHERE sub_id = ${subId} ORDER BY uploaded_at DESC, id DESC LIMIT 20`) as DocRow[];
  return rows.map(toDoc);
}

/** Pending COIs from the portal, oldest first, with who sent them. */
export async function listPendingCoi(): Promise<(CoiDoc & { subId: string; subName: string; currentExpiresOn: string })[]> {
  if (!(await subInsuranceReady())) return [];
  const rows = (await getSql()`
    SELECT d.*, COALESCE(NULLIF(btrim(s.contact_name), ''), s.company_name) AS sub_name,
           s.insurance_expiration::text AS exp_date, s.insurance_expiration_raw, s.extra_insurance_raw
    FROM sub_coi_documents d JOIN subcontractors s ON s.id = d.sub_id
    WHERE d.status = 'pending' ORDER BY d.uploaded_at, d.id
  `) as (DocRow & { sub_name: string; exp_date: string | null; insurance_expiration_raw: string; extra_insurance_raw: string })[];
  return rows.map((row) => ({ ...toDoc(row), subId: row.sub_id, subName: clean(row.sub_name), currentExpiresOn: subExpiration(row) }));
}

/** The sub's date that counts is now this one (and the file's name, as the sheet kept it). */
async function setSubExpiration(subId: string, day: string, fileName: string): Promise<void> {
  await getSql()`
    UPDATE subcontractors SET
      insurance_expiration = ${day}::date,
      insurance_expiration_raw = ${day},
      extra_insurance_raw = CASE WHEN btrim(extra_insurance_raw) <> '' THEN ${day} ELSE extra_insurance_raw END,
      insurance_document_name = ${fileName.slice(0, 300)},
      updated_at = now()
    WHERE id = ${subId}
  `;
}

async function history(subId: string, by: string, detail: string, actorAccountId: string | null = null): Promise<void> {
  await logActivity({ actorAccountId, actorRole: "manager", actorName: by || "System", action: "update", entityType: "subcontractor", entityId: subId, detail });
}

type NewCoi = { subId: string; fileUrl: string; fileName: string; contentType: string; expiresOn: string; by: string; actorAccountId?: string | null };

/** The office uploads a COI: it counts at once. */
export async function addOfficeCoi(input: NewCoi): Promise<void> {
  if (!(await subInsuranceReady())) throw new Error("Insurance uploads work once migration 056 is applied.");
  const sql = getSql();
  await sql`UPDATE sub_coi_documents SET status = 'replaced' WHERE sub_id = ${input.subId} AND status = 'approved'`;
  await sql`
    INSERT INTO sub_coi_documents (sub_id, file_url, file_name, content_type, expires_on, source, status, uploaded_by, reviewed_by, reviewed_at)
    VALUES (${input.subId}, ${input.fileUrl}, ${input.fileName}, ${input.contentType}, ${input.expiresOn}::date, 'office', 'approved', ${input.by}, ${input.by}, now())
  `;
  await setSubExpiration(input.subId, input.expiresOn, input.fileName);
  await takeDownPapers(`coi:${input.subId}:`, `${input.by} (new insurance)`);
  await history(input.subId, input.by, `Insurance uploaded by the office. Expires ${input.expiresOn}.`, input.actorAccountId ?? null);
}

/** A sub sends a COI from the portal: it waits for the office. */
export async function addSubCoi(input: NewCoi & { subName: string }): Promise<void> {
  if (!(await subInsuranceReady())) throw new Error("Not available yet.");
  const sql = getSql();
  // A newer one from the sub takes the place of one still waiting.
  const older = (await sql`UPDATE sub_coi_documents SET status = 'replaced' WHERE sub_id = ${input.subId} AND status = 'pending' RETURNING id::text`) as { id: string }[];
  for (const doc of older) await takeDownPapers(`coi:${input.subId}:review:${doc.id}`, "A newer one was sent");
  const rows = (await sql`
    INSERT INTO sub_coi_documents (sub_id, file_url, file_name, content_type, expires_on, source, status, uploaded_by)
    VALUES (${input.subId}, ${input.fileUrl}, ${input.fileName}, ${input.contentType}, ${input.expiresOn}::date, 'sub', 'pending', ${input.by})
    RETURNING id::text
  `) as { id: string }[];
  await pinOnce({
    itemId: `coi:${input.subId}:review:${rows[0].id}`,
    title: input.subName || "Sub insurance",
    label: "Insurance to check",
    notes: `New insurance sent from the portal. Expires ${input.expiresOn}. Approve or reject it.`,
    href: "/sub-center?tab=insurance",
    square: "",
  });
  await history(input.subId, input.subName || input.by, `Insurance sent from the sub portal, waiting for approval. Expires ${input.expiresOn}.`);
}

/** Approve a COI the sub sent (with the date the office checked). false when it was not waiting. */
export async function approveCoi(docId: string, expiresOn: string, by: string, actorAccountId: string | null): Promise<boolean> {
  if (!(await subInsuranceReady()) || !/^\d+$/.test(docId)) return false;
  const sql = getSql();
  const rows = (await sql`SELECT sub_id, file_name FROM sub_coi_documents WHERE id = ${docId}::bigint AND status = 'pending'`) as { sub_id: string; file_name: string }[];
  const doc = rows[0];
  if (!doc) return false;
  await sql`UPDATE sub_coi_documents SET status = 'replaced' WHERE sub_id = ${doc.sub_id} AND status = 'approved'`;
  await sql`UPDATE sub_coi_documents SET status = 'approved', expires_on = ${expiresOn}::date, reviewed_by = ${by}, reviewed_at = now() WHERE id = ${docId}::bigint`;
  await setSubExpiration(doc.sub_id, expiresOn, doc.file_name);
  await takeDownPapers(`coi:${doc.sub_id}:`, `${by} (approved)`);
  await history(doc.sub_id, by, `Insurance from the sub portal approved. Expires ${expiresOn}.`, actorAccountId);
  return true;
}

/** Reject a COI the sub sent; the sub sees the reason in the portal. */
export async function rejectCoi(docId: string, reason: string, by: string, actorAccountId: string | null): Promise<boolean> {
  if (!(await subInsuranceReady()) || !/^\d+$/.test(docId)) return false;
  const rows = (await getSql()`
    UPDATE sub_coi_documents SET status = 'rejected', reject_reason = ${reason.slice(0, 300)}, reviewed_by = ${by}, reviewed_at = now()
    WHERE id = ${docId}::bigint AND status = 'pending' RETURNING sub_id
  `) as { sub_id: string }[];
  const subId = rows[0]?.sub_id;
  if (!subId) return false;
  await takeDownPapers(`coi:${subId}:review:${docId}`, `${by} (rejected)`);
  await history(subId, by, `Insurance from the sub portal rejected: ${reason}`, actorAccountId);
  return true;
}

/** What the sub sees in the portal. */
export async function portalInsurance(subId: string): Promise<{ expiresOn: string; state: ReturnType<typeof insuranceState>; waiting: boolean; rejectedReason: string }> {
  const [row] = await subRows("id = $1", [subId]);
  const expiresOn = row ? subExpiration(row) : "";
  let waiting = false;
  let rejectedReason = "";
  if (await subInsuranceReady()) {
    const docs = (await getSql()`SELECT status, reject_reason FROM sub_coi_documents WHERE sub_id = ${subId} AND status IN ('pending', 'rejected', 'approved') ORDER BY uploaded_at DESC, id DESC LIMIT 1`) as { status: string; reject_reason: string }[];
    waiting = docs[0]?.status === "pending";
    rejectedReason = docs[0]?.status === "rejected" ? docs[0].reject_reason || "—" : "";
  }
  return { expiresOn, state: insuranceState(expiresOn), waiting, rejectedReason };
}

/* ---------- the daily reminders ---------- */

export type InsuranceCheckResult = { pinned: number; officeEmails: number };

/** The office side: a paper and an email to info@, 30 days before and on expiry. */
export async function runInsuranceChecks(origin: string): Promise<InsuranceCheckResult> {
  const result: InsuranceCheckResult = { pinned: 0, officeEmails: 0 };
  if (!(await subInsuranceReady())) return result;
  const sql = getSql();
  const today = easternToday();
  const all = await listSubInsurance(today);
  for (const sub of all) {
    if (!sub.expiresOn || sub.daysLeft === null) continue;
    const kind = sub.state === "soon" ? "soon" : sub.state === "expired" && sub.daysLeft >= -INSURANCE_SOON_DAYS ? "expired" : null;
    if (!kind) continue;
    const claimed = (await sql`
      INSERT INTO sub_coi_alerts (sub_id, expires_on, kind) VALUES (${sub.subId}, ${sub.expiresOn}::date, ${kind})
      ON CONFLICT DO NOTHING RETURNING sub_id
    `) as unknown[];
    if (claimed.length === 0) continue;

    const expired = kind === "expired";
    if (
      await pinOnce({
        itemId: `coi:${sub.subId}:${kind}:${sub.expiresOn}`,
        title: sub.name || "Sub insurance",
        label: expired ? "Insurance expired" : "Insurance expiring",
        notes: `${expired ? "Expired" : "Expires"} ${sub.expiresOn}${sub.company && sub.company !== sub.name ? ` · ${sub.company}` : ""}`,
        href: "/sub-center?tab=insurance",
        square: "",
      })
    )
      result.pinned += 1;

    try {
      const office = officeInsuranceEmail({ subName: sub.name, company: sub.company, expiresOn: sub.expiresOn, expired, link: `${origin}/sub-center?tab=insurance` });
      if (await sendHtmlEmail({ to: [INSURANCE_OFFICE_EMAIL], fromName: "Cleaning World CRM", ...office, log: { type: "Sub insurance", subId: sub.subId, subName: sub.name, sentBy: "System" } })) result.officeEmails += 1;
    } catch (error) {
      console.error("[insurance] office email:", error instanceof Error ? error.message : error);
    }
  }
  return result;
}

/* ---------- reminders to subs ---------- */

export type SubReminderKind = "missing" | "expired" | "soon30" | "soon14" | "soon3";
export type SubReminderPlan = { subId: string; name: string; email: string; kind: SubReminderKind; expiresOn: string };

const EMAIL_RE = /^[^@\s,;]+@[^@\s,;]+\.[^@\s,;]+$/;
const REPEAT_DAYS = 7;

/** Active subs (status Active or blank) with at least one active account (linked, or by name). */
async function activeSubsWithAccounts(): Promise<Set<string>> {
  const rows = (await getSql().query(
    `SELECT s.id FROM subcontractors s
     WHERE (btrim(s.status) = '' OR s.status ILIKE 'active%')
       AND EXISTS (
         SELECT 1 FROM accounts a
         WHERE a.status_key = 'active' AND NOT a.is_test AND ${accountLive("a")}
           AND (a.subcontractor_id = s.id
                OR (a.subcontractor_id IS NULL AND btrim(a.subcontractor_raw) <> ''
                    AND lower(btrim(a.subcontractor_raw)) IN (lower(btrim(s.contact_name)), lower(btrim(s.company_name))))))`
  )) as { id: string }[];
  return new Set(rows.map((row) => row.id));
}

type LogRow = { sub_id: string; kind: SubReminderKind; expires_on: string; last: string | Date };

/** Who gets a reminder today, and which one. Nothing is sent. Also how many were held back (a COI waiting) or have no email. */
export async function planSubInsuranceReminders(today = easternToday()): Promise<{ plans: SubReminderPlan[]; waiting: number; noEmail: number }> {
  const out = { plans: [] as SubReminderPlan[], waiting: 0, noEmail: 0 };
  if (!(await subInsuranceReady())) return out;
  const [all, active, log] = await Promise.all([
    listSubInsurance(today),
    activeSubsWithAccounts(),
    getSql()`SELECT sub_id, kind, COALESCE(expires_on::text, '') AS expires_on, max(sent_at) AS last FROM sub_insurance_reminders GROUP BY 1, 2, 3` as unknown as Promise<LogRow[]>,
  ]);
  const now = Date.now();
  for (const sub of all) {
    if (!active.has(sub.subId)) continue;
    let kind: SubReminderKind | null = null;
    if (sub.state === "none") kind = "missing";
    else if (sub.state === "expired") kind = "expired";
    else if (sub.state === "soon" && sub.daysLeft !== null) kind = sub.daysLeft <= 3 ? "soon3" : sub.daysLeft <= 14 ? "soon14" : "soon30";
    if (!kind) continue;
    // Paused while a COI the sub sent waits for the office (a rejected one does not pause).
    if (sub.pending) {
      out.waiting += 1;
      continue;
    }
    const mine = log.filter((row) => row.sub_id === sub.subId);
    if (kind === "missing" || kind === "expired") {
      const last = Math.max(0, ...mine.filter((row) => row.kind === "missing" || row.kind === "expired").map((row) => new Date(row.last).getTime()));
      if (last && now - last < REPEAT_DAYS * 86_400_000) continue;
    } else if (mine.some((row) => row.kind === kind && row.expires_on === sub.expiresOn)) {
      continue;
    }
    if (!EMAIL_RE.test(sub.email)) {
      out.noEmail += 1;
      continue;
    }
    out.plans.push({ subId: sub.subId, name: sub.name, email: sub.email, kind, expiresOn: sub.expiresOn });
  }
  return out;
}

export async function runSubInsuranceReminders(origin: string): Promise<{ sent: number; failed: number; waiting: number; noEmail: number; off: boolean }> {
  const result = { sent: 0, failed: 0, waiting: 0, noEmail: 0, off: false };
  if (!(await getFeatureSetting("subInsurancePortal")).on) return { ...result, off: true };
  const plan = await planSubInsuranceReminders();
  result.waiting = plan.waiting;
  result.noEmail = plan.noEmail;
  const sql = getSql();
  for (const reminder of plan.plans) {
    const kind = reminder.kind === "missing" ? "missing" : reminder.kind === "expired" ? "expired" : "soon";
    let ok = false;
    try {
      const mail = subInsuranceEmail({ subName: reminder.name, expiresOn: reminder.expiresOn, kind, portalUrl: `${origin}/subcontractor-portal` });
      ok = await sendHtmlEmail({ to: [reminder.email], fromName: "Cleaning World", ...mail, log: { type: "Sub insurance reminder", subId: reminder.subId, subName: reminder.name, sentBy: "System" } });
    } catch (error) {
      console.error("[insurance] sub reminder:", error instanceof Error ? error.message : error);
    }
    if (!ok) {
      result.failed += 1;
      continue;
    }
    result.sent += 1;
    await sql`
      INSERT INTO sub_insurance_reminders (sub_id, kind, expires_on, sent_to)
      VALUES (${reminder.subId}, ${reminder.kind}, ${reminder.expiresOn || null}, ${reminder.email})
    `;
    const what =
      reminder.kind === "missing"
        ? "no insurance on file"
        : reminder.kind === "expired"
          ? `expired ${reminder.expiresOn}`
          : `expires ${reminder.expiresOn} (${reminder.kind.slice(4)} days before)`;
    await history(reminder.subId, "System", `Insurance reminder emailed to ${reminder.email}: ${what}.`);
  }
  return result;
}
