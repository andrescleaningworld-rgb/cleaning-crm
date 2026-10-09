// Postgres versions of the sales reads/writes in lib/googleSheets.ts
// ("Sales & Commissions"). Same function names, arguments, return shapes,
// ordering and number rules, so lib/data/sales.ts can switch between the two.
//
// Money and percent are stored as the text the sheet holds and read with
// the same rule as the Sheets version: Number(text) || 0 (so "$500.00"
// reads as 0, exactly as it does today).

import { getSql } from "@/lib/db";
import type { Sale, SaleInput } from "@/lib/googleSheets";

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

/** YYYY-MM-DD for the typed column, or null. */
function toDay(text: string): string | null {
  const m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(String(text ?? "").trim());
  return m ? `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}` : null;
}

export async function fetchSales(): Promise<Sale[]> {
  const sql = getSql();
  const rows = (await sql.query(`SELECT * FROM sales ORDER BY sheet_row`)) as SaleRow[];
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
    }))
    .filter((s) => s.id);
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
         (SELECT CASE WHEN count(*) = 1 THEN min(id) END FROM accounts WHERE btrim($3::text) <> '' AND lower(btrim(account_name)) = lower(btrim($3::text)))
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
      toDay(data.saleDate),
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
      toDay(data.recurringStartDate),
      data.recurringEndDate,
      toDay(data.recurringEndDate),
    ]
  );
  return id;
}
