// Extra Jobs in Postgres (db/migrations/021_extra_jobs.sql). Postgres only.
// Nothing here reads or writes Google Sheets or Apps Script.
//
// The tables may not exist yet in a database (production does not have them
// until migration 021 is applied there), so every caller first asks
// extraJobsReady() and treats "not ready" as "not set up here yet".
//
// For later, both easy to add from here:
//   - the customer portal asking for an extra job: createExtraJob() with
//     source "portal" and the request's id in portalRequestId;
//   - the Pin Board: listExtraJobs() gives the jobs still on "setup" (pin
//     them) and the ones that are "done" (take them down).

import { getSql } from "@/lib/db";
import {
  EXTRA_JOB_COMMISSION_PERCENT,
  type ExtraJob,
  type ExtraJobAccount,
  type ExtraJobPhoto,
  type ExtraJobSource,
  type ExtraJobStatus,
  type FormChoices,
  type NewExtraJob,
  type PayRow,
} from "@/lib/extraJobs";
import { appendSale } from "@/lib/pg/sales";

let ready: boolean | null = null;

export async function extraJobsReady(): Promise<boolean> {
  if (ready === true) return true;
  try {
    const sql = getSql();
    const rows = (await sql`SELECT to_regclass('public.extra_jobs') IS NOT NULL AS ok`) as { ok: boolean }[];
    ready = rows[0]?.ok === true;
  } catch {
    ready = false;
  }
  return ready === true;
}

const iso = (value: string | Date | null | undefined) => (value ? new Date(value).toISOString() : "");

type JobRow = {
  id: string;
  job_number: string;
  account_id: string;
  account_name: string;
  source: ExtraJobSource;
  description: string;
  job_day: string;
  customer_price: string;
  sub_id: string;
  sub_name: string;
  sub_pay: string;
  sold_by: string;
  manager: string;
  status: ExtraJobStatus;
  sale_id: string;
  created_by: string;
  created_at: string | Date;
  setup_emailed_at: string | Date | null;
  done_by: string;
  done_at: string | Date | null;
  done_note: string;
  done_emailed_at: string | Date | null;
  photos: { id: number; url: string; file_name: string; uploaded_by: string; uploaded_at: string }[] | null;
};

function toJob(row: JobRow): ExtraJob {
  const photos: ExtraJobPhoto[] = (row.photos ?? []).map((photo) => ({
    id: String(photo.id),
    url: photo.url,
    fileName: photo.file_name,
    uploadedBy: photo.uploaded_by,
    uploadedAt: iso(photo.uploaded_at),
  }));
  return {
    id: String(row.id),
    jobNumber: row.job_number,
    accountId: row.account_id,
    accountName: row.account_name,
    source: row.source,
    description: row.description,
    jobDate: row.job_day,
    customerPrice: Number(row.customer_price) || 0,
    subId: row.sub_id,
    subName: row.sub_name,
    subPay: Number(row.sub_pay) || 0,
    soldBy: row.sold_by,
    manager: row.manager,
    status: row.status,
    saleId: row.sale_id,
    createdBy: row.created_by,
    createdAt: iso(row.created_at),
    doneBy: row.done_by,
    doneAt: iso(row.done_at),
    doneNote: row.done_note,
    setupEmailed: Boolean(row.setup_emailed_at),
    doneEmailed: Boolean(row.done_emailed_at),
    photos,
  };
}

const SELECT_JOB = `
  SELECT j.id::text, j.job_number, j.account_id, j.account_name, j.source, j.description, j.job_date::text AS job_day,
         j.customer_price::text, j.sub_id, j.sub_name, j.sub_pay::text, j.sold_by, j.manager, j.status, j.sale_id,
         j.created_by, j.created_at, j.setup_emailed_at, j.done_by, j.done_at, j.done_note, j.done_emailed_at,
         COALESCE((
           SELECT jsonb_agg(jsonb_build_object('id', p.id, 'url', p.url, 'file_name', p.file_name, 'uploaded_by', p.uploaded_by, 'uploaded_at', p.uploaded_at) ORDER BY p.uploaded_at, p.id)
           FROM extra_job_photos p WHERE p.job_id = j.id AND p.moment = 'after'
         ), '[]'::jsonb) AS photos
  FROM extra_jobs j`;

/** Every extra job: the ones still to do first (soonest date first), then the done ones (newest first). */
export async function listExtraJobs(): Promise<ExtraJob[]> {
  const sql = getSql();
  const rows = (await sql.query(
    `${SELECT_JOB} ORDER BY (j.status = 'done'), CASE WHEN j.status = 'setup' THEN j.job_date END ASC, j.done_at DESC NULLS LAST, j.id DESC LIMIT 1000`
  )) as JobRow[];
  return rows.map(toJob);
}

export async function getExtraJob(id: string): Promise<ExtraJob | null> {
  if (!/^\d+$/.test(id)) return null;
  const sql = getSql();
  const rows = (await sql.query(`${SELECT_JOB} WHERE j.id = $1::bigint`, [id])) as JobRow[];
  return rows[0] ? toJob(rows[0]) : null;
}

/** What the work order prints about the place. */
export async function getJobAccount(accountId: string): Promise<ExtraJobAccount | null> {
  if (!accountId) return null;
  const sql = getSql();
  const rows = (await sql`
    SELECT address, city, zip, key_alarm_access_info, has_key, alarm_code, contact_name, phone FROM accounts WHERE id = ${accountId} LIMIT 1
  `) as { address: string; city: string; zip: string; key_alarm_access_info: string; has_key: string; alarm_code: string; contact_name: string; phone: string }[];
  const row = rows[0];
  if (!row) return null;
  return {
    address: row.address.trim(),
    city: row.city.trim(),
    zip: row.zip.trim(),
    keyAccess: row.key_alarm_access_info.trim(),
    hasKey: row.has_key.trim(),
    alarmCode: row.alarm_code.trim(),
    contactName: row.contact_name.trim(),
    phone: row.phone.trim(),
  };
}

/** The lists the quick form picks from: accounts (with their usual sub), subs, and who can have sold it. */
export async function getFormChoices(me: string): Promise<FormChoices> {
  const sql = getSql();
  const [accounts, subs, sellers] = (await Promise.all([
    sql`
      SELECT a.id, btrim(a.account_name) AS name, COALESCE(a.subcontractor_id, '') AS sub_id,
             COALESCE(NULLIF(btrim(m.name), ''), btrim(a.manager_raw), '') AS manager
      FROM accounts a LEFT JOIN managers m ON m.id = a.manager_id
      WHERE a.id IS NOT NULL AND btrim(a.account_name) <> '' AND a.status_key <> 'cancelled'
      ORDER BY lower(btrim(a.account_name))
    `,
    sql`
      SELECT id, COALESCE(NULLIF(btrim(contact_name), ''), NULLIF(btrim(company_name), ''), id) AS name
      FROM subcontractors
      WHERE lower(btrim(status)) NOT IN ('inactive', 'terminated', 'archived')
      ORDER BY lower(COALESCE(NULLIF(btrim(contact_name), ''), NULLIF(btrim(company_name), ''), id))
    `,
    sql`SELECT btrim(name) AS name FROM staff WHERE role = 'Manager' AND active AND btrim(name) <> '' AND lower(btrim(name)) <> 'cw' ORDER BY lower(name)`,
  ])) as [{ id: string; name: string; sub_id: string; manager: string }[], { id: string; name: string }[], { name: string }[]];
  return {
    accounts: accounts.map((row) => ({ id: row.id, name: row.name, subId: row.sub_id, manager: row.manager })),
    subs,
    sellers: sellers.map((row) => row.name),
    me,
  };
}

/**
 * Sets an extra job up and creates its one-time Sale (10% commission).
 * If the Sale cannot be saved, the job is not kept either: a job with no
 * Sale would be an extra job nobody gets commission for.
 */
export async function createExtraJob(input: NewExtraJob & { portalRequestId?: string }, by: string): Promise<ExtraJob> {
  const sql = getSql();
  const inserted = (await sql`
    INSERT INTO extra_jobs (job_number, account_id, account_name, source, portal_request_id, description, job_date, customer_price,
                            sub_id, sub_name, sub_pay, sold_by, manager, created_by)
    VALUES ('EJ-' || nextval('extra_job_number_seq')::text, ${input.accountId}, ${input.accountName.trim()}, ${input.source}, ${input.portalRequestId ?? ""},
            ${input.description.trim().slice(0, 2000)}, ${input.jobDate}::date, ${input.customerPrice}, ${input.subId}, ${input.subName.trim()}, ${input.subPay},
            ${input.soldBy.trim()}, ${by}, ${by})
    RETURNING id::text, job_number
  `) as { id: string; job_number: string }[];
  const { id, job_number: jobNumber } = inserted[0];

  try {
    const managers = (await sql`
      SELECT COALESCE(NULLIF(btrim(m.name), ''), btrim(a.manager_raw), '') AS manager
      FROM accounts a LEFT JOIN managers m ON m.id = a.manager_id WHERE a.id = ${input.accountId} LIMIT 1
    `) as { manager: string }[];
    const saleId = await appendSale({
      accountId: input.accountId,
      accountName: input.accountName.trim(),
      // The sale is made the day the job is set up; the job itself may be weeks away.
      saleDate: new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" }),
      serviceSold: input.description.trim().slice(0, 300),
      workOrderEstimateNumber: jobNumber,
      soldBy: input.soldBy.trim(),
      amountSold: input.customerPrice,
      commissionPercent: EXTRA_JOB_COMMISSION_PERCENT,
      status: "Pending",
      notes: `Extra job ${jobNumber}, for ${input.jobDate}. Created by the Extra Jobs page.`,
      serviceType: "Extra Service",
      manager: managers[0]?.manager ?? "",
      recurringStartDate: "",
      recurringEndDate: "",
    });
    await sql`UPDATE extra_jobs SET sale_id = ${saleId} WHERE id = ${id}::bigint`;
  } catch (error) {
    await sql`DELETE FROM extra_jobs WHERE id = ${id}::bigint`;
    throw error;
  }
  return (await getExtraJob(id)) as ExtraJob;
}

export async function addJobPhoto(jobId: string, url: string, fileName: string, by: string): Promise<void> {
  const sql = getSql();
  await sql`INSERT INTO extra_job_photos (job_id, url, file_name, uploaded_by) VALUES (${jobId}::bigint, ${url}, ${fileName.slice(0, 200)}, ${by})`;
}

/**
 * Marks a job Done (ready to invoice). Needs at least one after photo.
 * Returns "no-photo", "not-found", "already" (someone marked it first) or the job.
 */
export async function finishExtraJob(id: string, by: string, note: string): Promise<ExtraJob | "no-photo" | "not-found" | "already"> {
  const job = await getExtraJob(id);
  if (!job) return "not-found";
  if (job.status === "done") return "already";
  if (job.photos.length === 0) return "no-photo";
  const sql = getSql();
  const rows = (await sql`
    UPDATE extra_jobs SET status = 'done', done_by = ${by}, done_at = now(), done_note = ${note.trim().slice(0, 1000)}
    WHERE id = ${id}::bigint AND status = 'setup'
    RETURNING id
  `) as unknown[];
  if (rows.length === 0) return "already";
  return (await getExtraJob(id)) as ExtraJob;
}

/** Remembers that the office was told. */
export async function stampEmailed(id: string, which: "setup" | "done"): Promise<void> {
  const sql = getSql();
  if (which === "setup") await sql`UPDATE extra_jobs SET setup_emailed_at = now() WHERE id = ${id}::bigint`;
  else await sql`UPDATE extra_jobs SET done_emailed_at = now() WHERE id = ${id}::bigint`;
}

/**
 * "Extra jobs to pay": the Done jobs whose job date is in the pay period,
 * per sub. Jobs that are not in the app, or not marked Done, are not here.
 */
export async function getPayReport(from: string, to: string): Promise<PayRow[]> {
  const sql = getSql();
  const rows = (await sql.query(`${SELECT_JOB} WHERE j.status = 'done' AND j.job_date BETWEEN $1::date AND $2::date ORDER BY lower(j.sub_name), j.job_date, j.id`, [from, to])) as JobRow[];
  const bySub = new Map<string, PayRow>();
  for (const job of rows.map(toJob)) {
    const key = job.subId || job.subName.toLowerCase();
    const row = bySub.get(key) ?? { subId: job.subId, subName: job.subName, jobs: [], total: 0 };
    row.jobs.push(job);
    row.total = Math.round((row.total + job.subPay) * 100) / 100;
    bySub.set(key, row);
  }
  return [...bySub.values()];
}
