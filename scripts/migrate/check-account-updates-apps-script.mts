// Compares Account Updates in Postgres (practice database) with what the
// live Apps Script answers ("getAccountUpdates", read-only), row by row and
// field by field. Writes nothing anywhere. No names, notes or emails are
// printed: only how many rows differ, and in which field.
//
//   npx tsx scripts/migrate/check-account-updates-apps-script.mts
//
// To refresh the practice copy first: npx tsx scripts/migrate/import-accounts.mts
import { loadEnv } from "./lib/env.mjs";
import { assertDevDatabase } from "./lib/guard.mjs";

loadEnv();
process.env.DATABASE_URL = assertDevDatabase(process.env.MIGRATION_DATABASE_URL);
process.env.OUTBOUND_DRY_RUN = "1";

const base = process.env.GOOGLE_SCRIPT_URL;
if (!base) throw new Error("GOOGLE_SCRIPT_URL is not set here.");

const FIELDS = ["id", "date", "accountId", "accountName", "updateType", "title", "manager", "notes", "notifyEmail", "followUpNeeded", "followUpDate"] as const;
type Row = Record<(typeof FIELDS)[number], string>;

const response = await fetch(`${base}?action=getAccountUpdates`, { cache: "no-store" });
const json = (await response.json()) as { success?: boolean; accountUpdates?: Record<string, unknown>[] };
if (!response.ok || json.success === false || !Array.isArray(json.accountUpdates)) throw new Error("Apps Script did not answer with the list.");
const live: Row[] = json.accountUpdates.map((raw) => Object.fromEntries(FIELDS.map((field) => [field, String(raw[field] ?? "")])) as Row);

const { listAccountUpdates } = await import("../../lib/pg/account-updates");
const ours = (await listAccountUpdates()) as Row[];

// Rows saved by the app after the copy are extra on our side, at the end.
const compared = Math.min(live.length, ours.length);
let different = 0;
const perField = new Map<string, number>();
for (let i = 0; i < compared; i++) {
  let rowDiffers = false;
  for (const field of FIELDS) {
    if (live[i][field].trim() !== ours[i][field].trim()) {
      rowDiffers = true;
      perField.set(field, (perField.get(field) ?? 0) + 1);
    }
  }
  if (rowDiffers) different++;
}
console.log(`Apps Script: ${live.length} account updates. Postgres: ${ours.length}.`);
console.log(`Compared ${compared} rows in order, field by field: ${different} different.`);
for (const [field, count] of perField) console.log(`  ${field}: ${count} rows differ`);
if (ours.length < live.length) console.log(`  ${live.length - ours.length} are in Apps Script and not yet in Postgres (refresh the copy).`);
if (different > 0 || ours.length < live.length) process.exitCode = 1;
