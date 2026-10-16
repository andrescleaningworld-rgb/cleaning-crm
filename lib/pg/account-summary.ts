// The numbers on the account page's "Everything for this account" tiles:
// how many visits, account updates, extra jobs, complaints, supply orders,
// photos, to-dos and sales this account has, and how many are still open.
// Read only: nothing is written anywhere.
//
// Which records belong to the account: the same rule as the lists the tiles
// open (app/components/account-scope.tsx) and as AccountLink:
//   1. a record whose saved ID is a real account's ID belongs to that account;
//   2. a record with no usable ID belongs to the account with that exact
//      name, but only when exactly one account has that name;
//   3. anything else belongs to nobody.
//
// Each number is asked for by itself: a part of the app that is not in this
// database yet gives null (the tile then shows no number) and never stops
// the others.

import { getSql } from "@/lib/db";

export type Count = { total: number; open: number } | null;
export type AccountSummary = {
  accountName: string;
  visits: Count;
  updates: Count;
  extraJobs: Count;
  complaints: Count;
  supplyOrders: Count;
  photos: Count;
  todos: Count;
  sales: Count;
};

// A real account, as the staff screens list them (test and deleted accounts are left out, like /api/accounts does).
const REAL = `NOT COALESCE(a.is_test, false) AND (to_jsonb(a)->>'deleted_at') IS NULL`;

/** SQL for "this row belongs to the account". $1 = the account's ID, $2 = its name in small letters, $3 = that name is no other account's. */
const belongs = (idColumn: string, nameColumn: string) => `
  CASE
    WHEN btrim(COALESCE(${idColumn}, '')) <> '' AND EXISTS (SELECT 1 FROM accounts a WHERE lower(btrim(a.id)) = lower(btrim(${idColumn})) AND ${REAL})
      THEN lower(btrim(${idColumn})) = lower($1)
    ELSE $3::boolean AND btrim(COALESCE(${nameColumn}, '')) <> '' AND lower(btrim(${nameColumn})) = $2
  END`;

export async function getAccountSummary(accountId: string): Promise<AccountSummary | null> {
  const sql = getSql();
  const id = accountId.trim();
  if (!id) return null;
  const me = (await sql.query(
    `SELECT btrim(a.account_name) AS name,
            (SELECT count(*)::int FROM accounts b WHERE lower(btrim(b.account_name)) = lower(btrim(a.account_name)) AND NOT COALESCE(b.is_test, false) AND (to_jsonb(b)->>'deleted_at') IS NULL) AS same_name
     FROM accounts a WHERE lower(btrim(a.id)) = lower($1) LIMIT 1`,
    [id]
  )) as { name: string; same_name: number }[];
  if (!me[0]) return null;
  const params = [id, me[0].name.toLowerCase(), me[0].same_name === 1];

  const count = async (query: string): Promise<Count> => {
    try {
      const rows = (await sql.query(query, params)) as { total: number; open: number }[];
      return { total: rows[0]?.total ?? 0, open: rows[0]?.open ?? 0 };
    } catch {
      return null;
    }
  };
  const total = (table: string, idColumn: string, nameColumn: string, open = "false") =>
    count(`SELECT count(*)::int AS total, count(*) FILTER (WHERE ${open})::int AS open FROM ${table} t WHERE ${belongs(`t.${idColumn}`, `t.${nameColumn}`)}`);

  const [visits, updates, extraJobs, complaints, todos, sales, photos, subOrders, crewOrders] = await Promise.all([
    total("visits", "account_id_raw", "account_name"),
    total("account_updates", "account_id_raw", "account_name"),
    // Open = set up, not yet done or cancelled.
    total("extra_jobs", "account_id", "account_name", `lower(btrim(t.status)) NOT IN ('done', 'cancelled', 'canceled')`),
    // Open = not closed and not resolved, as the Complaints page reads it.
    total("complaints", "account_id_raw", "account_name", `lower(t.status) NOT LIKE '%closed%' AND lower(t.status) NOT LIKE '%resolved%'`),
    total("todos", "account_id_raw", "account_name", `lower(btrim(t.status)) NOT IN ('done', 'cancelled', 'canceled', 'completed')`),
    total("sales", "account_id_raw", "account_name"),
    total("photo_index", "account_id", "account_name"),
    // Subcontractor portal orders: one row per item, so one order = one group.
    count(`
      SELECT count(*)::int AS total, count(*) FILTER (WHERE o.open)::int AS open
      FROM (
        SELECT COALESCE(NULLIF(btrim(t.order_group_id), ''), NULLIF(btrim(t.order_id), ''), t.id::text) AS order_key,
               bool_or(lower(btrim(t.status)) NOT IN ('completed', 'delivered', 'denied', 'cancelled', 'canceled')) AS open
        FROM sub_supply_orders t WHERE ${belongs("t.account_id_raw", "t.account_name")}
        GROUP BY 1
      ) o`),
    // Crew orders (Crew Link, and a Team Hub site of this account): they carry the real account ID.
    count(`
      SELECT count(*)::int AS total, count(*) FILTER (WHERE so.status IN ('new', 'ordered'))::int AS open
      FROM supply_orders so
      WHERE lower(btrim(COALESCE(so.crew_link_account_id, ''))) = lower($1)
         OR so.site_id IN (SELECT hs.id FROM hub_sites hs WHERE lower(btrim(hs.account_id)) = lower($1))
         -- keeps the three parameters in use: $2 and $3 are not needed here
         OR ($2::text IS NULL AND $3::boolean IS NULL)`),
  ]);

  const supplyOrders: Count = subOrders || crewOrders ? { total: (subOrders?.total ?? 0) + (crewOrders?.total ?? 0), open: (subOrders?.open ?? 0) + (crewOrders?.open ?? 0) } : null;
  return { accountName: me[0].name, visits, updates, extraJobs, complaints, supplyOrders, photos, todos, sales };
}
