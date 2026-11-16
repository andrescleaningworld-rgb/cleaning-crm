// The extra facts the printed "Complaint Review" needs for each complaint
// (app/components/complaint-review-print.tsx), read for many at once. Read
// only, no new tables: the address from accounts, the photos from
// complaintPhotoMap (the same pictures the complaint page shows), and when it
// was fixed from the 5-step tracker (complaintTracks). Server only.
//
// What goes on paper is handed to the sub, so this returns only what the
// printout shows: never notes, money, or score.

import { getSql } from "@/lib/db";
import { complaintPhotoMap } from "@/lib/pg/complaint-detail";
import { complaintTracks, TRACK_COLUMNS, type TrackRow } from "@/lib/pg/complaint-track";

export type ComplaintReviewFacts = {
  /** When it was entered in the app (ISO). */
  createdAt: string;
  /** The account's address ("" when unknown). */
  address: string;
  /** Picture links of the complaint itself (not the after photos). */
  photos: string[];
  /** When it was fixed (ISO): the office's close, or the team's "Resolved by Sub" while that waits for review. "" = not yet. */
  resolvedAt: string;
};

const text = (value: unknown) => String(value ?? "").trim();
const isoOf = (value: string | Date | null | undefined) => {
  if (!value) return "";
  const day = value instanceof Date ? value : new Date(value);
  return Number.isNaN(day.getTime()) ? "" : day.toISOString();
};

/** The facts of each complaint, by the key it was asked for (its Complaint ID, or its row number when it has none). */
export async function complaintReviewFacts(keys: string[]): Promise<Record<string, ComplaintReviewFacts>> {
  const wanted = [...new Set(keys.map(text).filter(Boolean))];
  const out: Record<string, ComplaintReviewFacts> = {};
  if (wanted.length === 0) return out;
  const sql = getSql();

  const rows = (await sql.query(
    `SELECT ${TRACK_COLUMNS}, account_ref, notes FROM complaints
     WHERE btrim(complaint_id) = ANY($1::text[]) OR sheet_row::text = ANY($1::text[])`,
    [wanted]
  )) as (TrackRow & { account_ref: string | null; notes: string })[];
  if (rows.length === 0) return out;

  const accountIds = [...new Set(rows.map((r) => text(r.account_ref)).filter(Boolean))];
  const [addressRows, photoMap, tracks] = await Promise.all([
    accountIds.length > 0
      ? (sql.query(`SELECT id, address FROM accounts WHERE id = ANY($1::text[])`, [accountIds]) as unknown as Promise<{ id: string; address: string }[]>)
      : Promise.resolve([] as { id: string; address: string }[]),
    complaintPhotoMap(rows.map((r) => ({ id: text(r.complaint_id), notes: r.notes ?? "" }))),
    complaintTracks(rows),
  ]);
  const addresses = new Map(addressRows.map((a) => [text(a.id), text(a.address)]));

  for (const r of rows) {
    const view = tracks.get(Number(r.id))?.view ?? null;
    // at = [received, sent, team on it, ready to review, fixed].
    const resolvedAt = view ? (view.index === 4 ? view.at[4] : view.index === 3 ? view.at[3] : "") : "";
    const facts: ComplaintReviewFacts = {
      createdAt: isoOf(r.created_at),
      address: addresses.get(text(r.account_ref)) ?? "",
      photos: photoMap.get(text(r.complaint_id)) ?? [],
      resolvedAt: resolvedAt || "",
    };
    const id = text(r.complaint_id);
    if (id && wanted.includes(id)) out[id] = facts;
    if (wanted.includes(String(r.sheet_row))) out[String(r.sheet_row)] = facts;
  }
  return out;
}
