// Practice database only: made-up rows for trying Supply Check, and their removal.
//
//   npx tsx scripts/migrate/supply-test-setup.mts            add "ZZ Test Soap", "ZZ Test Bags" and the tablet person "ZZ Test Staff" (PIN 4821)
//   npx tsx scripts/migrate/supply-test-setup.mts --remove   take all of it out again, with everything the test made
//
// It prints the tablet's address path (the secret link of the PRACTICE
// database only). Nothing real is changed: every row it touches is named ZZ.
import { loadEnv } from "./lib/env.mjs";
import { assertDevDatabase } from "./lib/guard.mjs";

loadEnv();
process.env.DATABASE_URL = assertDevDatabase(process.env.MIGRATION_DATABASE_URL);
const { getSql } = await import("../../lib/db");
const { hashPin } = await import("../../lib/pinAuth");
const { getOrCreateEquipmentCheckLink } = await import("../../lib/equipmentCheckDb");
const sql = getSql();

const STAFF_ID = "ZZ-TEST-STAFF";

if (process.argv.includes("--remove")) {
  const ids = ((await sql`SELECT id FROM sub_supplies WHERE legacy_key LIKE 'zz-test-%'`) as { id: number }[]).map((row) => Number(row.id));
  const moves = await sql`DELETE FROM supply_moves WHERE supply_id = ANY(${ids}::bigint[]) OR staff_id = ${STAFF_ID} OR staff_name = 'ZZ Test Staff' RETURNING 1`;
  const asks = await sql`DELETE FROM supply_count_asks WHERE week_start >= current_date - 7 RETURNING 1`;
  const orders = await sql`DELETE FROM sub_supply_orders WHERE supply_item LIKE 'ZZ Test %' RETURNING order_group_id`;
  const papers = await sql`DELETE FROM handoff_items WHERE kind = 'supply' AND (data->>'items' LIKE '%ZZ Test %') RETURNING 1`;
  const modes = await sql`DELETE FROM supply_account_modes WHERE updated_by = 'Local Dev' RETURNING 1`;
  const invoiced = await sql`DELETE FROM supply_invoiced WHERE invoiced_by = 'Local Dev' RETURNING 1`;
  await sql`UPDATE supply_control_settings SET auto_approve_amount = 50 WHERE id`;
  const items = await sql`DELETE FROM sub_supplies WHERE legacy_key LIKE 'zz-test-%' RETURNING 1`;
  await sql`DELETE FROM equipment_staff_pins WHERE staff_id = ${STAFF_ID}`;
  const staff = await sql`DELETE FROM staff WHERE id = ${STAFF_ID} RETURNING 1`;
  console.log(`removed: ${items.length} items, ${moves.length} moves, ${orders.length} order lines, ${papers.length} board papers, ${asks.length} count asks, ${modes.length} account modes, ${invoiced.length} invoiced marks, ${staff.length} test staff`);
} else {
  const next = ((await sql`SELECT COALESCE(max(sheet_row), 1) AS n FROM sub_supplies`) as { n: number }[])[0].n;
  await sql`
    INSERT INTO sub_supplies (legacy_key, supply_item, category, unit, status, active_raw, sheet_row)
    VALUES ('zz-test-1', 'ZZ Test Soap', 'Test', 'bottle', 'Active', 'yes', ${next + 1}), ('zz-test-2', 'ZZ Test Bags', 'Test', 'box', 'Active', 'yes', ${next + 2})
    ON CONFLICT (legacy_key) DO NOTHING
  `;
  await sql`
    INSERT INTO staff (id, legacy_key, name, role, active) VALUES (${STAFF_ID}, 'zz-test-staff', 'ZZ Test Staff', 'InsideStaff', true)
    ON CONFLICT (id) DO NOTHING
  `;
  await sql`
    INSERT INTO equipment_staff_pins (staff_id, pin_hash) VALUES (${STAFF_ID}, ${await hashPin("4821")})
    ON CONFLICT (staff_id) DO UPDATE SET pin_hash = EXCLUDED.pin_hash, failed_attempts = 0, locked_until = NULL
  `;
  const link = await getOrCreateEquipmentCheckLink();
  console.log(`TABLET_PATH=/equipment-check/${link.key}/supplies`);
  console.log("Test person: ZZ Test Staff, PIN 4821. Items: ZZ Test Soap, ZZ Test Bags.");
}
