// Read-only check that migration 065 (Tax exempt per account) is on
// PRODUCTION: the schema_migrations row and the accounts.tax_exempt column,
// and that it starts OFF for every account. Changes nothing.
//
//   npx tsx scripts/migrate/check-065-production.mts
//
// The address comes from .env.production.local (lib/production.mjs); it is never printed.
import { neon } from "@neondatabase/serverless";
import { productionUrl } from "./lib/production.mjs";

const sql = neon(productionUrl());
console.log("PRODUCTION database. Read only.");

const applied = (await sql`SELECT applied_at FROM schema_migrations WHERE filename = '065_account_tax_exempt.sql'`) as { applied_at: string }[];
console.log(applied[0] ? `065 applied:   yes, ${new Date(applied[0].applied_at).toLocaleString("en-US", { timeZone: "America/New_York" })}` : "065 applied:   NO");

const columns = (await sql`
  SELECT data_type, is_nullable, column_default FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'accounts' AND column_name = 'tax_exempt'
`) as { data_type: string; is_nullable: string; column_default: string }[];
const column = columns[0];
console.log(column ? `accounts.tax_exempt: ${column.data_type}, ${column.is_nullable === "NO" ? "not null" : "nullable"}, default ${column.column_default}` : "accounts.tax_exempt: MISSING");

let on = -1;
if (column) {
  const counts = (await sql`SELECT count(*) FILTER (WHERE tax_exempt)::int AS on_count FROM accounts`) as { on_count: number }[];
  on = counts[0]?.on_count ?? -1;
  console.log(`accounts with Tax exempt ON: ${on}`);
}

const ok = applied.length === 1 && column?.data_type === "boolean" && on >= 0;
console.log(ok ? "\nAll of 065 is there ✓" : "\nSomething from 065 is missing (see above).");
