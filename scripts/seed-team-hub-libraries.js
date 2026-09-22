#!/usr/bin/env node
/**
 * One-time seed: populates hub_checklist_library, hub_round_library,
 * and supply_items with the generic starter libraries from the approved
 * Team Hub spec (no client/building names). Idempotent via a
 * SELECT-before-INSERT check on each table's natural key (area+text /
 * name / name) rather than a database UNIQUE constraint — those tables'
 * schema in scripts/setup-team-hub-db.js matches the spec's column list
 * exactly, so idempotency is handled here instead of by adding
 * constraints beyond what's listed there.
 *
 * Requires scripts/setup-team-hub-db.js to have been run first (tables
 * must exist).
 *
 * Usage:
 *   node scripts/seed-team-hub-libraries.js
 */

/* eslint-disable @typescript-eslint/no-require-imports -- standalone Node/CommonJS
   script run via `node scripts/x.js`, not bundled into the app; matches every
   other scripts/*.js file in this repo. */

const fs = require("fs");
const path = require("path");
const { neon } = require("@neondatabase/serverless");

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

// area: "" for the two pinned notes, which the spec lists under their own
// unlabeled bullet rather than under a specific area header — given
// "General" here as a reasonable home for them; flagging since the spec
// didn't actually name an area for these two.
const CHECKLIST_ITEMS = [
  // Lobby & Entrances
  { area: "Lobby & Entrances", text: "Entrance/vestibule glass both sides incl. push bars", freq: "visit" },
  { area: "Lobby & Entrances", text: "Vacuum entrance mats", freq: "visit" },
  { area: "Lobby & Entrances", text: "Dust mop + damp mop lobby floor", freq: "visit" },
  { area: "Lobby & Entrances", text: "Dust furniture, directory, ledges to reach height", freq: "visit" },
  { area: "Lobby & Entrances", text: "Spot clean walls", freq: "visit" },
  { area: "Lobby & Entrances", text: "Empty trash and recycling, replace liners, wipe can exteriors", freq: "visit" },
  // Elevators
  { area: "Elevators", text: "Stainless cab walls and doors inside/out every floor", freq: "visit" },
  { area: "Elevators", text: "Disinfect button panels and handrails", freq: "visit" },
  { area: "Elevators", text: "Vacuum/mop cab floor", freq: "visit" },
  { area: "Elevators", text: "Door tracks", freq: "weekly" },
  // Restrooms
  { area: "Restrooms", text: "Toilets/urinals inside-out incl. seats, handles, bases", freq: "visit" },
  { area: "Restrooms", text: "Sinks, counters, faucets, mirrors", freq: "visit" },
  { area: "Restrooms", text: "Refill paper, towels, soap, seat covers, service sanitary bins (report low supplies via Order)", freq: "visit" },
  { area: "Restrooms", text: "Spot clean partitions and doors", freq: "visit" },
  { area: "Restrooms", text: "Disinfect touchpoints", freq: "visit" },
  { area: "Restrooms", text: "Mop with disinfectant incl. behind toilets, check floor drains", freq: "visit" },
  { area: "Restrooms", text: "Deep scrub floors/grout", freq: "monthly" },
  // Corridors
  { area: "Corridors", text: "Vacuum/mop traffic lanes", freq: "visit" },
  { area: "Corridors", text: "Empty common trash", freq: "visit" },
  { area: "Corridors", text: "Clean/disinfect fountains or bottle fillers", freq: "visit" },
  { area: "Corridors", text: "Spot clean doors, frames, walls, push plates", freq: "visit" },
  { area: "Corridors", text: "Vacuum edges and corners", freq: "weekly" },
  { area: "Corridors", text: "Dust baseboards", freq: "weekly" },
  // Conference Room
  { area: "Conference Room", text: "Wipe tables and chairs", freq: "visit" },
  { area: "Conference Room", text: "Clean whiteboards", freq: "visit" },
  { area: "Conference Room", text: "Dust TV screen with DRY microfiber only", freq: "visit" },
  { area: "Conference Room", text: "Empty trash", freq: "visit" },
  { area: "Conference Room", text: "Vacuum", freq: "visit" },
  // Cafeteria/Break Area
  { area: "Cafeteria/Break Area", text: "Wipe tables, chairs, counters, appliance exteriors", freq: "visit" },
  { area: "Cafeteria/Break Area", text: "Trash and recycling", freq: "visit" },
  { area: "Cafeteria/Break Area", text: "Sweep and mop", freq: "visit" },
  // Suite (repeatable via hub_crew_items.instance_label, e.g. "Suite A")
  { area: "Suite", text: "Empty trash and recycling", freq: "visit" },
  { area: "Suite", text: "Dust clear desk surfaces only (don't move papers or touch computers)", freq: "visit" },
  { area: "Suite", text: "Kitchenette sink, counters, microwave exterior", freq: "visit" },
  { area: "Suite", text: "Suite restroom to common standard if present", freq: "visit" },
  { area: "Suite", text: "Vacuum traffic lanes", freq: "visit" },
  { area: "Suite", text: "Disinfect touchpoints", freq: "visit" },
  { area: "Suite", text: "Lights off + door locked on exit", freq: "visit" },
  // Stairwells & Garage Lobby
  { area: "Stairwells & Garage Lobby", text: "Check stairwells and remove debris", freq: "visit" },
  { area: "Stairwells & Garage Lobby", text: "Wipe handrails", freq: "visit" },
  { area: "Stairwells & Garage Lobby", text: "Full wet mop stairwells and rails top to bottom", freq: "weekly" },
  { area: "Stairwells & Garage Lobby", text: "Empty trash and sweep garage elevator lobby", freq: "visit" },
  // End of Shift
  { area: "End of Shift", text: "Clean janitor closet, store equipment, empty/rinse mop buckets", freq: "visit" },
  { area: "End of Shift", text: "Report problems with photos", freq: "visit" },
  // Periodic
  { area: "Periodic", text: "Interior glass partitions and suite door glass", freq: "weekly" },
  { area: "Periodic", text: "Wash trash cans", freq: "weekly" },
  { area: "Periodic", text: "Dust reachable vents", freq: "weekly" },
  { area: "Periodic", text: "High dusting within safe reach per ladder policy", freq: "monthly" },
  { area: "Periodic", text: "Vacuum upholstered furniture", freq: "monthly" },
  { area: "Periodic", text: "Dust reachable light fixtures", freq: "monthly" },
];

const PINNED_NOTES = [
  { area: "General", text: "Medical suites are out of scope — do not enter, even if a door is open." },
  { area: "General", text: "Never handle needles, sharps, blood, or anything that looks biohazardous. Leave it, take a photo, report it immediately." },
];

const ROUNDS = [
  { name: "Restrooms 1F", minutes: 120 },
  { name: "Restrooms 2F", minutes: 120 },
  { name: "Restrooms 3F", minutes: 120 },
  { name: "Lobby & entrance glass", minutes: 90 },
  { name: "Elevators", minutes: 120 },
  { name: "Lobby and corridor trash", minutes: 120 },
  { name: "Entrance mats", minutes: 120 },
  { name: "Exterior entrance & smoking area", minutes: 120 },
  { name: "Garage elevator lobby", minutes: 120 },
  // "before/after meetings" isn't a fixed interval — 240 min used per the
  // spec's explicit number; the before/after-meetings trigger itself is a
  // UI/workflow detail for whichever phase builds Rounds (Phase 2), not
  // representable as a single default_interval_minutes value.
  { name: "Conference room (before/after meetings)", minutes: 240 },
];

// unit values for items the spec marked "(case)" are taken directly from
// that; the rest (hand soap refill, disinfectant, glass cleaner —
// bottle-like; feminine hygiene bags; microfiber cloths) don't have an
// explicit unit in the spec — reasonable defaults chosen here, flagged
// since they're inferred, not specified.
const SUPPLY_ITEMS = [
  { name: "Toilet paper (jumbo roll)", unit: "case" },
  { name: "Toilet paper (standard roll)", unit: "case" },
  { name: "Hand towels (roll)", unit: "case" },
  { name: "Hand towels (multifold)", unit: "case" },
  { name: "Hand soap refill", unit: "unit" },
  { name: "Seat covers", unit: "case" },
  { name: "Trash liners small", unit: "case" },
  { name: "Trash liners large", unit: "case" },
  { name: "Feminine hygiene bags", unit: "bag" },
  { name: "Disinfectant", unit: "unit" },
  { name: "Glass cleaner", unit: "unit" },
  { name: "Microfiber cloths", unit: "pack" },
];

async function main() {
  loadEnvLocal();

  if (!process.env.DATABASE_URL) {
    console.error("Missing DATABASE_URL. Set it in .env.local (or the environment) before running this script.");
    process.exit(1);
  }

  const sql = neon(process.env.DATABASE_URL);

  let checklistAdded = 0;
  for (const item of [...CHECKLIST_ITEMS, ...PINNED_NOTES.map((n) => ({ ...n, freq: "visit" }))]) {
    const isNote = PINNED_NOTES.includes(item);
    const existing = await sql`
      SELECT id FROM hub_checklist_library WHERE area = ${item.area} AND text = ${item.text} LIMIT 1
    `;
    if (existing.length > 0) continue;
    await sql`
      INSERT INTO hub_checklist_library (area, text, default_frequency, is_note)
      VALUES (${item.area}, ${item.text}, ${item.freq}, ${isNote})
    `;
    checklistAdded++;
  }
  console.log(`hub_checklist_library: ${checklistAdded} item(s) added.`);

  let roundsAdded = 0;
  for (const round of ROUNDS) {
    const existing = await sql`SELECT id FROM hub_round_library WHERE name = ${round.name} LIMIT 1`;
    if (existing.length > 0) continue;
    await sql`
      INSERT INTO hub_round_library (name, default_interval_minutes) VALUES (${round.name}, ${round.minutes})
    `;
    roundsAdded++;
  }
  console.log(`hub_round_library: ${roundsAdded} round(s) added.`);

  let suppliesAdded = 0;
  for (let i = 0; i < SUPPLY_ITEMS.length; i++) {
    const item = SUPPLY_ITEMS[i];
    const existing = await sql`SELECT id FROM supply_items WHERE name = ${item.name} LIMIT 1`;
    if (existing.length > 0) continue;
    await sql`
      INSERT INTO supply_items (name, unit, sort_order) VALUES (${item.name}, ${item.unit}, ${i})
    `;
    suppliesAdded++;
  }
  console.log(`supply_items: ${suppliesAdded} item(s) added.`);

  console.log("Done.");
}

main().catch((err) => {
  console.error("Seed script failed:", err);
  process.exit(1);
});
