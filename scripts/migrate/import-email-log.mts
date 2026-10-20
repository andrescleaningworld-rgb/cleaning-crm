// Brings the old "Email Log" tab of the main Google Sheet (written by the
// Apps Script's logEmailEvent until Oct 9, 2026) into the email_log table
// (migration 052). The sheet is only read (spreadsheets.readonly).
//
//   npx tsx scripts/migrate/import-email-log.mts                       practice: show what would be added
//   npx tsx scripts/migrate/import-email-log.mts --apply               practice: add it
//   npx tsx scripts/migrate/import-email-log.mts --production          production: show what would be added
//   npx tsx scripts/migrate/import-email-log.mts --production --apply  production: add it (backup first, owner's OK)
//
// Each sheet row becomes one row with legacy_key "sheet-email-log:<row>",
// so running it again adds nothing. The old tab kept who / when / subject /
// status, not the email itself: those rows have no body (source "apps-script").
// A row sent to a sub's email gets that sub's ID and name, so it shows on the
// sub's page too.
import { neon } from "@neondatabase/serverless";
import { getSql as practiceSql } from "./lib/pg.mjs";
import { productionUrl } from "./lib/production.mjs";
import { readTab } from "./lib/sheets-readonly.mjs";

const production = process.argv.includes("--production");
const apply = process.argv.includes("--apply");
const sql = production ? neon(productionUrl()) : practiceSql();

/** "6/16/2026 13:22:31" in New York time -> ISO. null when it is not that. */
function nyTime(text: string): string | null {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(text.trim());
  if (!m) return null;
  const [, mo, d, y, h, mi, s] = m.map(Number);
  const guess = Date.UTC(y, mo - 1, d, h, mi, s || 0);
  // New York's offset on that day (EDT -4 or EST -5).
  const zone = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", timeZoneName: "shortOffset" })
    .formatToParts(new Date(guess))
    .find((part) => part.type === "timeZoneName")?.value ?? "GMT-5";
  const hours = Number(/GMT([+-]\d+)/.exec(zone)?.[1] ?? -5);
  return new Date(guess - hours * 3600_000).toISOString();
}

const rows = await readTab("MAIN", "Email Log");
const header = rows[0] ?? [];
const expected = ["Timestamp", "Account Name", "Account ID", "Email Type", "Sent To", "Subject", "Status", "Related ID", "Triggered By", "User Role", "Source", "Notes"];
if (expected.some((name, index) => (header[index] ?? "").trim() !== name)) throw new Error(`The Email Log header is not what this script expects: ${header.join(" | ")}. Nothing was done.`);

const subs = (await sql`SELECT id, lower(btrim(email)) AS email, COALESCE(NULLIF(btrim(contact_name), ''), btrim(company_name)) AS name FROM subcontractors WHERE btrim(COALESCE(email, '')) <> ''`) as { id: string; email: string; name: string }[];
// "CW" is the office's own entry in the sub list (the office email): office notices are not sub emails.
const subByEmail = new Map(subs.filter((sub) => sub.name.trim().toLowerCase() !== "cw").map((sub) => [sub.email, sub]));

const existing = new Set(((await sql`SELECT legacy_key FROM email_log WHERE legacy_key LIKE 'sheet-email-log:%'`) as { legacy_key: string }[]).map((row) => row.legacy_key));

const cell = (row: string[], index: number) => String(row[index] ?? "").trim();
// The old names of the two sub emails the app still sends, as the app names them now, so one Type filter finds both.
const TYPE_NOW: Record<string, string> = { "New Account Packet": "Sub packet", "Sub Transfer Proposal": "Transfer proposal" };
const toAdd = [];
let unreadable = 0;
for (let i = 1; i < rows.length; i++) {
  const row = rows[i];
  if (row.every((value) => !String(value ?? "").trim())) continue;
  const key = `sheet-email-log:${i + 1}`;
  if (existing.has(key)) continue;
  const sentAt = nyTime(cell(row, 0));
  if (!sentAt) {
    unreadable += 1;
    continue;
  }
  const to = cell(row, 4);
  const sub = subByEmail.get(to.toLowerCase().split(/[,\s]+/)[0] ?? "");
  const failed = /fail/i.test(cell(row, 6));
  toAdd.push({
    key,
    sentAt,
    to,
    subject: cell(row, 5),
    type: TYPE_NOW[cell(row, 3)] ?? cell(row, 3),
    accountId: cell(row, 2),
    accountName: cell(row, 1),
    subId: sub?.id ?? "",
    subName: sub?.name ?? "",
    sentBy: cell(row, 8) || "System",
    status: failed ? "failed" : "sent",
    error: failed ? cell(row, 11) : "",
    note: cell(row, 11),
  });
}

console.log(`${production ? "PRODUCTION" : "Practice"} database. Sheet rows: ${rows.length - 1}. Already brought in: ${existing.size}. To add: ${toAdd.length}.${unreadable ? ` Skipped (no readable time): ${unreadable}.` : ""}`);
const byType: Record<string, number> = {};
for (const row of toAdd) byType[row.type || "(none)"] = (byType[row.type || "(none)"] ?? 0) + 1;
console.table(byType);
console.log(`Matched to a sub by email: ${toAdd.filter((row) => row.subId).length}`);

if (!apply) {
  console.log("Nothing was changed. Add --apply to bring them in.");
} else if (toAdd.length) {
  await sql.transaction(
    toAdd.map(
      (row) => sql`
        INSERT INTO email_log (sent_at, channel, to_address, subject, email_type, account_id, account_name, sub_id, sub_name, sent_by, status, error, body_text, source, legacy_key)
        VALUES (${row.sentAt}, 'email', ${row.to}, ${row.subject}, ${row.type}, ${row.accountId}, ${row.accountName}, ${row.subId}, ${row.subName}, ${row.sentBy}, ${row.status}, ${row.error}, '', 'apps-script', ${row.key})
        ON CONFLICT (legacy_key) DO NOTHING
      `
    )
  );
  const total = (await sql`SELECT count(*)::int AS n FROM email_log WHERE source = 'apps-script'`) as { n: number }[];
  console.log(`Added. Old rows in the log now: ${total[0]?.n ?? 0}.`);
}
