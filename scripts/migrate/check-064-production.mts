// Read-only check that migration 064 (crew photos and "couldn't do") is on
// PRODUCTION: the schema_migrations row, the "Crew" photo kind, the two new
// photo columns, the index and the per-account setting. Changes nothing.
//
//   npx tsx scripts/migrate/check-064-production.mts
//
// The address comes from .env.production.local (lib/production.mjs); it is never printed.
import { neon } from "@neondatabase/serverless";
import { productionUrl } from "./lib/production.mjs";

const sql = neon(productionUrl());
console.log("PRODUCTION database. Read only.");

const applied = (await sql`SELECT applied_at FROM schema_migrations WHERE filename = '064_crew_photos_and_skips.sql'`) as { applied_at: string }[];
console.log(applied[0] ? `064 applied:   yes, ${new Date(applied[0].applied_at).toLocaleString("en-US", { timeZone: "America/New_York" })}` : "064 applied:   NO");

const kind = (await sql`SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint WHERE conname = 'photo_index_kind_check'`) as { def: string }[];
console.log(`photo_index_kind_check:\n  ${kind[0]?.def ?? "MISSING"}`);

const columns = (await sql`
  SELECT table_name, column_name, data_type, column_default FROM information_schema.columns
  WHERE table_schema = 'public' AND ((table_name = 'photo_index' AND column_name IN ('tag', 'hidden_from_customer'))
     OR (table_name = 'checklist_templates' AND column_name = 'show_photos_to_customer'))
  ORDER BY table_name, column_name
`) as { table_name: string; column_name: string; data_type: string; column_default: string }[];
for (const c of columns) console.log(`${c.table_name}.${c.column_name}: ${c.data_type}, default ${c.column_default}`);

const index = (await sql`SELECT indexname FROM pg_indexes WHERE indexname = 'photo_index_crew_idx'`) as unknown[];
console.log(`photo_index_crew_idx: ${index.length ? "yes" : "NO"}`);

const ok = applied.length === 1 && (kind[0]?.def ?? "").includes("'Crew'") && columns.length === 3 && index.length === 1;
console.log(ok ? "\nAll of 064 is there ✓" : "\nSomething from 064 is missing (see above).");
