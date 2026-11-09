// Two ways one problem stays one complaint (server only):
//   - the customer adds notes / photos to their open portal complaint
//     instead of sending a new one (no new complaint, no new score hit);
//   - staff merge a complaint into another one on the same account: its text
//     and photos are added to the main one, and it is closed as "Merged"
//     (a Merged complaint never counts: lib/googleSheets.ts, account-risk,
//     sub-score-alerts, the Pin Board).
// Each is written to complaint_events (migration 075) on the complaint(s).

import { getSql } from "@/lib/db";
import { PORTAL_COMPLAINT_REPORTED_BY } from "@/lib/pg/customer-portal";
import { addComplaintEvent, complaintRowId } from "@/lib/pg/complaint-events";
import { complaintPhotoMap } from "@/lib/pg/complaint-detail";
import { forgetRiskCache } from "@/lib/pg/account-risk";
import { newYorkStampText } from "@/lib/portalPhotos";

/** Still open: not Closed, Resolved (incl. "Resolved by Sub") or Merged. `col` is the status column. */
export const complaintOpenSql = (col: string) =>
  `(lower(btrim(${col})) NOT LIKE 'closed%' AND lower(btrim(${col})) NOT LIKE 'resolved%' AND lower(btrim(${col})) NOT LIKE 'merged%')`;

const clean = (value: unknown) => String(value ?? "").trim();

// "Quality Issue: the floor…" -> "the floor…" (the kind the portal puts in front).
const KIND_PREFIX = /^(Missed Cleaning|Quality Issue|Staff Conduct|Damaged Property|Communication Issue|Other):\s*/i;

export type OpenPortalComplaint = { key: string; day: string; text: string };

/** The newest complaint this customer sent from the portal for this account that is still open, or null. */
export async function openPortalComplaint(accountId: string): Promise<OpenPortalComplaint | null> {
  if (!clean(accountId)) return null;
  const rows = (await getSql().query(
    `SELECT btrim(complaint_id) AS complaint_id, sheet_row, complaint_date::text AS day, issue
     FROM complaints
     WHERE account_ref = $1 AND reported_by = $2 AND ${complaintOpenSql("status")}
     ORDER BY created_at DESC, sheet_row DESC LIMIT 1`,
    [clean(accountId), PORTAL_COMPLAINT_REPORTED_BY]
  )) as { complaint_id: string; sheet_row: number; day: string | null; issue: string }[];
  const row = rows[0];
  if (!row) return null;
  // Only what the customer first wrote (additions are listed after it).
  const first = row.issue.split(/\n\n(?:Added by the customer|Merged from complaint)/)[0];
  return { key: row.complaint_id || String(row.sheet_row), day: row.day ?? "", text: first.replace(KIND_PREFIX, "").slice(0, 300) };
}

/**
 * The customer's addition to their open complaint: the note goes at the end
 * of the description (with the date and time), the photos on a "Photos:"
 * line of the notes (where the Complaint Detail page and the sub portal find
 * them). Only their own, open, portal complaint. Returns the complaint's ID.
 */
export async function addToPortalComplaint(input: { accountId: string; key: string; note: string; photos: string[] }): Promise<{ complaintId: string; accountName: string }> {
  const rowId = await complaintRowId(input.key);
  if (rowId === null) throw new Error("Complaint not found.");
  const sql = getSql();
  const rows = (await sql.query(
    `SELECT id, btrim(complaint_id) AS complaint_id, sheet_row, account_name FROM complaints
     WHERE id = $1 AND account_ref = $2 AND reported_by = $3 AND ${complaintOpenSql("status")}`,
    [rowId, clean(input.accountId), PORTAL_COMPLAINT_REPORTED_BY]
  )) as { id: number; complaint_id: string; sheet_row: number; account_name: string }[];
  if (!rows[0]) throw new Error("This complaint is closed or is not yours.");

  const note = clean(input.note).slice(0, 4000);
  const photos = input.photos.filter(Boolean);
  if (!note && photos.length === 0) throw new Error("Nothing to add.");
  const stamp = newYorkStampText();
  const addition = `Added by the customer (${stamp}): ${note || `${photos.length} more photo${photos.length === 1 ? "" : "s"}.`}`;

  await sql.query(
    `UPDATE complaints SET
       issue = CASE WHEN btrim(issue) = '' THEN $2::text ELSE issue || E'\\n\\n' || $2::text END,
       notes = CASE WHEN $3::text = '' THEN notes WHEN btrim(notes) = '' THEN 'Photos: ' || $3::text ELSE notes || E'\\nPhotos: ' || $3::text END,
       updated_at = now()
     WHERE id = $1`,
    [rowId, addition, photos.join(", ")]
  );
  await addComplaintEvent({ complaintId: rowId, kind: "customer_added", detail: note, photos, by: "Customer" });
  return { complaintId: rows[0].complaint_id || String(rows[0].sheet_row), accountName: rows[0].account_name };
}

type MergeRow = {
  id: number;
  complaint_id: string;
  sheet_row: number;
  account_ref: string | null;
  account_name: string;
  issue: string;
  notes: string;
  status: string;
  day: string | null;
};

/** The other open complaints on the same account, newest first: what this one can be merged into. */
export async function mergeTargets(key: string): Promise<{ key: string; day: string; text: string; status: string }[]> {
  const rowId = await complaintRowId(key);
  if (rowId === null) return [];
  const rows = (await getSql().query(
    `SELECT btrim(o.complaint_id) AS complaint_id, o.sheet_row, o.complaint_date::text AS day, o.issue, o.status
     FROM complaints c
     JOIN complaints o ON o.id <> c.id
       AND (CASE WHEN c.account_ref IS NOT NULL THEN o.account_ref = c.account_ref
                 ELSE o.account_ref IS NULL AND lower(btrim(o.account_name)) = lower(btrim(c.account_name)) AND btrim(c.account_name) <> '' END)
     WHERE c.id = $1 AND lower(btrim(o.status)) NOT LIKE 'merged%'
     ORDER BY o.created_at DESC, o.sheet_row DESC LIMIT 30`,
    [rowId]
  )) as { complaint_id: string; sheet_row: number; day: string | null; issue: string; status: string }[];
  return rows.map((row) => ({ key: row.complaint_id || String(row.sheet_row), day: row.day ?? "", text: row.issue.slice(0, 200), status: row.status }));
}

/**
 * Merges `fromKey` into `intoKey` (same account only): the text and photos of
 * the one merged are added to the main one, and it is closed as "Merged".
 * Both changes are saved together. Returns the main complaint's key.
 */
export async function mergeComplaints(input: { fromKey: string; intoKey: string; by: string }): Promise<{ intoKey: string; fromId: string; intoId: string }> {
  const [fromRowId, intoRowId] = await Promise.all([complaintRowId(input.fromKey), complaintRowId(input.intoKey)]);
  if (fromRowId === null || intoRowId === null) throw new Error("Complaint not found.");
  if (fromRowId === intoRowId) throw new Error("Pick a different complaint to merge into.");

  const sql = getSql();
  const rows = (await sql.query(
    `SELECT id, btrim(complaint_id) AS complaint_id, sheet_row, account_ref, account_name, issue, notes, status, complaint_date::text AS day
     FROM complaints WHERE id = ANY($1::bigint[])`,
    [[fromRowId, intoRowId]]
  )) as MergeRow[];
  const from = rows.find((row) => Number(row.id) === fromRowId);
  const into = rows.find((row) => Number(row.id) === intoRowId);
  if (!from || !into) throw new Error("Complaint not found.");

  const sameAccount = from.account_ref
    ? from.account_ref === into.account_ref
    : !into.account_ref && clean(from.account_name) !== "" && clean(from.account_name).toLowerCase() === clean(into.account_name).toLowerCase();
  if (!sameAccount) throw new Error("Only complaints on the same account can be merged.");
  if (/^merged/i.test(clean(from.status))) throw new Error("This complaint was already merged.");
  if (/^merged/i.test(clean(into.status))) throw new Error("That complaint was merged into another one. Pick the main one.");

  const fromId = from.complaint_id || String(from.sheet_row);
  const intoId = into.complaint_id || String(into.sheet_row);
  const photoMap = await complaintPhotoMap([{ id: fromId, notes: from.notes }]);
  const photos = photoMap.get(fromId) ?? [];
  const stamp = newYorkStampText();
  const moved = `Merged from complaint ${fromId}${from.day ? ` (${from.day})` : ""}: ${clean(from.issue) || "(no description)"}`;

  await sql.transaction([
    sql.query(
      `UPDATE complaints SET
         issue = CASE WHEN btrim(issue) = '' THEN $2::text ELSE issue || E'\\n\\n' || $2::text END,
         notes = CASE WHEN $3::text = '' THEN notes WHEN btrim(notes) = '' THEN 'Photos: ' || $3::text ELSE notes || E'\\nPhotos: ' || $3::text END,
         updated_at = now()
       WHERE id = $1`,
      [intoRowId, moved, photos.join(", ")]
    ),
    sql.query(
      `UPDATE complaints SET
         status = 'Merged',
         notes = CASE WHEN btrim(notes) = '' THEN $2::text ELSE notes || E'\\n' || $2::text END,
         updated_at = now()
       WHERE id = $1`,
      [fromRowId, `Merged into complaint ${intoId} by ${input.by} on ${stamp}.`]
    ),
  ]);

  await addComplaintEvent({ complaintId: fromRowId, kind: "merged_into", detail: `Merged into complaint ${intoId}.`, by: input.by });
  await addComplaintEvent({ complaintId: intoRowId, kind: "merged_from", detail: `Complaint ${fromId} was merged into this one.`, photos, by: input.by });
  forgetRiskCache();
  return { intoKey: intoId, fromId, intoId };
}
