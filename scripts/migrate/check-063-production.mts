// Read-only check that migration 063 (the setup wizard) is on PRODUCTION:
// the schema_migrations row, the third supplies choice, the "Site survey"
// photo kind and the two new photo columns. Changes nothing.
//
//   npx tsx scripts/migrate/check-063-production.mts
//
// The address comes from .env.production.local (lib/production.mjs); it is never printed.
import { neon } from "@neondatabase/serverless";
import { productionUrl } from "./lib/production.mjs";

const sql = neon(productionUrl());
console.log("PRODUCTION database. Read only.");

const applied = (await sql`SELECT filename, applied_at FROM schema_migrations WHERE filename = '063_setup_wizard.sql'`) as { filename: string; applied_at: string }[];
console.log(applied[0] ? `063 applied:   yes, ${new Date(applied[0].applied_at).toLocaleString("en-US", { timeZone: "America/New_York" })}` : "063 applied:   NO");

const checks = (await sql`
  SELECT conname, pg_get_constraintdef(oid) AS def FROM pg_constraint
  WHERE conname IN ('supply_account_modes_mode_check', 'photo_index_kind_check') ORDER BY conname
`) as { conname: string; def: string }[];
for (const check of checks) console.log(`${check.conname}:\n  ${check.def}`);

const columns = (await sql`
  SELECT column_name, data_type, column_default FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'photo_index' AND column_name IN ('caption', 'thumb_url') ORDER BY column_name
`) as { column_name: string; data_type: string; column_default: string }[];
console.log(`photo_index new columns: ${columns.length ? columns.map((c) => `${c.column_name} (${c.data_type}, default ${c.column_default})`).join("; ") : "NONE"}`);

const index = (await sql`SELECT indexname FROM pg_indexes WHERE indexname = 'photo_index_survey_idx'`) as { indexname: string }[];
console.log(`photo_index_survey_idx: ${index.length ? "yes" : "NO"}`);

const ok = applied.length === 1 && checks.some((c) => c.def.includes("'customer'")) && checks.some((c) => c.def.includes("'Site survey'")) && columns.length === 2 && index.length === 1;
console.log(ok ? "\nAll of 063 is there ✓" : "\nSomething from 063 is missing (see above).");
