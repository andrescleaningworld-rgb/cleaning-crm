// "Delete account" (account page → More) and Settings → Deleted accounts.
//
// A soft delete (migration 044), like a deleted supply order: the account
// row is kept, marked deleted_at / deleted_by / deleted_reason, and nothing
// that points at it is erased. Every list leaves it out, together with its
// visits, complaints, to-dos, schedules and supply orders (the same way a
// test account is left out); its customer portal login and its Crew Link
// stop working. Restore clears the mark and everything comes back.
//
// The lists read the mark through to_jsonb(), so they work against a
// database where migration 044 has not run yet (nothing is deleted there).
// Postgres only.
import { getSql } from "@/lib/db";
import { accountLive } from "@/lib/pg/account-live";
import { getAccountSummary } from "@/lib/pg/account-summary";

let ready = false;

/** On once this database has migration 044. Delete and Restore need it; the lists do not. */
export async function accountDeleteReady(): Promise<boolean> {
  if (ready) return true;
  try {
    const rows = (await getSql()`
      SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'accounts' AND column_name = 'deleted_at') AS ok
    `) as { ok: boolean }[];
    ready = rows[0]?.ok === true;
  } catch {
    ready = false;
  }
  return ready;
}

export type DeleteImpact = {
  accountId: string;
  accountName: string;
  visits: number | null;
  complaints: number | null;
  supplyOrders: number | null;
  checklistItems: number | null;
};

/** What the confirm window shows: the name and how much this account has. Null: no such account (or already deleted). */
export async function deleteImpact(accountId: string): Promise<DeleteImpact | null> {
  const id = accountId.trim();
  if (!id) return null;
  const sql = getSql();
  const found = (await sql.query(`SELECT a.id, btrim(a.account_name) AS name FROM accounts a WHERE a.id = $1 AND ${accountLive("a")} LIMIT 1`, [id])) as {
    id: string;
    name: string;
  }[];
  if (!found[0]) return null;

  const [summary, checklistItems] = await Promise.all([
    getAccountSummary(id),
    // The porter checklist: every item in every tab still in use.
    (sql.query(
      `SELECT COALESCE(sum(jsonb_array_length(COALESCE(section->'items', '[]'::jsonb))), 0)::int AS n
       FROM checklist_tabs t CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(t.sections_json) = 'array' THEN t.sections_json ELSE '[]'::jsonb END) AS section
       WHERE t.account_id = $1 AND t.deleted_at IS NULL`,
      [id]
    ) as unknown as Promise<{ n: number }[]>)
      .then((rows) => rows[0]?.n ?? 0)
      .catch(() => null),
  ]);

  return {
    accountId: found[0].id,
    accountName: found[0].name,
    visits: summary?.visits?.total ?? null,
    complaints: summary?.complaints?.total ?? null,
    supplyOrders: summary?.supplyOrders?.total ?? null,
    checklistItems,
  };
}

/** Marks the account deleted. False when there is no such account, or it is already deleted. */
export async function deleteAccount(input: { accountId: string; by: string; reason: string }): Promise<{ accountName: string } | null> {
  const rows = (await getSql()`
    UPDATE accounts
    SET deleted_at = now(), deleted_by = ${input.by}, deleted_reason = ${input.reason}, updated_at = now()
    WHERE id = ${input.accountId.trim()} AND deleted_at IS NULL
    RETURNING btrim(account_name) AS account_name
  `) as { account_name: string }[];
  return rows[0] ? { accountName: rows[0].account_name } : null;
}

/** Takes the mark off. Who deleted it and why are cleared too (both stay in the account's History). */
export async function restoreAccount(accountId: string): Promise<{ accountName: string } | null> {
  const rows = (await getSql()`
    UPDATE accounts
    SET deleted_at = NULL, deleted_by = '', deleted_reason = '', updated_at = now()
    WHERE id = ${accountId.trim()} AND deleted_at IS NOT NULL
    RETURNING btrim(account_name) AS account_name
  `) as { account_name: string }[];
  return rows[0] ? { accountName: rows[0].account_name } : null;
}

export type DeletedAccount = { accountId: string; accountName: string; address: string; deletedBy: string; deletedAt: string; reason: string };

/** Settings → Deleted accounts, newest first. */
export async function listDeletedAccounts(): Promise<DeletedAccount[]> {
  const rows = (await getSql()`
    SELECT id, btrim(account_name) AS account_name, btrim(address) AS address, deleted_by, deleted_at, deleted_reason
    FROM accounts
    WHERE deleted_at IS NOT NULL AND id IS NOT NULL
    ORDER BY deleted_at DESC
  `) as { id: string; account_name: string; address: string; deleted_by: string; deleted_at: Date | string; deleted_reason: string }[];
  return rows.map((row) => ({
    accountId: row.id,
    accountName: row.account_name,
    address: row.address,
    deletedBy: row.deleted_by,
    deletedAt: row.deleted_at instanceof Date ? row.deleted_at.toISOString() : String(row.deleted_at),
    reason: row.deleted_reason,
  }));
}
