// "Tax exempt" per account (migration 065). Server only. Every account price
// is before sales tax: where the customer sees it, it reads
// "$X / month + sales tax" unless the account is tax exempt (the customer
// portal's My bill, app/(customer)/portal/billing; its words are in words.ts).
// Display only: nothing else reads it.

import { getSql } from "@/lib/db";

/** Tax exempt (false before migration 065, and for every account until it is turned on). */
export async function isTaxExempt(accountId: string): Promise<boolean> {
  try {
    const rows = (await getSql()`SELECT to_jsonb(a) ->> 'tax_exempt' AS exempt FROM accounts a WHERE a.id = ${accountId} LIMIT 1`) as { exempt: string | null }[];
    return rows[0]?.exempt === "true";
  } catch {
    return false;
  }
}

/** Saves it. Throws a plain-words error before migration 065, or for an unknown account. */
export async function setTaxExempt(accountId: string, on: boolean): Promise<void> {
  try {
    const rows = (await getSql()`UPDATE accounts SET tax_exempt = ${on} WHERE id = ${accountId} RETURNING id`) as unknown[];
    if (rows.length === 0) throw new Error("That account was not found.");
  } catch (error) {
    // 42703: the column is not there (migration 065 not run on this database).
    if ((error as { code?: string })?.code === "42703") throw new Error("Tax exempt can be saved once the database update for it (migration 065) is in.");
    throw error;
  }
}
