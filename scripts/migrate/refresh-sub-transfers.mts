// Refreshes ONLY the Sub Transfer Proposals rows from the Sheet (MAIN / Sub
// Transfer Proposals, read-only), with the same row keys as
// import-accounts.mts, so a row is refreshed and never doubled. Rows saved
// by the app (no sheet row) are never touched. Nothing is deleted. Use it
// right before DATA_SOURCE_SUB_TRANSFERS is switched to postgres.
//
//   npx tsx scripts/migrate/refresh-sub-transfers.mts                        practice database, dry run
//   npx tsx scripts/migrate/refresh-sub-transfers.mts --write                practice database, copy in
//   npx tsx scripts/migrate/refresh-sub-transfers.mts --check                practice database: compare with Apps Script's list
//   ... add --production for the production database (.env.production.local)
//
// No names, pay or emails are printed: only counts.
import { neon } from "@neondatabase/serverless";
import { loadEnv } from "./lib/env.mjs";
import { assertDevDatabase } from "./lib/guard.mjs";
import { cell, sha256 } from "./lib/import-helpers.mjs";
import { productionUrl } from "./lib/production.mjs";
import { isBlankRow, readTab } from "./lib/sheets-readonly.mjs";

loadEnv();
const write = process.argv.includes("--write");
const check = process.argv.includes("--check");
const production = process.argv.includes("--production");
const url = production ? productionUrl() : assertDevDatabase(process.env.MIGRATION_DATABASE_URL);
const sql = neon(url);
console.log(`${production ? "PRODUCTION" : "Practice"} database, ${check ? "comparing only" : write ? "writing" : "dry run (nothing is written)"}.`);

if (check) {
  // The app's own list code, pointed at this database, against the live Apps Script answer.
  process.env.DATABASE_URL = url;
  process.env.OUTBOUND_DRY_RUN = "1";
  const base = process.env.GOOGLE_SCRIPT_URL;
  if (!base) throw new Error("GOOGLE_SCRIPT_URL is not set here.");
  const json = (await (await fetch(`${base}?action=getSubTransferProposals`, { cache: "no-store" })).json()) as { proposals?: Record<string, unknown>[] };
  const live = json.proposals ?? [];
  const { getSubTransferProposals } = await import("../../lib/pg/sub-transfers");
  const ours = (await getSubTransferProposals()) as unknown as Record<string, unknown>[];
  // Pay is left out on purpose: Apps Script's list always says 0 (the sheet's column is spelled "Proposed Montly
  // Pay" and the script looks for "Monthly"); the app shows the real pay. The accounts are compared without it.
  const FIELDS = ["id", "proposalId", "createdAt", "status", "newSubcontractor", "newSubcontractorEmail", "totalMonthlyRevenue", "notes", "acceptedAt", "declinedAt", "sentAt", "accountCount", "rowNumber", "accountsNoPay"];
  const noPay = (list: Record<string, unknown>[]) => { for (const entry of list) entry.accountsNoPay = JSON.stringify(((entry.accounts as Record<string, unknown>[]) ?? []).map((account) => ({ ...account, proposedMonthlyPay: 0 }))); };
  noPay(live);
  noPay(ours);
  console.log(`Apps Script says pay 0 on all of its ${live.length}: ${live.every((p) => p.proposedMonthlyPay === "0")}. Postgres has a real pay on ${ours.filter((p) => p.proposedMonthlyPay !== "0").length}.`);
  const perField = new Map<string, number>();
  let different = 0;
  const compared = Math.min(live.length, ours.length);
  // Newest first on both sides; rows saved by the app are extra at the front of ours.
  const offset = ours.length - live.length;
  for (let i = 0; i < compared; i++) {
    let differs = false;
    for (const field of FIELDS) {
      if (String(live[i][field] ?? "") !== String(ours[i + Math.max(0, offset)][field] ?? "")) {
        differs = true;
        perField.set(field, (perField.get(field) ?? 0) + 1);
      }
    }
    if (differs) different++;
  }
  console.log(`Apps Script: ${live.length} proposals. Postgres: ${ours.length}. Compared ${compared}, field by field: ${different} different.`);
  for (const [field, count] of perField) console.log(`  ${field}: ${count} differ`);
  if (different > 0 || ours.length < live.length) process.exitCode = 1;
} else {
  const norm = (value: unknown) => String(value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
  const toMoney = (raw: string): string | null => {
    const cleaned = raw.replace(/[$,\s]/g, "");
    return cleaned !== "" && !Number.isNaN(Number(cleaned)) ? Number(cleaned).toFixed(2) : null;
  };
  const all = ((await readTab("MAIN", "Sub Transfer Proposals", { range: "A:O" })) as string[][]).slice(1).map((row, index) => ({ row, sourceRow: index + 2 }));
  const sheetRows = all.filter(({ row }) => !isBlankRow(row));

  const subByEmail = new Map<string, string[]>();
  for (const sub of (await sql`SELECT id, email FROM subcontractors WHERE email <> ''`) as { id: string; email: string }[]) subByEmail.set(norm(sub.email), [...(subByEmail.get(norm(sub.email)) ?? []), sub.id]);
  const byName = new Map<string, number[]>();
  for (const account of (await sql`SELECT pk, account_name FROM accounts`) as { pk: number; account_name: string }[]) if (norm(account.account_name)) byName.set(norm(account.account_name), [...(byName.get(norm(account.account_name)) ?? []), account.pk]);
  const one = <T,>(hits: T[] | undefined): T | null => (hits && hits.length === 1 ? hits[0] : null);

  // The exact moments (created, sent, accepted, declined). The sheet only shows them rounded, on its own
  // clock; Apps Script's list (read-only) has them exactly, per proposal.
  const exact = new Map<string, Record<string, unknown>>();
  try {
    const base = process.env.GOOGLE_SCRIPT_URL;
    const live = base ? (((await (await fetch(`${base}?action=getSubTransferProposals`, { cache: "no-store" })).json()) as { proposals?: Record<string, unknown>[] }).proposals ?? []) : [];
    for (const proposal of live) exact.set(String(proposal.proposalId ?? "").trim(), proposal);
  } catch {
    console.log("Apps Script's list did not load: dates are kept as the sheet shows them.");
  }
  const moment = (proposalId: string, field: string, shown: string) => {
    const value = String(exact.get(proposalId.trim())?.[field] ?? "");
    return shown.trim() && /^\d{4}-\d{2}-\d{2}T/.test(value) ? value : shown;
  };

  const seen = new Map<string, number>();
  const rows = sheetRows.map(({ row, sourceRow }) => {
    const base = sha256("proposal", cell(row, 0).trim(), norm(cell(row, 5)), norm(cell(row, 6)));
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    return {
      legacy_key: n === 1 ? base : `${base}#${n}`,
      proposal_id: cell(row, 0),
      created_at_raw: moment(cell(row, 0), "createdAt", cell(row, 1)),
      status: cell(row, 2),
      new_subcontractor: cell(row, 3),
      new_subcontractor_email: cell(row, 4),
      new_subcontractor_id: one(subByEmail.get(norm(cell(row, 4)))),
      account_name: cell(row, 5),
      account_pk: one(byName.get(norm(cell(row, 5)))),
      address: cell(row, 6),
      cleaning_days: cell(row, 7),
      scope: cell(row, 8),
      keys_alarm: cell(row, 9),
      proposed_monthly_pay: toMoney(cell(row, 10)),
      proposed_monthly_pay_raw: cell(row, 10),
      accepted_at_raw: moment(cell(row, 0), "acceptedAt", cell(row, 11)),
      declined_at_raw: moment(cell(row, 0), "declinedAt", cell(row, 12)),
      notes: cell(row, 13),
      sent_at_raw: moment(cell(row, 0), "sentAt", cell(row, 14)),
      source_sheet: "MAIN",
      source_row: sourceRow,
    };
  });

  const before = (await sql`SELECT legacy_key, source_sheet IS NULL AS from_app FROM sub_transfer_proposals`) as { legacy_key: string; from_app: boolean }[];
  const known = new Set(before.filter((entry) => !entry.from_app).map((entry) => entry.legacy_key));
  const fresh = rows.filter((entry) => !known.has(entry.legacy_key)).length;
  console.log(`Sheet: ${rows.length} rows in ${new Set(rows.map((r) => r.proposal_id)).size} proposals. Database: ${known.size} rows from the sheet, ${before.length - known.size} saved by the app (left alone).`);
  console.log(`New from the sheet: ${fresh}. Already copied (refreshed): ${rows.length - fresh}.`);
  if (!write) {
    console.log("Dry run: nothing written. Add --write to copy in.");
  } else if (rows.length > 0) {
    const columns = Object.keys(rows[0]);
    const statement =
      `INSERT INTO sub_transfer_proposals (${columns.join(", ")}, imported_at) VALUES (${columns.map((_, i) => `$${i + 1}`).join(", ")}, now()) ` +
      `ON CONFLICT (legacy_key) DO UPDATE SET ${columns.filter((c) => c !== "legacy_key").map((c) => `${c} = EXCLUDED.${c}`).join(", ")}, imported_at = now(), updated_at = now() ` +
      `WHERE sub_transfer_proposals.source_sheet IS NOT NULL`;
    await sql.transaction(rows.map((row) => sql.query(statement, columns.map((c) => (row as Record<string, unknown>)[c]))));
    const after = ((await sql`SELECT count(*) FILTER (WHERE source_sheet IS NOT NULL)::int AS sheet FROM sub_transfer_proposals`) as { sheet: number }[])[0];
    console.log(`Done. Database has ${after.sheet} rows from the sheet. Sheet has ${rows.length}. ${after.sheet === rows.length ? "They match." : "THEY DO NOT MATCH: do not switch yet."}`);
  }
}
