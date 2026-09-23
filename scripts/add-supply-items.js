#!/usr/bin/env node
/**
 * Adds standard janitorial items to the shared supply list (supply_items),
 * which Crew Link "Order supplies" shows for every account. New items get
 * unit "case", active = true, and sort after the existing items.
 *
 * Usage:
 *   node scripts/add-supply-items.js           # read-only dry run (default)
 *   node scripts/add-supply-items.js --apply   # insert the "add" rows
 *
 * Never changes or deactivates an existing item. An item is skipped when:
 * - it's listed in SIMILAR_EXISTING below (reviewed by hand: same or
 *   near-same item already on the list, matched by id AND name so a
 *   renamed/removed item makes the script stop instead of guessing), or
 * - an item with the same normalized name already exists (so re-running
 *   after --apply adds nothing).
 */

/* eslint-disable @typescript-eslint/no-require-imports -- standalone Node/CommonJS
   script run via `node scripts/x.js`, not bundled into the app; matches every
   other scripts/*.js file in this repo. */

const fs = require("fs");
const path = require("path");
const { neon } = require("@neondatabase/serverless");

const NEW_ITEMS = [
  "Toilet paper (jumbo rolls)",
  "Paper towel rolls",
  "Folded paper towels (multifold / C-fold)",
  "Toilet seat covers",
  "Facial tissue",
  "Hand soap refills",
  "Hand sanitizer refills",
  "Small trash liners",
  "Large trash liners",
  "Outside can liners (heavy duty)",
  "Sanitary napkin bags",
  "Disinfectant cleaner",
  "Glass cleaner",
  "Neutral floor cleaner",
  "Restroom / bowl cleaner",
  "Air freshener",
  "Disposable gloves",
  "Microfiber cloths",
  "Mop heads",
  "Vacuum bags",
];

// New item name → the existing supply_items row it duplicates.
const SIMILAR_EXISTING = {
  "Toilet paper (jumbo rolls)": { id: 1, name: "Toilet paper (jumbo roll)" },
  "Paper towel rolls": { id: 3, name: "Hand towels (roll)" },
  "Folded paper towels (multifold / C-fold)": { id: 4, name: "Hand towels (multifold)" },
  "Toilet seat covers": { id: 6, name: "Seat covers" },
  "Hand soap refills": { id: 5, name: "Hand soap refill" },
  "Small trash liners": { id: 7, name: "Trash liners small" },
  "Large trash liners": { id: 8, name: "Trash liners large" },
  "Sanitary napkin bags": { id: 9, name: "Feminine hygiene bags" },
  "Disinfectant cleaner": { id: 10, name: "Disinfectant" },
  "Glass cleaner": { id: 11, name: "Glass cleaner" },
  "Microfiber cloths": { id: 12, name: "Microfiber cloths" },
};

const UNIT = "case";

function loadEnvLocal() {
  const envPath = path.join(__dirname, "..", ".env.local");
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}

function normalize(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

async function main() {
  loadEnvLocal();

  if (!process.env.DATABASE_URL) {
    console.error("Missing DATABASE_URL. Set it in .env.local (or the environment) before running this script.");
    process.exit(1);
  }

  const sql = neon(process.env.DATABASE_URL);
  const shouldApply = process.argv.includes("--apply");
  console.log(shouldApply ? "== APPLY ==" : "== DRY RUN (read-only) — pass --apply to write ==");

  const existing = await sql`SELECT id, name, unit, sort_order, active FROM supply_items ORDER BY sort_order ASC, name ASC`;
  console.log("\nCurrent supply_items:");
  console.table(existing);

  const byId = new Map(existing.map((row) => [row.id, row]));
  const byNormalizedName = new Map(existing.map((row) => [normalize(row.name), row]));

  // The hand-reviewed matches must still point at the same rows.
  for (const [newName, match] of Object.entries(SIMILAR_EXISTING)) {
    const row = byId.get(match.id);
    if (!row || row.name !== match.name) {
      console.error(
        `Stopping: "${newName}" is mapped to #${match.id} "${match.name}", but that row is now ${
          row ? `"${row.name}"` : "missing"
        }. Re-check SIMILAR_EXISTING before running again.`
      );
      process.exit(1);
    }
  }

  let nextSort = existing.reduce((max, row) => Math.max(max, row.sort_order), -1) + 1;
  const plan = NEW_ITEMS.map((name) => {
    const similar = SIMILAR_EXISTING[name];
    if (similar) {
      return { item: name, action: "skip", reason: `similar to #${similar.id} "${similar.name}"`, sort_order: "" };
    }
    const sameName = byNormalizedName.get(normalize(name));
    if (sameName) {
      return { item: name, action: "skip", reason: `already exists as #${sameName.id} "${sameName.name}"`, sort_order: "" };
    }
    return { item: name, action: "add", reason: `new, unit "${UNIT}", active`, sort_order: nextSort++ };
  });

  console.log("\nPlan:");
  console.table(plan);
  const toAdd = plan.filter((p) => p.action === "add");
  console.log(`${toAdd.length} to add, ${plan.length - toAdd.length} to skip.`);

  if (!shouldApply || toAdd.length === 0) return;

  const inserted = await sql.transaction(
    toAdd.map(
      (p) => sql`
        INSERT INTO supply_items (name, unit, sort_order, active)
        VALUES (${p.item}, ${UNIT}, ${p.sort_order}, true)
        RETURNING id, name, unit, sort_order, active
      `
    )
  );
  console.log("\nInserted:");
  console.table(inserted.map((rows) => rows[0]));
  console.log("Done.");
}

main().catch((err) => {
  console.error("Script failed:", err);
  process.exit(1);
});
