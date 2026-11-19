// Read-only check that migration 085 (CW Now Photo Checklist) is on
// PRODUCTION: the schema_migrations row, checklist_templates.crew_screen (and
// that every account is still 'classic'), the four new photo_index columns
// and their index. Changes nothing.
//
//   npx tsx scripts/migrate/check-085-production.mts
//
// Before applying 085 (scripts/migrate/apply-production.mts --apply):
//   1. Make a Neon backup branch (backup-before-085).
//   2. Run this check: it should say "085 applied: NO".
//   3. Apply, then run this check again.
//
// The address comes from .env.production.local (lib/production.mjs); it is never printed.
import { neon } from "@neondatabase/serverless";
import { productionUrl } from "./lib/production.mjs";

const sql = neon(productionUrl());
console.log("PRODUCTION database. Read only.");

const applied = (await sql`SELECT applied_at FROM schema_migrations WHERE filename = '085_photo_checklist.sql'`) as { applied_at: string }[];
console.log(applied[0] ? `085 applied:   yes, ${new Date(applied[0].applied_at).toLocaleString("en-US", { timeZone: "America/New_York" })}` : "085 applied:   NO (make a Neon backup branch before applying)");

const columns = (await sql`
  SELECT table_name, column_name, data_type, column_default FROM information_schema.columns
  WHERE table_schema = 'public'
    AND ((table_name = 'checklist_templates' AND column_name = 'crew_screen')
      OR (table_name = 'photo_index' AND column_name IN ('visit_id', 'item_key', 'time_source', 'added_at')))
  ORDER BY table_name, column_name
`) as { table_name: string; column_name: string; data_type: string; column_default: string | null }[];
for (const c of columns) console.log(`${c.table_name}.${c.column_name}: ${c.data_type}, default ${c.column_default ?? "none"}`);

const index = (await sql`SELECT 1 FROM pg_indexes WHERE indexname = 'photo_index_visit_idx'`) as unknown[];
console.log(`index on photo_index.visit_id: ${index.length ? "yes" : "NO"}`);
const check = (await sql`SELECT 1 FROM pg_constraint WHERE conname = 'checklist_templates_crew_screen_check'`) as unknown[];
console.log(`crew_screen only classic / photo: ${check.length ? "yes" : "NO"}`);

let allClassic = false;
if (columns.some((c) => c.column_name === "crew_screen")) {
  const screens = (await sql`SELECT crew_screen, count(*)::int AS n FROM checklist_templates GROUP BY crew_screen ORDER BY crew_screen`) as { crew_screen: string; n: number }[];
  for (const row of screens) console.log(`accounts on ${row.crew_screen}: ${row.n}`);
  allClassic = screens.every((row) => row.crew_screen === "classic");
  console.log(allClassic ? "Every account's crew screen is Classic ✓" : "Some accounts are NOT Classic (see above).");
}

const ok = applied.length === 1 && columns.length === 5 && index.length === 1 && check.length === 1 && allClassic;
console.log(ok ? "\nAll of 085 is there ✓" : "\nSomething from 085 is missing (see above).");
