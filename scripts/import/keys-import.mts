// ONE-TIME import of the old key sheet (keys-import.csv) into the Keys tab.
//
//   npx tsx scripts/import/keys-import.mts                  preview on PRODUCTION; writes nothing
//   npx tsx scripts/import/keys-import.mts --apply          write it to PRODUCTION
//   npx tsx scripts/import/keys-import.mts --practice       preview on the practice database
//   npx tsx scripts/import/keys-import.mts --practice --apply
//   add --file <path> for a CSV somewhere else (default: keys-import.csv here)
//
// Needs migration 060. Production is read from DATABASE_URL in .env.local
// (MIGRATION_DATABASE_URL is ignored for it). The database address is never
// printed. The CSV holds alarm codes: it is in .gitignore, never commit it,
// and delete it once the import is done.
//
// Per CSV row, matched to ONE account by name (exact, case / spaces /
// punctuation / "&" ignored; never a guess):
//   Code     -> key code. Paris Baguette: its Code is door codes, so that text (as typed)
//               goes into Key / Alarm / Access Info and the key code stays empty.
//   Copy     -> Has Key: TRUE = Yes, FALSE = No, blank = left as it is.
//   Cleaner  -> key holder; linked to a sub or staff member when the name is
//               exactly one of theirs, otherwise kept as typed.
//   Notes    -> added to the end of Key / Alarm / Access Info, keeping what is there.
// Nothing else on the account is touched. Rows with no account name are
// skipped (unused codes). Rows that match no account, or more than one, are
// listed and not imported. A lone "TRUE" in Access Info is dropped. Running it again changes nothing new: text
// already in Access Info is not added twice, and an equal value is no change.

import fs from "node:fs";

/* ---------- which database ---------- */

function loadEnv(file: string): void {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const match = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (!match || process.env[match[1]] !== undefined) continue;
    process.env[match[1]] = match[2].replace(/^["']|["']$/g, "");
  }
}

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const practice = args.includes("--practice");
const fileArg = args.indexOf("--file");
const csvPath = fileArg >= 0 ? args[fileArg + 1] : "keys-import.csv";

if (practice) {
  loadEnv(".env.development.local");
  process.env.DATABASE_URL = process.env.MIGRATION_DATABASE_URL ?? "";
  if (/ep-old-unit-auedho5y/.test(process.env.DATABASE_URL)) throw new Error("That is production, not practice.");
}
loadEnv(".env.local");
delete process.env.MIGRATION_DATABASE_URL;
process.env.DATA_SOURCE_ACCOUNTS ??= "postgres";
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set.");
const where = practice ? "PRACTICE" : "PRODUCTION";
console.log(`${where} database. ${apply ? "WRITING the import." : "Preview only: nothing is written."}\n`);

/* ---------- the CSV ---------- */

if (!fs.existsSync(csvPath)) throw new Error(`${csvPath} is not here.`);

/**
 * RFC 4180: commas, "quoted, fields", "" for a quote, line breaks inside
 * quotes. Blank rows are dropped (the sheet's first row is blank), and each
 * row keeps its spreadsheet row number for the preview.
 */
function parseCsv(text: string): { line: number; cells: string[] }[] {
  const rows: { line: number; cells: string[] }[] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  let line = 1;
  let rowStart = 1;
  const endRow = () => {
    row.push(field);
    rows.push({ line: rowStart, cells: row });
    row = [];
    field = "";
  };
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') quoted = false;
      else {
        if (c === "\n") line++;
        field += c;
      }
    } else if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      endRow();
      line++;
      rowStart = line;
    } else field += c;
  }
  if (field !== "" || row.length) endRow();
  return rows.filter((r) => r.cells.some((cell) => cell.trim() !== ""));
}

const parsed = parseCsv(fs.readFileSync(csvPath, "utf8").replace(/^﻿/, ""));
const table = parsed.map((r) => r.cells);
const header = (table[0] ?? []).map((h) => h.trim().toLowerCase());
const col = (...names: string[]) => header.findIndex((h) => names.includes(h));
const COL = {
  account: col("account", "account name", "name", "customer", "client", "location"),
  code: col("code", "key code"),
  copy: col("copy", "has copy"),
  cleaner: col("cleaner", "key holder", "holder"),
  notes: col("notes", "note"),
};
const missing = Object.entries(COL).filter(([, i]) => i < 0).map(([k]) => k);
if (missing.length) {
  console.error(`The CSV's first row is ${JSON.stringify(table[0])}. Could not find: ${missing.join(", ")}. Nothing was read.`);
  process.exit(1);
}
const csvRows = parsed.slice(1).map(({ line, cells }) => {
  const cell = (index: number) => String(cells[index] ?? "").trim();
  return { line, account: cell(COL.account), code: cell(COL.code), copy: cell(COL.copy), cleaner: cell(COL.cleaner).replace(/\s+/g, " "), notes: cell(COL.notes) };
});

/* ---------- the database ---------- */

const { getSql } = await import("../../lib/db");
const { fetchAccountRows, updateAccountFieldsDirect } = await import("../../lib/pg/accounts");
const { linkKeyHolder } = await import("../../lib/keyHolder");
const { logActivity } = await import("../../lib/activityLog");
const sql = getSql();

const ready = (await sql.query(`SELECT 1 FROM information_schema.columns WHERE table_name = 'accounts' AND column_name = 'key_code'`)) as unknown[];
if (ready.length === 0) {
  console.error(`Migration 060 is not applied on the ${where} database yet. Nothing was read or written.`);
  process.exit(1);
}

const accounts = await fetchAccountRows();
const [subs, staff, codesInUse] = await Promise.all([
  sql.query(`SELECT id, contact_name, company_name FROM subcontractors`) as unknown as Promise<{ id: string; contact_name: string; company_name: string }[]>,
  sql.query(`SELECT id, name FROM staff`) as unknown as Promise<{ id: string; name: string }[]>,
  // Every account's code, deleted and test accounts too (the unique index covers them all).
  sql.query(`SELECT btrim(id) AS id, upper(key_code) AS code FROM accounts WHERE key_code <> ''`) as unknown as Promise<{ id: string; code: string }[]>,
]);
const people = {
  subs: subs.map((s) => ({ id: s.id, contactName: s.contact_name, companyName: s.company_name })),
  staff: staff.map((s) => ({ id: s.id, name: s.name })),
};

const normName = (v: string) => v.toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, " ").trim();
const byName = new Map<string, typeof accounts>();
for (const account of accounts) {
  const key = normName(String(account.account_name ?? ""));
  if (key) byName.set(key, [...(byName.get(key) ?? []), account]);
}
const str = (v: unknown) => String(v ?? "");
// Only the account named exactly "Paris Baguette" (not "Paris Baguette- Old Bridge").
const isParisBaguette = (name: string) => normName(name) === "paris baguette";

/* ---------- the plan ---------- */

type Plan = {
  line: number;
  accountId: string;
  accountName: string;
  fields: Record<string, string>;
  show: { what: string; from: string; to: string }[];
};
const plans: Plan[] = [];
const skippedNoAccount: number[] = [];
const notMatched: { line: number; name: string; why: string }[] = [];
const problems: { line: number; name: string; why: string }[] = [];
const seenAccount = new Map<string, number>();
const seenCode = new Map<string, number>();

/** Adds text to the end of Access Info, unless it is already there. */
function appended(existing: string, add: string): string {
  if (!add || existing.includes(add)) return existing;
  return existing.trim() ? `${existing.replace(/\s+$/, "")}\n${add}` : add;
}

// First pass: which account each row is. Two rows for one account: neither is imported.
const matched: { row: (typeof csvRows)[number]; account: (typeof accounts)[number]; accountId: string }[] = [];
for (const row of csvRows) {
  if (!row.account) {
    skippedNoAccount.push(row.line);
    continue;
  }
  const found = byName.get(normName(row.account)) ?? [];
  if (found.length !== 1) {
    notMatched.push({ line: row.line, name: row.account, why: found.length === 0 ? "no account by this name" : `${found.length} accounts have this name` });
    continue;
  }
  const accountId = str(found[0].id).trim();
  if (!accountId) {
    notMatched.push({ line: row.line, name: row.account, why: "the account has no Account ID" });
    continue;
  }
  // Andrés, Oct 26: leave every other Paris Baguette account (e.g. Old Bridge) alone.
  const name = normName(str(found[0].account_name));
  if (name.includes("paris baguette") && !isParisBaguette(name)) {
    notMatched.push({ line: row.line, name: row.account, why: "another Paris Baguette account; left alone on purpose" });
    continue;
  }
  matched.push({ row, account: found[0], accountId });
  seenAccount.set(accountId, (seenAccount.get(accountId) ?? 0) + 1);
}

for (const { row, account, accountId } of matched) {
  if ((seenAccount.get(accountId) ?? 0) > 1) {
    const lines = matched.filter((m) => m.accountId === accountId).map((m) => m.row.line);
    problems.push({ line: row.line, name: row.account, why: `lines ${lines.join(" and ")} are the same account; not imported` });
    continue;
  }

  const fields: Record<string, string> = {};
  const show: Plan["show"] = [];
  const paris = isParisBaguette(String(account.account_name ?? ""));

  // Code
  let rowProblem = "";
  if (row.code && !paris) {
    const code = row.code;
    const had = str(account.key_code);
    if (!/^[A-Za-z0-9-]{1,20}$/.test(code)) rowProblem = `code "${code}" is not letters and numbers only`;
    else if (had && had !== code) rowProblem = `account already has key code ${had}; not replaced`;
    else if (codesInUse.some((c) => c.code === code.toUpperCase() && c.id !== accountId)) rowProblem = `code ${code} is already used by another account`;
    else if (seenCode.has(code.toUpperCase())) rowProblem = `code ${code} is also on line ${seenCode.get(code.toUpperCase())}`;
    else if (had !== code) {
      fields.keyCode = code;
      show.push({ what: "Key code", from: had, to: code });
    }
    seenCode.set(code.toUpperCase(), row.line);
  }
  if (rowProblem) {
    problems.push({ line: row.line, name: row.account, why: `${rowProblem}; row not imported` });

    continue;
  }

  // Copy
  const copy = row.copy.toUpperCase();
  if (copy && copy !== "TRUE" && copy !== "FALSE") {
    problems.push({ line: row.line, name: row.account, why: `Copy is "${row.copy}", not TRUE or FALSE; row not imported` });

    continue;
  }
  if (copy) {
    const to = copy === "TRUE" ? "Yes" : "No";
    const had = str(account.has_key);
    if (had !== to) {
      fields.hasKey = to;
      show.push({ what: "Copy (Has Key)", from: had, to });
    }
  }

  // Cleaner
  if (row.cleaner && row.cleaner !== str(account.key_holder)) {
    const link = linkKeyHolder(row.cleaner, people);
    fields.keyHolder = row.cleaner;
    const linkText =
      link.match === "sub" ? `linked to sub ${link.matchedName}` : link.match === "staff" ? `linked to staff ${link.matchedName}` : link.match === "several" ? "kept as typed (more than one person has this name)" : "kept as typed (no sub or staff by this name)";
    show.push({ what: "Key holder", from: str(account.key_holder), to: `${row.cleaner}  [${linkText}]` });
  }

  // Notes, and Paris Baguette's door codes (as typed: they start "Doors:"),
  // onto the end of Access Info. A lone "TRUE" there is an old Has Key
  // value in the wrong field: dropped (Andrés, Oct 26).
  const hadInfo = str(account.key_alarm_access_info);
  let info = hadInfo.trim().toUpperCase() === "TRUE" ? "" : hadInfo;
  if (paris && row.code) info = appended(info, row.code);
  info = appended(info, row.notes);
  if (info !== hadInfo) {
    fields.keyAlarmAccessInfo = info;
    show.push({ what: "Access info", from: hadInfo, to: info });
  }

  if (show.length) plans.push({ line: row.line, accountId, accountName: str(account.account_name), fields, show });
}

/* ---------- the preview ---------- */

const oneLine = (v: string) => (v ? v.replace(/\s*\n\s*/g, " ⏎ ") : "(empty)");
console.log(`CSV rows: ${csvRows.length}. Will change: ${plans.length} accounts. Skipped, no account name: ${skippedNoAccount.length}. Not matched: ${notMatched.length}. Problems: ${problems.length}.\n`);
console.log("WHAT WILL CHANGE");
console.log("line | account | field | now | after");
for (const plan of plans) {
  for (const s of plan.show) console.log(`${plan.line} | ${plan.accountName} | ${s.what} | ${oneLine(s.from)} | ${oneLine(s.to)}`);
}
if (notMatched.length) {
  console.log("\nNOT MATCHED (not imported; fix the name in the CSV or tell me which account it is)");
  for (const m of notMatched) console.log(`${m.line} | ${m.name} | ${m.why}`);
}
if (problems.length) {
  console.log("\nPROBLEMS (not imported)");
  for (const p of problems) console.log(`${p.line} | ${p.name} | ${p.why}`);
}
if (skippedNoAccount.length) console.log(`\nSkipped ${skippedNoAccount.length} rows with no account name (unused codes), rows ${skippedNoAccount[0]}-${skippedNoAccount[skippedNoAccount.length - 1]}.`);

/* ---------- the write ---------- */

if (!apply) {
  console.log("\nPreview only. Nothing was written.");
  process.exit(0);
}
let saved = 0;
const failed: string[] = [];
for (const plan of plans) {
  try {
    const result = await updateAccountFieldsDirect(plan.accountId, plan.fields);
    const { describeAccountChanges } = await import("../../lib/accountChanges");
    await logActivity({
      actorAccountId: null,
      actorRole: "manager",
      actorName: "Key sheet import",
      action: "update",
      entityType: "account",
      entityId: plan.accountId,
      detail: describeAccountChanges(result.before, result.after) || "Key sheet import (no field changes)",
    });
    saved += 1;
  } catch (err) {
    failed.push(`${plan.line} | ${plan.accountName} | ${err instanceof Error ? err.message : String(err)}`);
  }
}
console.log(`\nWrote ${saved} of ${plans.length} accounts.`);
if (failed.length) {
  console.log("FAILED (not written):");
  for (const f of failed) console.log(f);
  process.exit(1);
}
