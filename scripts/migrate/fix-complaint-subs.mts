// Fills in "the sub who had the account when the complaint was filed"
// (complaints.sub_at_filing, migration 031) for the complaints that were
// filed before the app saved it. Until a complaint has it, the complaint
// counts against whoever has the account today.
//
//   npx tsx scripts/migrate/fix-complaint-subs.mts                 practice database, dry run: lists what it would do
//   npx tsx scripts/migrate/fix-complaint-subs.mts --write         practice database, saves it
//   ... add --production for the production database (.env.production.local).
//   Only with the owner's OK, after a Neon backup branch.
//   ... --set COMP-20260915101500="Pancho"    answers one complaint by hand
//       (repeat --set for more; "" means the account had no sub then)
//
// How it decides, per complaint that has nothing saved yet:
//   1. An answer given with --set wins.
//   2. It looks for a sub change on that account AFTER the complaint's date:
//        - a line "Subcontractor: old → new" in the account's History
//          (the activity log; kept since the app logs every account change)
//        - an Account Update about the sub ("Sub replacement",
//          "Subcontractor Update", …) whose note says "from X to Y"
//        - an accepted Sub Transfer Proposal (it names the new sub only)
//   3. No change after the complaint: the sub then is the sub the account
//      has now. Saved.
//   4. A change after it, and the record names the old sub: the old sub of
//      the first change after the complaint. Saved.
//   5. A change after it, but no record names the old sub: NOT guessed. It
//      is listed under "needs your answer"; use --set.
// It never changes a complaint that already has a sub saved, and never
// touches anything but that one column. It prints account names and sub
// names (that is the point of it); no money, no contact details.
import { neon } from "@neondatabase/serverless";
import { loadEnv } from "./lib/env.mjs";
import { assertDevDatabase } from "./lib/guard.mjs";
import { productionUrl } from "./lib/production.mjs";

loadEnv();
const args = process.argv.slice(2);
const write = args.includes("--write");
const production = args.includes("--production");
const sql = neon(production ? productionUrl() : assertDevDatabase(process.env.MIGRATION_DATABASE_URL));
console.log(`${production ? "PRODUCTION" : "Practice"} database, ${write ? "writing" : "dry run (nothing is written)"}.`);

const answers = new Map<string, string>();
for (let i = 0; i < args.length; i++) {
  if (args[i] !== "--set") continue;
  const [id, ...rest] = (args[i + 1] ?? "").split("=");
  if (!id || rest.length === 0) throw new Error('--set needs COMPLAINT-ID="Sub name"');
  answers.set(id.trim(), rest.join("=").trim().replace(/^["']|["']$/g, ""));
}

const has = (await sql`SELECT 1 FROM information_schema.columns WHERE table_name = 'complaints' AND column_name = 'sub_at_filing'`) as unknown[];
if (has.length === 0) throw new Error("Migration 031 is not applied in this database: the column is not there. Nothing was done.");

type Complaint = { id: string; complaint_id: string; account_ref: string | null; account: string; day: string | null; sub_now: string | null };
type Change = { account_id: string; day: string; from: string; to: string; source: string };

const complaints = (await sql`
  SELECT c.id::text AS id, btrim(c.complaint_id) AS complaint_id, c.account_ref, btrim(c.account_name) AS account, c.complaint_date::text AS day,
         (SELECT btrim(a.subcontractor_raw) FROM accounts a WHERE a.id = c.account_ref) AS sub_now
  FROM complaints c WHERE c.sub_at_filing IS NULL ORDER BY c.complaint_date NULLS LAST, c.sheet_row`) as Complaint[];

const changes: Change[] = [];
// 1. The account's History: "Subcontractor: old → new".
for (const row of (await sql`SELECT entity_id, (created_at AT TIME ZONE 'America/New_York')::date::text AS day, detail FROM activity_log WHERE entity_type = 'account' AND detail ILIKE '%Subcontractor:%'`) as { entity_id: string; day: string; detail: string }[]) {
  for (const line of row.detail.split("\n")) {
    const m = /^Subcontractor:\s*(.*?)\s*→\s*(.*)$/.exec(line.trim());
    if (m) changes.push({ account_id: row.entity_id, day: row.day, from: m[1] === "(blank)" ? "" : m[1], to: m[2] === "(blank)" ? "" : m[2], source: "the account's History" });
  }
}
// 2. Account Updates about the sub, with "from X to Y" in the note when it is there.
for (const row of (await sql`
  SELECT a.id AS account_id, COALESCE(u.update_date::text, '') AS day, u.update_type, u.notes
  FROM account_updates u JOIN accounts a ON a.pk = u.account_pk
  WHERE u.update_type ILIKE '%sub%replac%' OR u.update_type ILIKE '%subcon%' OR u.update_type ILIKE '%transfer%'`) as { account_id: string; day: string; update_type: string; notes: string }[]) {
  if (!row.day) continue;
  const m = /\bfrom\s+(.+?)\s+to\s+(.+?)(?:[.,;\n]|$)/i.exec(row.notes);
  changes.push({ account_id: row.account_id, day: row.day, from: m ? m[1].trim() : "?", to: m ? m[2].trim() : "?", source: `Account Update "${row.update_type}"` });
}
// 3. Accepted transfer proposals: the new sub is known, the old one is not.
for (const row of (await sql`
  SELECT a.id AS account_id, left(p.accepted_at_raw, 10) AS day, btrim(p.new_subcontractor) AS new_sub
  FROM sub_transfer_proposals p JOIN accounts a ON a.pk = p.account_pk
  WHERE lower(btrim(p.status)) = 'accepted' AND p.accepted_at_raw ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}'`) as { account_id: string; day: string; new_sub: string }[]) {
  changes.push({ account_id: row.account_id, day: row.day, from: "?", to: row.new_sub, source: "accepted transfer proposal" });
}

const plan: { complaint: Complaint; sub: string; why: string }[] = [];
const open: { complaint: Complaint; why: string }[] = [];
for (const complaint of complaints) {
  if (answers.has(complaint.complaint_id)) {
    plan.push({ complaint, sub: answers.get(complaint.complaint_id)!, why: "your answer (--set)" });
    continue;
  }
  if (!complaint.account_ref || !complaint.day) {
    open.push({ complaint, why: complaint.account_ref ? "the complaint has no date" : "the complaint is not tied to an account" });
    continue;
  }
  const later = changes.filter((change) => change.account_id === complaint.account_ref && change.day > complaint.day!).sort((a, b) => a.day.localeCompare(b.day));
  if (later.length === 0) {
    plan.push({ complaint, sub: complaint.sub_now ?? "", why: "no sub change on record after the complaint" });
  } else if (later[0].from !== "?") {
    plan.push({ complaint, sub: later[0].from, why: `sub changed ${later[0].day} from ${later[0].from || "(none)"} to ${later[0].to || "(none)"} (${later[0].source})` });
  } else {
    open.push({ complaint, why: `sub changed ${later[0].day} (${later[0].source}), and nothing on record names the sub before it` });
  }
}

console.log(`\nComplaints with no sub saved: ${complaints.length}. Can be filled in: ${plan.length}. Need your answer: ${open.length}.`);
const moved = plan.filter((entry) => entry.sub !== (entry.complaint.sub_now ?? ""));
console.log(`\nThese ${moved.length} would stop counting against the account's sub of today:`);
for (const { complaint, sub, why } of moved) console.log(`  ${complaint.complaint_id} | ${complaint.account} | ${complaint.day ?? "no date"} | sub then: ${sub || "(none)"} | sub now: ${complaint.sub_now || "(none)"} | ${why}`);
console.log(`\nThe other ${plan.length - moved.length} keep the sub the account has now (no change on record after the complaint).`);
if (open.length > 0) {
  console.log(`\nNeeds your answer (left as they are; use --set ID="Sub name"):`);
  for (const { complaint, why } of open) console.log(`  ${complaint.complaint_id} | ${complaint.account} | ${complaint.day ?? "no date"} | sub now: ${complaint.sub_now || "(none)"} | ${why}`);
}

if (!write) {
  console.log("\nDry run: nothing written. Add --write to save.");
} else if (plan.length > 0) {
  await sql.transaction(plan.map(({ complaint, sub }) => sql`UPDATE complaints SET sub_at_filing = ${sub}, updated_at = now() WHERE id = ${Number(complaint.id)} AND sub_at_filing IS NULL`));
  const left = (await sql`SELECT count(*)::int AS n FROM complaints WHERE sub_at_filing IS NULL`) as { n: number }[];
  console.log(`\nSaved ${plan.length}. Complaints still with no sub saved: ${left[0].n}.`);
}
