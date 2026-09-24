/**
 * Vehicles (Equipment → "Vehicles" section). Postgres only — no Sheets tabs
 * or columns. Idempotent: CREATE TABLE / INDEX IF NOT EXISTS, safe to re-run.
 *
 * - vehicles: one row per company vehicle. driver_staff_id is the Sheets
 *   Staff id (plain TEXT, never a foreign key — same rule as
 *   equipment_reports). active=false = retired (no hard delete).
 * - vehicle_service_items: each vehicle's maintenance items. Interval items
 *   use interval_miles and/or interval_months from the last time it was done
 *   (last_done_date / last_done_mileage). Date-only items (inspection,
 *   registration, insurance) use due_date.
 * - vehicle_service_logs: "Log service" entries.
 * - vehicle_mileage_readings: every mileage entry (tablet, office, service).
 *   flagged_lower = a tablet/service reading lower than the vehicle's
 *   mileage at the time; saved, but it never lowers current_mileage.
 * - vehicle_digest_sent: one row per Monday so the weekly email can't send
 *   twice for the same week.
 *
 * Run: node scripts/setup-vehicles-db.js
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

async function main() {
  loadEnvLocal();

  if (!process.env.DATABASE_URL) {
    console.error("Missing DATABASE_URL. Set it in .env.local (or the environment) before running this script.");
    process.exit(1);
  }

  const sql = neon(process.env.DATABASE_URL);

  await sql`
    CREATE TABLE IF NOT EXISTS vehicles (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      plate TEXT NOT NULL DEFAULT '',
      vin TEXT NOT NULL DEFAULT '',
      year INT,
      make TEXT NOT NULL DEFAULT '',
      model TEXT NOT NULL DEFAULT '',
      photo_url TEXT NOT NULL DEFAULT '',
      driver_staff_id TEXT,
      current_mileage INT CHECK (current_mileage >= 0),
      mileage_updated_at TIMESTAMPTZ,
      active BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;
  console.log("vehicles ready.");

  await sql`
    CREATE TABLE IF NOT EXISTS vehicle_service_items (
      id SERIAL PRIMARY KEY,
      vehicle_id INT NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      interval_miles INT CHECK (interval_miles > 0),
      interval_months INT CHECK (interval_months > 0),
      due_date DATE,
      last_done_date DATE,
      last_done_mileage INT CHECK (last_done_mileage >= 0),
      sort_order INT NOT NULL DEFAULT 0,
      active BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS idx_vehicle_service_items_vehicle ON vehicle_service_items(vehicle_id)`;
  console.log("vehicle_service_items ready.");

  await sql`
    CREATE TABLE IF NOT EXISTS vehicle_service_logs (
      id SERIAL PRIMARY KEY,
      vehicle_id INT NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
      service_item_id INT REFERENCES vehicle_service_items(id) ON DELETE SET NULL,
      done_on DATE NOT NULL,
      mileage INT CHECK (mileage >= 0),
      what TEXT NOT NULL,
      shop TEXT NOT NULL DEFAULT '',
      cost NUMERIC(10,2),
      receipt_url TEXT NOT NULL DEFAULT '',
      created_by TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS idx_vehicle_service_logs_vehicle ON vehicle_service_logs(vehicle_id, done_on DESC)`;
  console.log("vehicle_service_logs ready.");

  await sql`
    CREATE TABLE IF NOT EXISTS vehicle_mileage_readings (
      id SERIAL PRIMARY KEY,
      vehicle_id INT NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
      mileage INT NOT NULL CHECK (mileage >= 0),
      staff_id TEXT,
      source TEXT NOT NULL CHECK (source IN ('tablet','office','service')),
      flagged_lower BOOLEAN NOT NULL DEFAULT false,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS idx_vehicle_mileage_readings_vehicle ON vehicle_mileage_readings(vehicle_id, created_at DESC)`;
  console.log("vehicle_mileage_readings ready.");

  await sql`
    CREATE TABLE IF NOT EXISTS vehicle_digest_sent (
      week_start DATE PRIMARY KEY,
      item_count INT NOT NULL DEFAULT 0,
      sent_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;
  console.log("vehicle_digest_sent ready.");

  console.log("Done.");
}

main().catch((err) => {
  console.error("Setup script failed:", err);
  process.exit(1);
});
