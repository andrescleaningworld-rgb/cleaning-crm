// Deleted supply orders (migration 041): an order deleted on Supply Orders
// keeps its rows, marked deleted_at. Every list of orders leaves them out
// with notDeleted(). Its own file, with only the database import, so the
// supplies, crew supplies, shelves and board modules can all use it without
// importing each other. Where migration 041 is not in yet nothing is deleted,
// and the lists read as before.
import { getSql } from "@/lib/db";

let ready = false;

export async function orderDeleteReady(): Promise<boolean> {
  if (ready) return true;
  try {
    const rows = (await getSql()`
      SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'sub_supply_orders' AND column_name = 'deleted_at')
         AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'supply_orders' AND column_name = 'deleted_at') AS ok
    `) as { ok: boolean }[];
    ready = rows[0]?.ok === true;
  } catch {
    ready = false;
  }
  return ready;
}

/** SQL that keeps only orders not deleted, for the table alias given ("" before migration 041). */
export async function notDeleted(alias: string): Promise<string> {
  return (await orderDeleteReady()) ? `${alias ? `${alias}.` : ""}deleted_at IS NULL` : "true";
}
