// Read-only check that migration 066 (Crew Link checklists sent later) is on
// PRODUCTION: the schema_migrations row, checklist_submissions.client_id and
// received_at, and the unique index on client_id. Changes nothing.
//
//   npx tsx scripts/migrate/check-066-production.mts
//
// Before applying 066 (scripts/migrate/apply-production.mts --apply):
//   1. Make a Neon backup branch, e.g. backup-before-066-<date>.
//   2. Run this check: it should say "066 applied: NO".
//   3. Apply, then run this check again.
//
// The address comes from .env.production.local (lib/production.mjs); it is never printed.
import { neon } from "@neondatabase/serverless";
import { productionUrl } from "./lib/production.mjs";

const sql = neon(productionUrl());
console.log("PRODUCTION database. Read only.");

const applied = (await sql`SELECT applied_at FROM schema_migrations WHERE filename = '066_crew_offline_submissions.sql'`) as { applied_at: string }[];
console.log(applied[0] ? `066 applied:   yes, ${new Date(applied[0].applied_at).toLocaleString("en-US", { timeZone: "America/New_York" })}` : "066 applied:   NO (make a Neon backup branch before applying)");

const columns = (await sql`
  SELECT column_name, data_type, column_default FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'checklist_submissions' AND column_name IN ('client_id', 'received_at')
  ORDER BY column_name
`) as { column_name: string; data_type: string; column_default: string | null }[];
for (const c of columns) console.log(`checklist_submissions.${c.column_name}: ${c.data_type}, default ${c.column_default ?? "none"}`);

const index = (await sql`SELECT indexdef FROM pg_indexes WHERE indexname = 'checklist_submissions_client_id_key'`) as { indexdef: string }[];
console.log(`unique index on client_id: ${index[0] ? "yes" : "NO"}`);

const ok = applied.length === 1 && columns.length === 2 && index.length === 1 && /UNIQUE/i.test(index[0].indexdef);
console.log(ok ? "\nAll of 066 is there ✓" : "\nSomething from 066 is missing (see above).");
