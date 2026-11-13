// Postgres versions of the sales reads/writes in lib/googleSheets.ts
// ("Sales & Commissions"). Same function names, arguments, return shapes,
// ordering and number rules, so lib/data/sales.ts can switch between the two.
//
// Money and percent are stored as the text the sheet holds and read with
// the same rule as the Sheets version: Number(text) || 0 (so "$500.00"
// reads as 0, exactly as it does today).

import { getSql } from "@/lib/db";
import type { Sale, SaleInput } from "@/lib/googleSheets";
import { dateOrNull } from "@/lib/dateUtils";

type SaleRow = {
  sale_id: string;
  account_id_raw: string;
  account_name: string;
  sale_date_raw: string;
  service_sold: string;
  work_order_estimate_number: string;
  sold_by: string;
  amount_sold_raw: string;
  commission_percent_raw: string;
  commission_amount_raw: string;
  status: string;
  notes: string;
  created_at_raw: string;
  updated_at_raw: string;
  service_type: string;
  manager: string;
  amount_raw: string;
  recurring_start_date_raw: string;
  recurring_end_date_raw: string;
  sheet_row: number;
};

export async function fetchSales(): Promise<Sale[]> {
  const sql = getSql();
  // An extra job's Sale also carries the job's date: its one-time commission counts in the month the service is done.
  // A database without the Extra Jobs tables (migration 021) has no such sales.
  const rows = (await sql
    .query(
      `SELECT s.*, j.job_day AS service_day, j.job_id
       FROM sales s
       LEFT JOIN LATERAL (
         SELECT x.job_date::text AS job_day, x.id::text AS job_id FROM extra_jobs x WHERE x.sale_id <> '' AND x.sale_id = s.sale_id LIMIT 1
       ) j ON true
       ORDER BY s.sheet_row`
    )
    .catch(() => sql.query(`SELECT * FROM sales ORDER BY sheet_row`))) as (SaleRow & { service_day?: string | null; job_id?: string | null })[];
  return rows
    .map((r) => ({
      sheetRow: r.sheet_row,
      id: r.sale_id,
      accountId: r.account_id_raw,
      accountName: r.account_name,
      saleDate: r.sale_date_raw,
      serviceSold: r.service_sold,
      workOrderEstimateNumber: r.work_order_estimate_number,
      soldBy: r.sold_by,
      amountSold: Number(r.amount_sold_raw) || 0,
      commissionPercent: Number(r.commission_percent_raw) || 0,
      commissionAmount: Number(r.commission_amount_raw) || 0,
      status: r.status,
      notes: r.notes,
      createdAt: r.created_at_raw,
      updatedAt: r.updated_at_raw,
      serviceType: r.service_type,
      manager: r.manager,
      amount: Number(r.amount_raw) || 0,
      recurringStartDate: r.recurring_start_date_raw,
      recurringEndDate: r.recurring_end_date_raw,
      serviceDate: r.service_day ?? "",
      extraJobId: r.job_id ?? "",
    }))
    .filter((s) => s.id);
}

/** What the Sales page's Edit changes. The account (and its manager) stay as they are. */
export type SaleEdit = Omit<SaleInput, "accountId" | "accountName" | "manager">;

/**
 * Changes one sale (Sales page → Edit). `sheetRow` pins the exact row, since
 * two old sales can share an ID. A sale made by an extra job is changed from
 * the job (its change form rewrites the sale), so it is refused here.
 * The commission amount is worked out again from the amount and the %.
 */
export async function updateSale(id: string, sheetRow: number, data: SaleEdit): Promise<"ok" | "not-found" | "extra-job"> {
  const sql = getSql();
  const found = (await sql.query(
    `SELECT EXISTS (SELECT 1 FROM sales WHERE sale_id = $1 AND sheet_row = $2) AS found,
            (to_regclass('public.extra_jobs') IS NOT NULL) AS has_jobs`,
    [id, sheetRow]
  )) as { found: boolean; has_jobs: boolean }[];
  if (!found[0]?.found) return "not-found";
  if (found[0].has_jobs) {
    const jobs = (await sql.query(`SELECT 1 FROM extra_jobs WHERE sale_id <> '' AND sale_id = $1 LIMIT 1`, [id])) as unknown[];
    if (jobs.length > 0) return "extra-job";
  }

  const commissionAmount = data.amountSold * (data.commissionPercent / 100);
  const now = new Date().toISOString();
  await sql.query(
    `UPDATE sales SET
       sale_date_raw = $3, sale_date = $4::date, service_sold = $5, work_order_estimate_number = $6, sold_by = $7,
       amount_sold_raw = $8, amount_sold = $9::numeric, amount_raw = $8,
       commission_percent_raw = $10, commission_percent = $11::numeric, commission_amount_raw = $12, commission_amount = $13::numeric,
       status = $14, notes = $15, service_type = $16,
       recurring_start_date_raw = $17, recurring_start_date = $18::date, recurring_end_date_raw = $19, recurring_end_date = $20::date,
       updated_at_raw = $21::text, sale_updated_at = $21::timestamptz, updated_at = now()
     WHERE sale_id = $1 AND sheet_row = $2`,
    [
      id,
      sheetRow,
      data.saleDate,
      dateOrNull(data.saleDate),
      data.serviceSold,
      data.workOrderEstimateNumber,
      data.soldBy,
      String(data.amountSold),
      Number.isFinite(data.amountSold) ? data.amountSold : null,
      String(data.commissionPercent),
      data.commissionPercent,
      String(commissionAmount),
      Number.isFinite(commissionAmount) ? commissionAmount : null,
      data.status,
      data.notes,
      data.serviceType,
      data.recurringStartDate,
      dateOrNull(data.recurringStartDate),
      data.recurringEndDate,
      dateOrNull(data.recurringEndDate),
      now,
    ]
  );
  return "ok";
}

export async function appendSale(data: SaleInput): Promise<string> {
  const stamp = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  // Same ID format as the Sheets version ("SALE-20260819152856").
  const id = `SALE-${stamp.getFullYear()}${pad(stamp.getMonth() + 1)}${pad(stamp.getDate())}${pad(stamp.getHours())}${pad(stamp.getMinutes())}${pad(stamp.getSeconds())}`;

  const commissionAmount = data.amountSold * (data.commissionPercent / 100);
  const now = new Date().toISOString();

  const sql = getSql();
  // The old Amount column (Q) gets the same value as Amount Sold, as in the
  // Sheets version; the dead "Commission Amount" column (R) is never written.
  await sql.query(
    `WITH next AS (SELECT COALESCE(MAX(sheet_row), 1) + 1 AS n FROM sales)
     INSERT INTO sales (
       legacy_key, sale_id, account_id_raw, account_name, account_ref, sale_date_raw, sale_date,
       service_sold, work_order_estimate_number, sold_by,
       amount_sold_raw, amount_sold, commission_percent_raw, commission_percent, commission_amount_raw, commission_amount,
       status, notes, created_at_raw, sale_created_at, updated_at_raw, sale_updated_at,
       service_type, manager, amount_raw, recurring_start_date_raw, recurring_start_date, recurring_end_date_raw, recurring_end_date, sheet_row)
     SELECT
       CASE WHEN EXISTS (SELECT 1 FROM sales WHERE legacy_key = $1::text) THEN $1::text || '#' || next.n::text ELSE $1::text END,
       $1::text, $2::text, $3::text,
       COALESCE(
         (SELECT id FROM accounts WHERE btrim($2::text) <> '' AND id = btrim($2::text) LIMIT 1),
         (SELECT CASE WHEN count(*) = 1 THEN min(id) END FROM accounts WHERE (to_jsonb(accounts)->>'deleted_at') IS NULL AND btrim($3::text) <> '' AND lower(btrim(account_name)) = lower(btrim($3::text)))
       ),
       $4::text, $5::date, $6::text, $7::text, $8::text,
       $9::text, $10::numeric, $11::text, $12::numeric, $13::text, $14::numeric,
       $15::text, $16::text, $17::text, $17::timestamptz, $17::text, $17::timestamptz,
       $18::text, $19::text, $9::text, $20::text, $21::date, $22::text, $23::date, next.n
     FROM next`,
    [
      id,
      data.accountId,
      data.accountName,
      data.saleDate,
      dateOrNull(data.saleDate),
      data.serviceSold,
      data.workOrderEstimateNumber,
      data.soldBy,
      String(data.amountSold),
      Number.isFinite(data.amountSold) ? data.amountSold : null,
      String(data.commissionPercent),
      Number.isFinite(data.commissionPercent) ? data.commissionPercent : null,
      String(commissionAmount),
      Number.isFinite(commissionAmount) ? commissionAmount : null,
      data.status,
      data.notes,
      now,
      data.serviceType,
      data.manager,
      data.recurringStartDate,
      dateOrNull(data.recurringStartDate),
      data.recurringEndDate,
      dateOrNull(data.recurringEndDate),
    ]
  );
  return id;
}
