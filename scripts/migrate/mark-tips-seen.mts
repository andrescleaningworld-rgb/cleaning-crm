// Marks every first-time tip as already seen for the owner's login, so none
// of them pop up again on any device. It adds rows to tips_seen only; a tip
// can still be shown on request with the "?" at the top of a screen.
//
//   npx tsx scripts/migrate/mark-tips-seen.mts                practice database
//   npx tsx scripts/migrate/mark-tips-seen.mts --production   production (.env.production.local)
//
// Prints how many logins and rows, never a name.
import { neon } from "@neondatabase/serverless";
import { loadEnv } from "./lib/env.mjs";
import { assertDevDatabase } from "./lib/guard.mjs";
import { productionUrl } from "./lib/production.mjs";

loadEnv();
const production = process.argv.includes("--production");
const sql = neon(production ? productionUrl() : assertDevDatabase(process.env.MIGRATION_DATABASE_URL));

// Every <Tips id="…"> in the app.
const TIPS = ["account", "accounts", "board-add", "complaints", "dashboard", "my-work", "new-accounts", "order-steps", "photos", "settings-team", "sub-portal", "subcontractors", "supplies", "to-do", "updates-to-process", "visits"];

const owners = (await sql`SELECT id::text AS id FROM manager_accounts WHERE role = 'owner'`) as { id: string }[];
if (owners.length === 0) throw new Error("No owner login was found. Nothing was done.");
let added = 0;
for (const owner of owners) {
  const rows = await sql`
    INSERT INTO tips_seen (person, tip_id) SELECT ${owner.id}, id FROM unnest(${TIPS}::text[]) AS id
    ON CONFLICT (person, tip_id) DO NOTHING RETURNING tip_id
  `;
  added += rows.length;
}
console.log(`${production ? "PRODUCTION" : "Practice"} database: ${owners.length} owner login(s), ${TIPS.length} tips each, ${added} rows added now.`);
