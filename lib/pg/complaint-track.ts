// The facts behind each complaint's 5-step tracker (lib/complaintSteps.ts),
// read for many complaints at once: the complaint's events (migration 075),
// its pin's "Waiting on team" history and the staff edit log. Each read
// stands alone: one that fails (a table not there yet) just gives fewer
// facts, never an error. Also what the customer is shown once it is fixed
// (the office's "Close & send to customer"), and whether the customer sees
// the complaint at all. Server only.
//
// Who sees it: every complaint on the account shows on the customer's portal,
// the ones they sent from the portal and the ones the office typed in (a
// call, an email…), so they see we are taking care of it. The "Customer sees
// this" switch (Add Complaint form, complaint page) turns one off, e.g. an
// inspection finding. The latest switch change wins; nothing is stored for
// the default, so complaints already in the database keep their data.

import { getSql } from "@/lib/db";
import { complaintTrackView, type ComplaintTrackView } from "@/lib/complaintSteps";

/** The complaint columns the tracker needs (to_jsonb: columns from later migrations never break the read). */
export const TRACK_COLUMNS = `id, btrim(complaint_id) AS complaint_id, legacy_key, sheet_row, status, created_at, assigned_to,
  to_jsonb(complaints)->>'sub_at_filing' AS sub_at_filing, complaint_updated_at, reported_by`;

export type TrackRow = {
  id: number | string;
  complaint_id: string;
  legacy_key: string;
  sheet_row: number;
  status: string;
  created_at: string | Date;
  assigned_to: string;
  sub_at_filing: string | null;
  complaint_updated_at: string | Date | null;
  /** "Customer (portal)" = sent from the portal (shown to the customer by default). Missing = read as staff-entered (hidden). */
  reported_by?: string | null;
};

export type ComplaintTrack = {
  /** null for a merged complaint. */
  view: ComplaintTrackView | null;
  /** Every after photo saved for it (the team's and staff's), newest first. */
  fixPhotos: string[];
  /** What the office sent the customer on "Close & send to customer" (latest), or null when never. */
  customerFix: { note: string; photos: string[]; at: string; editedAt: string } | null;
  /** Not on the customer's portal (and no customer email when closed): "Customer sees this" switched off. */
  hidden: boolean;
};

const text = (value: unknown) => String(value ?? "").trim();
const isoOf = (value: string | Date | null | undefined) => {
  if (!value) return "";
  const day = value instanceof Date ? value : new Date(value);
  return Number.isNaN(day.getTime()) ? "" : day.toISOString();
};
const photoList = (value: unknown) => text(value).split(",").map((url) => url.trim()).filter(Boolean);
const earliest = (a: string, b: string) => (!a ? b : !b ? a : a < b ? a : b);
const latest = (a: string, b: string) => (a > b ? a : b);

/** The tracker of each complaint, by complaints.id. */
export async function complaintTracks(rows: TrackRow[], now = new Date()): Promise<Map<number, ComplaintTrack>> {
  const out = new Map<number, ComplaintTrack>();
  if (rows.length === 0) return out;
  const sql = getSql();
  const keysOf = (r: TrackRow) => [text(r.complaint_id), text(r.legacy_key), String(r.sheet_row)].filter(Boolean);
  const allKeys = [...new Set(rows.flatMap(keysOf))];
  const ids = rows.map((r) => Number(r.id));
  const quiet = <T>(read: Promise<T>, fallback: T, what: string) =>
    read.catch((error) => {
      console.error(`[complaint tracker] ${what} did not load:`, error instanceof Error ? error.message : error);
      return fallback;
    });

  const [events, pinLog, log] = await Promise.all([
    quiet(
      sql.query(
        `SELECT complaint_id, kind, channel, status, detail, photos, created_at FROM complaint_events
         WHERE complaint_id = ANY($1::bigint[]) AND kind IN ('sub_notified', 'acknowledged', 'fixed', 'customer_fix', 'customer_visibility')
         ORDER BY created_at ASC, id ASC`,
        [ids]
      ) as unknown as Promise<{ complaint_id: string | number; kind: string; channel: string; status: string; detail: string; photos: string; created_at: string | Date }[]>,
      [],
      "events"
    ),
    // The pin put on "Waiting on team": the team was told (by phone, in person…).
    quiet(
      sql.query(
        `SELECT item_id, min(at) AS at FROM board_status_log
         WHERE kind = 'complaint' AND event = 'status' AND status = 'waiting_sub' AND item_id = ANY($1::text[])
         GROUP BY item_id`,
        [allKeys]
      ) as unknown as Promise<{ item_id: string; at: string | Date }[]>,
      [],
      "pin history"
    ),
    // Staff edits ("Complaint edited: Status: Open → In Progress; …") and closes (no detail).
    quiet(
      sql.query(
        `SELECT entity_id, detail, created_at FROM activity_log
         WHERE entity_type = 'complaint' AND entity_id = ANY($1::text[]) AND action = 'update'`,
        [allKeys]
      ) as unknown as Promise<{ entity_id: string; detail: string | null; created_at: string | Date }[]>,
      [],
      "history"
    ),
  ]);

  for (const r of rows) {
    const id = Number(r.id);
    const keys = new Set(keysOf(r));
    let sentAt = pinLog.filter((p) => keys.has(p.item_id)).map((p) => isoOf(p.at)).filter(Boolean).sort()[0] ?? "";
    let teamAt = "";
    let reviewAt = "";
    let fixedAt = "";
    for (const entry of log.filter((e) => keys.has(e.entity_id))) {
      const at = isoOf(entry.created_at);
      if (!at) continue;
      const detail = text(entry.detail);
      // "Close complaint" (staff) is logged with no detail.
      if (detail === "") {
        fixedAt = latest(fixedAt, at);
        continue;
      }
      const to = /\bStatus: [^;]*? → ([^;]*)/i.exec(detail)?.[1]?.trim().toLowerCase() ?? "";
      if (to.startsWith("in progress")) teamAt = earliest(teamAt, at);
      else if (to.startsWith("resolved by sub")) reviewAt = latest(reviewAt, at);
      else if (/^(closed|resolved)/.test(to)) fixedAt = latest(fixedAt, at);
    }

    const fixPhotos: string[] = [];
    let customerFix: ComplaintTrack["customerFix"] = null;
    // The default: the customer sees it. The "Customer sees this" switch overrides it.
    let hidden = false;
    let lastFixEvent = "";
    for (const event of events.filter((e) => Number(e.complaint_id) === id)) {
      const at = isoOf(event.created_at);
      if (event.kind === "sub_notified" && event.status === "sent") sentAt = earliest(sentAt, at);
      else if (event.kind === "acknowledged" && /from the sub/i.test(event.detail)) teamAt = earliest(teamAt, at);
      else if (event.kind === "fixed") {
        lastFixEvent = latest(lastFixEvent, at);
        fixPhotos.unshift(...photoList(event.photos));
      } else if (event.kind === "customer_fix") {
        // "Edit what the customer sees" (channel "edit"): new wording and photos; when it was fixed stays.
        const edit = event.channel === "edit";
        customerFix = { note: text(event.detail), photos: photoList(event.photos), at: edit && customerFix ? customerFix.at : at, editedAt: edit ? at : "" };
        if (!edit) fixedAt = latest(fixedAt, at);
      } else if (event.kind === "customer_visibility") hidden = event.channel === "hidden";
    }

    const status = text(r.status).toLowerCase();
    const updated = isoOf(r.complaint_updated_at);
    // The team's "Mark resolved" writes its after photos as a 'fixed' event at that moment.
    if (status.startsWith("resolved by sub")) reviewAt = reviewAt || lastFixEvent || updated;
    if (/^(closed|resolved)/.test(status) && !status.startsWith("resolved by sub")) fixedAt = fixedAt || updated;

    const view = complaintTrackView(
      { status: r.status, createdAt: isoOf(r.created_at), sentAt, teamAt, reviewAt, fixedAt, office: text(r.assigned_to), team: text(r.sub_at_filing) },
      now
    );
    out.set(id, { view, fixPhotos: [...new Set(fixPhotos)], customerFix, hidden });
  }
  return out;
}

/** One complaint's tracker, by complaints.id. Null when it is not there. */
export async function complaintTrackById(rowId: number): Promise<ComplaintTrack | null> {
  const rows = (await getSql().query(`SELECT ${TRACK_COLUMNS} FROM complaints WHERE id = $1`, [rowId])) as TrackRow[];
  if (!rows[0]) return null;
  return (await complaintTracks(rows)).get(Number(rows[0].id)) ?? null;
}
