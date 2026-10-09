// Records one of Andres's answers in migration_overrides (dev branch). The
// next import run applies it. Nothing in Sheets is touched.
//
//   node scripts/migrate/set-override.mjs <area> <kind> <legacy_key> <resolved_id> [note]
//   node scripts/migrate/set-override.mjs --list
//
// Kinds in use:
//   people    manager_staff     <Manager ID>                  → <Staff ID>
//   subs      sub_alias         <name, lowercase>             → <sub id, e.g. SUB-004>
//   accounts  account_sub       <Subcontractor text, lowercase> → <sub id>
//   accounts  account_manager   <Manager text, lowercase>     → <Manager ID>
import { getSql } from "./lib/pg.mjs";

const sql = getSql();
const [area, kind, legacyKey, resolvedId, note = ""] = process.argv.slice(2);

if (area === "--list") {
  for (const row of await sql`SELECT area, kind, legacy_key, resolved_id, note, created_at FROM migration_overrides ORDER BY area, kind, legacy_key`) {
    console.log(`${row.area} | ${row.kind} | ${row.legacy_key} → ${row.resolved_id}${row.note ? ` | ${row.note}` : ""}`);
  }
} else if (!area || !kind || !legacyKey || !resolvedId) {
  console.error("Usage: node scripts/migrate/set-override.mjs <area> <kind> <legacy_key> <resolved_id> [note]");
  process.exitCode = 1;
} else {
  await sql`
    INSERT INTO migration_overrides (area, kind, legacy_key, resolved_id, note)
    VALUES (${area}, ${kind}, ${legacyKey}, ${resolvedId}, ${note})
    ON CONFLICT (area, kind, legacy_key) DO UPDATE SET resolved_id = EXCLUDED.resolved_id, note = EXCLUDED.note
  `;
  console.log(`saved: ${area} | ${kind} | ${legacyKey} → ${resolvedId}`);
}
