// What happened to each complaint (complaint_events, migration 075): one row
// per event, shown on the Complaint Detail page. Server only.
//
// Before migration 075 runs nothing is written and the lists are empty: a
// complaint and its notices work the same, only the record is missing.

import { getSql } from "@/lib/db";

export type ComplaintEventKind = "sub_notified" | "customer_added" | "merged_into" | "merged_from" | "response_alert" | "acknowledged" | "fixed" | "customer_emailed" | "customer_fix" | "customer_visibility" | "review_notified";

export type ComplaintEvent = {
  id: number;
  kind: ComplaintEventKind | string;
  channel: string;
  status: string;
  detail: string;
  /** Picture links the event brought (comma-separated in the table). */
  photos: string[];
  by: string;
  at: string;
};

let readyCache = false;

export async function complaintEventsReady(): Promise<boolean> {
  if (readyCache) return true;
  try {
    const rows = (await getSql()`SELECT to_regclass('public.complaint_events') IS NOT NULL AS ok`) as { ok: boolean }[];
    readyCache = rows[0]?.ok === true;
  } catch {
    readyCache = false;
  }
  return readyCache;
}

/** The internal number of a complaint (complaints.id) from its Complaint ID, internal key or row number. Null when none. */
export async function complaintRowId(key: string): Promise<number | null> {
  const wanted = String(key ?? "").trim();
  if (!wanted) return null;
  const rows = (await getSql().query(
    `SELECT id FROM complaints
     WHERE btrim(complaint_id) = $1::text OR legacy_key = $1::text OR sheet_row::text = $1::text
     ORDER BY (btrim(complaint_id) = $1::text) DESC, (legacy_key = $1::text) DESC, sheet_row
     LIMIT 1`,
    [wanted]
  )) as { id: number | string }[];
  return rows[0] ? Number(rows[0].id) : null;
}

/** Writes one event. Never throws: a missing record must not undo what it describes. */
export async function addComplaintEvent(input: {
  complaintId: number;
  kind: ComplaintEventKind;
  channel?: string;
  status?: string;
  detail?: string;
  photos?: string[];
  by?: string;
}): Promise<void> {
  try {
    if (!(await complaintEventsReady())) return;
    await getSql().query(
      `INSERT INTO complaint_events (complaint_id, kind, channel, status, detail, photos, by_name) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [input.complaintId, input.kind, input.channel ?? "", input.status ?? "", (input.detail ?? "").slice(0, 4000), (input.photos ?? []).join(", "), input.by ?? "System"]
    );
  } catch (error) {
    console.error("[complaint events] not written:", error instanceof Error ? error.message : error);
  }
}

/** A complaint's events, newest first. Empty before migration 075. */
export async function listComplaintEvents(complaintId: number, kinds?: ComplaintEventKind[]): Promise<ComplaintEvent[]> {
  if (!(await complaintEventsReady())) return [];
  const rows = (await getSql().query(
    `SELECT id, kind, channel, status, detail, photos, by_name, created_at FROM complaint_events
     WHERE complaint_id = $1 AND ($2::text[] IS NULL OR kind = ANY($2::text[]))
     ORDER BY created_at DESC, id DESC LIMIT 200`,
    [complaintId, kinds && kinds.length > 0 ? kinds : null]
  )) as { id: number | string; kind: string; channel: string; status: string; detail: string; photos: string; by_name: string; created_at: string | Date }[];
  return rows.map((row) => ({
    id: Number(row.id),
    kind: row.kind,
    channel: row.channel,
    status: row.status,
    detail: row.detail,
    photos: row.photos ? row.photos.split(",").map((link) => link.trim()).filter(Boolean) : [],
    by: row.by_name,
    at: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
  }));
}
