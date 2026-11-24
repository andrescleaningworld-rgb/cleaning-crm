// One-time cleanup of check-in answers made by email security scanners
// (Nov 2026). Approved list: #18 Total Mortgage and #22 EMCOR Services are
// FAKE; every other check-in is REAL and is not touched.
//
// For each FAKE check-in:
//   - the saved answer and its time are cleared (it shows "No answer yet")
//   - its old clicks in the History are marked "scanner, not a person"
//     (nothing is deleted), and one Staff line says what was done
//   - EMCOR comes off the "stop emails" list (a scanner click put it there)
// And complaint COMP-20261119181517 (made from #18's fake answer) is closed
// as Not Valid (Not Valid counts 0 on the team's score and on At risk).
// No email or text is sent: this writes to the database only (closing a
// complaint from the app would email the customer "It's fixed"; this does not).
// Check-in notes are not touched (neither one has any).
//
// Needs migration 093 first (the History table).
//
// DRY RUN by default: shows every change and saves nothing.
//   node --env-file=.env.local scripts/cleanup-checkin-scanner-answers.mjs
// Save, after a backup branch in Neon, all in one transaction:
//   node --env-file=.env.local scripts/cleanup-checkin-scanner-answers.mjs --apply --backup-done
//
// Every row changes only if it still is what it was when the list was
// approved; otherwise nothing at all is saved.

import { neon } from "@neondatabase/serverless";

const FAKE = [
  { id: 18, accountId: "total-mortgage", name: "Total Mortgage", answer: "ok" },
  { id: 22, accountId: "ACCT-20260720132917", name: "EMCOR Services", answer: "attention" },
];
const UNSTOP = { accountId: "ACCT-20260720132917", name: "EMCOR Services", checkinId: 22 };
const COMPLAINT = {
  id: "COMP-20261119181517",
  fromCheckin: 18,
  status: { from: "Open", to: "Closed" },
  validity: { from: "Needs Review", to: "Not Valid" },
  note: "Made from an email scanner click, not the customer.",
};
const BY = "Cleanup script";
const ANSWER_TEXT = { great: "😀 Great", ok: "😐 OK", attention: "😟 Needs attention" };

const apply = process.argv.includes("--apply");
const backupDone = process.argv.includes("--backup-done");
const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set. Run with: node --env-file=.env.local scripts/cleanup-checkin-scanner-answers.mjs");
  process.exit(1);
}
if (apply && !backupDone) {
  console.error("Make a backup branch in Neon first, then add --backup-done. Nothing was saved.");
  process.exit(1);
}
const sql = neon(url);
console.log(`Database: ${new URL(url).hostname.split(".")[0]} · ${apply ? "SAVING" : "DRY RUN, nothing is saved"}\n`);

const when = (value) =>
  value ? new Date(value).toLocaleString("en-US", { timeZone: "America/New_York", month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", second: "2-digit" }) : "(none)";
const show = (value) => (value === "" || value === null || value === undefined ? "(blank)" : JSON.stringify(value));
/** "11/24/2026 14:05:09", New York: the complaints' Updated At (lib/pg/complaints.ts newYorkStamp). */
function newYorkStamp() {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hourCycle: "h23", year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "2-digit", second: "2-digit" })
      .formatToParts(new Date())
      .map((part) => [part.type, part.value])
  );
  return `${p.month}/${p.day}/${p.year} ${Number(p.hour)}:${p.minute}:${p.second}`;
}

const problems = [];
const queries = [];
const lines = [];

// The History table (migration 093), with its "scanner" column.
const [ready] = await sql`
  SELECT to_regclass('public.customer_checkin_events') IS NOT NULL AS table_ok,
         EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'customer_checkin_events' AND column_name = 'scanner') AS scanner_ok
`;
const historyReady = ready.table_ok && ready.scanner_ok;
if (!historyReady && apply) {
  console.error("Migration 093 is not in yet (the check-in History table). Run it first. Nothing was saved.");
  process.exit(1);
}
if (!historyReady) console.log("Migration 093 is not in yet: the History below is read from the Activity Log (the lines 093 copies). Run 093 before --apply.\n");

/** A check-in's History: the table (093), or before it the Activity Log lines 093 will copy. */
async function historyOf(checkinId, accountId, sentAt) {
  if (historyReady) return sql`SELECT id::int, at, kind, rating, note, scanner FROM customer_checkin_events WHERE checkin_id = ${checkinId} ORDER BY at, id`;
  const rows = await sql`
    SELECT id::int, created_at AS at, detail AS note FROM activity_log
    WHERE source = 'customer' AND account_id = ${accountId} AND created_at >= ${sentAt}
      AND (detail LIKE 'Check-in: the customer%' OR detail LIKE 'Check-in feedback:%' OR detail = 'The customer stopped the check-in emails.')
    ORDER BY created_at, id
  `;
  return rows.map((r) => ({ ...r, kind: "earlier", rating: "", scanner: false }));
}

/* ---------- the two check-ins ---------- */

for (const fake of FAKE) {
  const [row] = await sql`
    SELECT k.id::int, k.account_id, a.account_name, k.status, k.sent_at, k.answer, k.answered_at, k.comment, k.photos, k.reach
    FROM customer_checkins k LEFT JOIN accounts a ON a.id = k.account_id WHERE k.id = ${fake.id}
  `;
  lines.push(`Check-in #${fake.id} ${fake.name}`);
  if (!row) {
    problems.push(`#${fake.id}: not found.`);
    continue;
  }
  if (row.account_id !== fake.accountId) problems.push(`#${fake.id}: belongs to ${row.account_id}, not ${fake.accountId}.`);
  if (row.comment || row.photos || row.reach) problems.push(`#${fake.id}: has a note, photos or a way to reach them now. A person wrote it; left alone.`);
  const events = await historyOf(fake.id, fake.accountId, row.sent_at);
  const newer = events.filter((e) => e.kind !== "earlier" && e.kind !== "ignored" && e.kind !== "staff");
  if (newer.length) problems.push(`#${fake.id}: has ${newer.length} new tap(s) or note(s) since the list was approved (${newer.map((e) => e.kind).join(", ")}). Check them first.`);

  lines.push(`  Sent ${when(row.sent_at)}`);
  if (row.answer === "") {
    lines.push(`  Answer: already "No answer yet". Nothing to clear.`);
  } else if (row.answer !== fake.answer) {
    problems.push(`#${fake.id}: the answer is now ${show(row.answer)}, not ${show(fake.answer)} as approved.`);
  } else {
    lines.push(`  Answer: ${ANSWER_TEXT[row.answer]} (${when(row.answered_at)})  →  No answer yet`);
    queries.push(sql`UPDATE customer_checkins SET answer = '', answered_at = NULL WHERE id = ${fake.id} AND answer = ${fake.answer}`);
  }

  const toMark = events.filter((e) => e.kind === "earlier" && !e.scanner);
  lines.push(`  History: ${events.length} line(s) kept, ${toMark.length} marked "scanner, not a person":`);
  for (const e of events) lines.push(`    ${when(e.at)}  ${e.note || `${e.kind} ${e.rating}`}${e.scanner || toMark.includes(e) ? "  [scanner, not a person]" : ""}`);
  if (toMark.length) queries.push(sql`UPDATE customer_checkin_events SET scanner = true WHERE checkin_id = ${fake.id} AND kind = 'earlier' AND scanner = false`);

  // Already cleared (a second run): no new lines.
  if (row.answer !== fake.answer) {
    lines.push("");
    continue;
  }
  const staffNote = `Answer cleared (was ${ANSWER_TEXT[fake.answer]}, ${when(row.answered_at)}): the clicks were an email security scanner, not a person.`;
  lines.push(`  New History line: "Staff: ${staffNote}"`);
  queries.push(sql`INSERT INTO customer_checkin_events (checkin_id, account_id, kind, note) VALUES (${fake.id}, ${fake.accountId}, 'staff', ${staffNote})`);
  queries.push(sql`
    INSERT INTO activity_log (actor_account_id, actor_role, actor_name, action, entity_type, entity_id, detail, source, account_id)
    VALUES (NULL, 'manager', ${BY}, 'update', 'account', ${fake.accountId}, ${`Check-in #${fake.id}: ${staffNote}`}, 'admin', ${fake.accountId})
  `);
  lines.push("");
}

/* ---------- EMCOR off the "stop emails" list ---------- */

const [out] = await sql`SELECT account_id, email, opted_out_at FROM customer_checkin_optouts WHERE account_id = ${UNSTOP.accountId}`;
lines.push(`"Stop emails" list: ${UNSTOP.name}`);
if (!out) {
  lines.push("  Not on the list. Nothing to do.");
} else {
  lines.push(`  On the list since ${when(out.opted_out_at)} (${out.email || "no email"})  →  taken off (check-ins can be sent again, only when someone presses Send)`);
  queries.push(sql`DELETE FROM customer_checkin_optouts WHERE account_id = ${UNSTOP.accountId}`);
  const note = `Taken off the "stop emails" list: an email security scanner pressed "Stop these emails" (${when(out.opted_out_at)}), not the customer.`;
  lines.push(`  New History line on #${UNSTOP.checkinId}: "Staff: ${note}"`);
  queries.push(sql`INSERT INTO customer_checkin_events (checkin_id, account_id, kind, note) VALUES (${UNSTOP.checkinId}, ${UNSTOP.accountId}, 'staff', ${note})`);
  queries.push(sql`
    INSERT INTO activity_log (actor_account_id, actor_role, actor_name, action, entity_type, entity_id, detail, source, account_id)
    VALUES (NULL, 'manager', ${BY}, 'update', 'account', ${UNSTOP.accountId}, ${note}, 'admin', ${UNSTOP.accountId})
  `);
}
lines.push("");

/* ---------- the complaint made from #18 ---------- */

const [c] = await sql`SELECT id::int, complaint_id, account_name, account_ref, status, complaint_validity, priority, sub_at_filing, notes, resolution_note FROM complaints WHERE complaint_id = ${COMPLAINT.id}`;
lines.push(`Complaint ${COMPLAINT.id}`);
if (!c) {
  problems.push(`${COMPLAINT.id}: not found.`);
} else if (c.status === COMPLAINT.status.to && c.complaint_validity === COMPLAINT.validity.to) {
  lines.push("  Already Closed and Not Valid. Nothing to do.");
} else {
  if (!String(c.notes ?? "").includes(`From customer check-in #${COMPLAINT.fromCheckin}`)) problems.push(`${COMPLAINT.id}: its notes do not say it came from check-in #${COMPLAINT.fromCheckin}.`);
  if (c.status !== COMPLAINT.status.from) problems.push(`${COMPLAINT.id}: status is ${show(c.status)}, not ${show(COMPLAINT.status.from)} as approved.`);
  if (c.complaint_validity !== COMPLAINT.validity.from) problems.push(`${COMPLAINT.id}: validity is ${show(c.complaint_validity)}, not ${show(COMPLAINT.validity.from)} as approved.`);
  lines.push(`  ${c.account_name} · ${c.priority} · team at filing: ${c.sub_at_filing || "(none)"}`);
  lines.push(`  Status:     ${show(c.status)}  →  ${show(COMPLAINT.status.to)}`);
  lines.push(`  Validity:   ${show(c.complaint_validity)}  →  ${show(COMPLAINT.validity.to)}  (counts 0 on the team's score and on At risk)`);
  lines.push(`  Resolution: ${show(c.resolution_note)}  →  ${show(COMPLAINT.note)}`);
  lines.push(`  Notes: unchanged. No email to the customer or the team.`);
  const stamp = newYorkStamp();
  queries.push(sql`
    UPDATE complaints
       SET status = ${COMPLAINT.status.to}, complaint_validity = ${COMPLAINT.validity.to}, resolution_note = ${COMPLAINT.note},
           updated_at_raw = ${stamp}, complaint_updated_at = now(), updated_at = now()
     WHERE id = ${c.id} AND status = ${COMPLAINT.status.from} AND complaint_validity = ${COMPLAINT.validity.from}
  `);
  queries.push(sql`
    INSERT INTO activity_log (actor_account_id, actor_role, actor_name, action, entity_type, entity_id, detail, source, account_id)
    VALUES (NULL, 'manager', ${BY}, 'update', 'complaint', ${COMPLAINT.id},
            ${`Complaint edited: Status: ${COMPLAINT.status.from} → ${COMPLAINT.status.to}; Validity: ${COMPLAINT.validity.from} → ${COMPLAINT.validity.to}; Resolution: (blank) → ${COMPLAINT.note}`},
            'admin', ${c.account_ref || null})
  `);
}

console.log(lines.join("\n"));
console.log("");

if (problems.length) {
  console.log("NOT SAVED. Something is not as approved:");
  for (const problem of problems) console.log(`  - ${problem}`);
  process.exit(1);
}
if (queries.length === 0) {
  console.log("Nothing to change: it is all done already.");
  process.exit(0);
}
if (!apply) {
  console.log(`Dry run: ${queries.length} change(s) above would be saved. Nothing was saved.`);
  console.log("To save: make a backup branch in Neon, then run again with --apply --backup-done");
  process.exit(0);
}

await sql.transaction(queries);
console.log(`Saved ${queries.length} change(s) in one transaction.\n`);

// Read back.
for (const fake of FAKE) {
  const [row] = await sql`SELECT answer, answered_at FROM customer_checkins WHERE id = ${fake.id}`;
  const [n] = await sql`SELECT count(*)::int AS n, count(*) FILTER (WHERE scanner)::int AS s FROM customer_checkin_events WHERE checkin_id = ${fake.id}`;
  console.log(`#${fake.id} ${fake.name}: answer ${row.answer === "" ? "No answer yet" : show(row.answer)} · History ${n.n} line(s), ${n.s} marked scanner`);
}
const [still] = await sql`SELECT count(*)::int AS n FROM customer_checkin_optouts WHERE account_id = ${UNSTOP.accountId}`;
console.log(`${UNSTOP.name} on the "stop emails" list: ${still.n ? "yes" : "no"}`);
const [after] = await sql`SELECT status, complaint_validity FROM complaints WHERE complaint_id = ${COMPLAINT.id}`;
console.log(`${COMPLAINT.id}: ${after?.status} · ${after?.complaint_validity}`);
