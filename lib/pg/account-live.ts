// Deleted accounts (migration 044, lib/pg/account-delete.ts): the SQL every
// list uses to leave them out. Its own file with no imports, so any module
// can use it without importing the others (like lib/pg/supply-deleted.ts).
//
// deleted_at is read through to_jsonb(), so these work against a database
// where migration 044 has not run yet: nothing is deleted there.

/** SQL: the account row `alias` is not deleted. True for a LEFT JOIN that found no account. */
export function accountLive(alias: string): string {
  return `(to_jsonb(${alias})->>'deleted_at') IS NULL`;
}

/** SQL: ids of accounts whose records every list leaves out (test accounts and deleted accounts). */
export const HIDDEN_ACCOUNT_IDS = `(SELECT hidden.id FROM accounts hidden WHERE hidden.id IS NOT NULL AND (hidden.is_test OR (to_jsonb(hidden)->>'deleted_at') IS NOT NULL))`;

/** SQL: a handoff / Pin Board row `alias` is not about a deleted account. */
export function handoffLive(alias: string): string {
  return `NOT EXISTS (SELECT 1 FROM accounts gone WHERE gone.id IS NOT NULL AND (to_jsonb(gone)->>'deleted_at') IS NOT NULL
    AND (gone.id = NULLIF(btrim(${alias}.account_id), '') OR (${alias}.kind = 'account' AND gone.id = ${alias}.item_id)))`;
}
