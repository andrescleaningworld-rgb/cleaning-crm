// "Price & frequency change" records (migration 072, account_price_changes).
// Prices are before tax, like every price in the CRM. Postgres only.

import { getSql } from "@/lib/db";

export type PriceChange = {
  id: number;
  accountId: string;
  accountName: string;
  effectiveDate: string;
  scheduleStart: string;
  oldSchedule: string;
  newSchedule: string;
  oldFrequency: string;
  newFrequency: string;
  oldPrice: number | null;
  newPrice: number | null;
  oldSubPay: number | null;
  newSubPay: number | null;
  /** new - old CW monthly price (0 when either is missing). */
  monthlyDifference: number;
  estimateUrl: string;
  estimateName: string;
  note: string;
  createdBy: string;
  createdAt: string;
};

type Row = {
  id: string | number;
  account_id: string;
  account_name: string;
  effective_date: string;
  schedule_start: string | null;
  old_schedule: string;
  new_schedule: string;
  old_frequency: string;
  new_frequency: string;
  old_price: string | null;
  new_price: string | null;
  old_sub_pay: string | null;
  new_sub_pay: string | null;
  estimate_url: string;
  estimate_name: string;
  note: string;
  created_by: string;
  created_at: string;
};

const COLUMNS = `id, account_id, account_name, effective_date::text AS effective_date, schedule_start::text AS schedule_start,
  old_schedule, new_schedule, old_frequency, new_frequency, old_price::text AS old_price, new_price::text AS new_price,
  old_sub_pay::text AS old_sub_pay, new_sub_pay::text AS new_sub_pay, estimate_url, estimate_name, note, created_by, created_at::text AS created_at`;

const num = (value: string | null) => (value === null || value === "" ? null : Number(value));

function toChange(row: Row): PriceChange {
  const oldPrice = num(row.old_price);
  const newPrice = num(row.new_price);
  return {
    id: Number(row.id),
    accountId: row.account_id,
    accountName: row.account_name,
    effectiveDate: row.effective_date,
    scheduleStart: row.schedule_start ?? "",
    oldSchedule: row.old_schedule,
    newSchedule: row.new_schedule,
    oldFrequency: row.old_frequency,
    newFrequency: row.new_frequency,
    oldPrice,
    newPrice,
    oldSubPay: num(row.old_sub_pay),
    newSubPay: num(row.new_sub_pay),
    monthlyDifference: oldPrice !== null && newPrice !== null ? Math.round((newPrice - oldPrice) * 100) / 100 : 0,
    estimateUrl: row.estimate_url,
    estimateName: row.estimate_name,
    note: row.note,
    createdBy: row.created_by,
    createdAt: row.created_at,
  };
}

/** False until migration 072 has run on this database. */
export async function priceChangesReady(): Promise<boolean> {
  const rows = (await getSql()`SELECT to_regclass('public.account_price_changes') IS NOT NULL AS ready`) as { ready: boolean }[];
  return rows[0]?.ready === true;
}

/** One account's changes, newest first. */
export async function listAccountPriceChanges(accountId: string): Promise<PriceChange[]> {
  const rows = (await getSql().query(`SELECT ${COLUMNS} FROM account_price_changes WHERE account_id = $1 ORDER BY effective_date DESC, created_at DESC`, [
    accountId,
  ])) as Row[];
  return rows.map(toChange);
}

/** Every change with an effective date in [from, to] (YYYY-MM-DD, inclusive), newest first. */
export async function listPriceChangesBetween(from: string, to: string): Promise<PriceChange[]> {
  const rows = (await getSql().query(
    `SELECT ${COLUMNS} FROM account_price_changes WHERE effective_date BETWEEN $1::date AND $2::date ORDER BY effective_date DESC, created_at DESC`,
    [from, to]
  )) as Row[];
  return rows.map(toChange);
}

export async function addPriceChange(input: {
  accountId: string;
  accountName: string;
  effectiveDate: string;
  scheduleStart: string;
  oldSchedule: string;
  newSchedule: string;
  oldFrequency: string;
  newFrequency: string;
  oldPrice: number | null;
  newPrice: number | null;
  oldSubPay: number | null;
  newSubPay: number | null;
  estimateUrl: string;
  estimateName: string;
  note: string;
  createdBy: string;
}): Promise<PriceChange> {
  const rows = (await getSql().query(
    `INSERT INTO account_price_changes (account_id, account_name, effective_date, schedule_start, old_schedule, new_schedule, old_frequency, new_frequency,
       old_price, new_price, old_sub_pay, new_sub_pay, estimate_url, estimate_name, note, created_by)
     VALUES ($1, $2, $3::date, NULLIF($4, '')::date, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
     RETURNING ${COLUMNS}`,
    [
      input.accountId,
      input.accountName,
      input.effectiveDate,
      input.scheduleStart,
      input.oldSchedule,
      input.newSchedule,
      input.oldFrequency,
      input.newFrequency,
      input.oldPrice,
      input.newPrice,
      input.oldSubPay,
      input.newSubPay,
      input.estimateUrl,
      input.estimateName,
      input.note,
      input.createdBy,
    ]
  )) as Row[];
  return toChange(rows[0]);
}
