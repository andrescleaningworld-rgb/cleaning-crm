// Writes docs/DATA_MODEL.md from the dev branch: every table the migration
// made, where its rows came from, its columns, its links and its row count.
// Read-only. Structure and counts only, no cell values.
//   node scripts/migrate/data-model.mjs
import fs from "node:fs";
import path from "node:path";
import { loadEnv, REPO_ROOT } from "./lib/env.mjs";
import { getSql } from "./lib/pg.mjs";
import { today } from "./lib/report.mjs";

loadEnv();
const sql = getSql();

// table → [area switch, sheet / tab it came from, what it holds]
const TABLES = {
  changelog_entries: ["CATALOGS", "PORTAL / ChangeLog", "The \"What's new\" entries shown in the app."],
  geocode_cache: ["CATALOGS", "MAIN / GeocodeCache", "Addresses already turned into map coordinates."],
  extra_services: ["CATALOGS", "PORTAL / ExtraServices", "Specialty services customers can ask for."],
  documents: ["CATALOGS", "MAIN / Documents", "Documents staff can send to subcontractors."],
  document_sends: ["CATALOGS", "MAIN / DocumentSends", "Which document was sent to which subcontractor, and when."],
  staff: ["PEOPLE", "MAIN / Staff", "People who sign equipment in and out and log in."],
  managers: ["PEOPLE", "MAIN / Managers", "Account managers (name, phone, calendar color)."],
  subcontractors: ["SUBS", "MAIN / Subcontractors", "Subcontractors. `id` is permanent (SUB-001 …); `legacy_row_id` is what the app still uses."],
  sub_name_aliases: ["SUBS", "(worked out at import)", "Names that mean one subcontractor without doubt."],
  sub_activity_log: ["SUBS / SUB_PORTAL", "MAIN / Subcontractor Activity Log", "What subs did in their portal (Login, Viewed Schedule …). Never mixed with the staff activity log."],
  accounts: ["ACCOUNTS", "MAIN / Accounts", "Customer accounts. `id` is the app's account id; `pk` is the row's own key."],
  onboarding_checklists: ["ACCOUNTS", "MAIN / OnboardingChecklist", "New-account checklist progress."],
  account_updates: ["(Apps Script)", "MAIN / Account Updates", "Account history notes. Copied; the app still reads and saves them through Apps Script."],
  sub_transfer_proposals: ["(Apps Script)", "MAIN / Sub Transfer Proposals", "Proposals to move accounts to another sub. Copied; still on Apps Script."],
  equipment_categories: ["EQUIPMENT", "MAIN / EquipmentCategories", "Kinds of equipment."],
  equipment: ["EQUIPMENT", "MAIN / Equipment", "Machines and tools."],
  equipment_checkouts: ["EQUIPMENT", "MAIN / EquipmentCheckouts", "Who took which item, when it came back."],
  equipment_parts: ["EQUIPMENT", "MAIN / EquipmentParts", "Spare parts."],
  equipment_repairs: ["EQUIPMENT", "MAIN / EquipmentRepairs", "Repairs."],
  sub_schedules: ["SCHEDULING", "MAIN / SubSchedules", "The weekly cleaning pattern of an account (day, time window, sub)."],
  schedule_exceptions: ["SCHEDULING", "MAIN / ScheduleExceptions", "A skipped or moved cleaning day."],
  subcontractor_visits: ["SCHEDULING", "PORTAL / subcontractor-visits", "Visits a sub logged."],
  visits: ["VISITS", "MAIN / Visits", "Site visits by staff, with the condition score."],
  visit_edit_log: ["VISITS", "MAIN / VisitEditLog", "Who changed a visit and what."],
  complaints: ["COMPLAINTS", "MAIN / Complaints", "Customer complaints. `resolution_note` exists only here (the sheet has no column for it)."],
  todos: ["TODOS", "MAIN / To Do", "To-do items for managers."],
  todo_sms_log: ["TODOS", "MAIN / SmsLog", "Text messages sent for to-dos."],
  sales: ["SALES", "MAIN / Sales & Commissions", "Sales and their commission."],
  portal_access: ["CUSTOMER_PORTAL", "PORTAL / customer-portal", "Which customers can log in to the portal, with phone and code."],
  portal_requests: ["CUSTOMER_PORTAL", "PORTAL / portal-complaints, portal-service-requests, portal-date-changes (+ billing)", "What customers send from /portal. `tab` says which kind."],
  sub_supplies: ["SUPPLIES", "MAIN / Supplies", "The supply list subs order from. Not Team Hub's supply_items."],
  sub_supply_orders: ["SUPPLIES", "MAIN / Supply Orders", "One row per ordered item."],
  sub_portal_issues: ["SUB_PORTAL", "MAIN / Sub Portal Issues", "Issues subs report; staff see them under Notifications."],
  photos: ["(Apps Script)", "MAIN / Photos", "Photo records. Copied; uploading and listing still go through Apps Script."],
};
const BOOKKEEPING = ["schema_migrations", "migration_runs", "migration_issues", "migration_overrides"];
const SKIP_COLUMNS = new Set(["source_sheet", "source_row", "imported_at", "created_at", "updated_at", "legacy_key"]);

const columns = await sql.query(
  `SELECT table_name, column_name, data_type, is_nullable FROM information_schema.columns WHERE table_schema = 'public' ORDER BY table_name, ordinal_position`
);
const fks = await sql.query(
  `SELECT conrelid::regclass::text AS tbl, (SELECT attname FROM pg_attribute WHERE attrelid = conrelid AND attnum = conkey[1]) AS col,
          confrelid::regclass::text AS ref_tbl, (SELECT attname FROM pg_attribute WHERE attrelid = confrelid AND attnum = confkey[1]) AS ref_col
   FROM pg_constraint WHERE contype = 'f' AND connamespace = 'public'::regnamespace`
);
const allTables = [...new Set(columns.map((c) => c.table_name))];
const short = (type) => ({ "character varying": "text", "timestamp with time zone": "timestamptz", "timestamp without time zone": "timestamp", "double precision": "float", integer: "int", bigint: "bigint", boolean: "bool" })[type] ?? type;

const lines = [
  "# Data model",
  "",
  `Written ${today()} by \`scripts/migrate/data-model.mjs\` from the Neon **dev** branch. Structure and row counts only.`,
  "",
  "## How to read it",
  "",
  "- Every table made by the migration has the same bookkeeping columns: `legacy_key` (unique; how a row is found again when the import re-runs), `source_sheet` + `source_row` (where it came from; empty on rows created in Postgres), `imported_at`, `created_at`, `updated_at`. They are left out of the column lists below.",
  "- A column ending in `_raw` holds the text exactly as the sheet showed it. A typed column next to it (a date, a number) is filled only when the text really is one. The app reads the text, so the screens show what they showed before.",
  "- `sheet_row` is the row number the app uses to find a row when it saves. Imported rows keep their sheet row; new rows get the next number.",
  "- A link (`account_ref`, `subcontractor_id` …) is set only on an exact match. The name the sheet had stays in the row either way. Deleting an account or a sub un-links its rows; it never deletes them.",
  "- **Switch** is the `DATA_SOURCE_<AREA>` setting that makes the app use the table. None is on in production.",
  "",
  "## Tables from Google Sheets",
  "",
];

let total = 0;
const summary = [];
for (const [table, [area, source, what]] of Object.entries(TABLES)) {
  if (!allTables.includes(table)) continue;
  const [{ n, created }] = await sql.query(`SELECT count(*)::int AS n, count(*) FILTER (WHERE ${columns.some((c) => c.table_name === table && c.column_name === "source_sheet") ? "source_sheet IS NULL" : "false"})::int AS created FROM ${table}`);
  total += n;
  summary.push(`| \`${table}\` | ${area} | ${source} | ${n} |`);
  const cols = columns.filter((c) => c.table_name === table && !SKIP_COLUMNS.has(c.column_name));
  const links = fks.filter((f) => f.tbl === table);
  lines.push(`### ${table}`, "", what, "", `Switch: ${area}. From: ${source}. Rows: ${n}${created ? ` (${created} created in Postgres)` : ""}.`, "");
  lines.push("Columns: " + cols.map((c) => `\`${c.column_name}\` ${short(c.data_type)}`).join(", ") + ".", "");
  if (links.length) lines.push("Links: " + links.map((f) => `\`${f.col}\` → \`${f.ref_tbl}.${f.ref_col}\``).join(", ") + ".", "");
}

lines.splice(lines.indexOf("## Tables from Google Sheets") + 2, 0, "| Table | Switch | From | Rows |", "|---|---|---|---|", ...summary, "", `${summary.length} tables, ${total} rows.`, "");

lines.push("## Migration bookkeeping", "");
for (const table of BOOKKEEPING) {
  if (!allTables.includes(table)) continue;
  const [{ n }] = await sql.query(`SELECT count(*)::int AS n FROM ${table}`);
  const what = { schema_migrations: "Which `db/migrations/*.sql` files were applied.", migration_runs: "One row per import run.", migration_issues: "Open questions the imports found (a name that matches nothing, a repeated id …).", migration_overrides: "Andres' answers to those questions; the import obeys them." }[table];
  lines.push(`- \`${table}\` (${n} rows): ${what}`);
}
const [open] = await sql.query(`SELECT count(*)::int AS n FROM migration_issues WHERE status = 'open'`);
lines.push("", `Open questions right now: ${open.n}.`, "");

const known = new Set([...Object.keys(TABLES), ...BOOKKEEPING]);
const others = allTables.filter((t) => !known.has(t)).sort();
lines.push(
  "## Tables that were already in Postgres (not changed by the migration)",
  "",
  "Team Hub, Crew Link checklists, vehicles, the staff activity log and logins. The migration reads some of them and changes none.",
  "",
  others.map((t) => `\`${t}\``).join(", ") + ".",
  ""
);

const out = path.join(REPO_ROOT, "docs", "DATA_MODEL.md");
fs.writeFileSync(out, lines.join("\n"));
console.log(`Wrote ${path.relative(REPO_ROOT, out)}: ${summary.length} tables, ${total} rows, ${others.length} tables left as they were.`);
