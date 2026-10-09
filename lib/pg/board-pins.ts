// "Pin to board" from a record's own screen (a to-do, a complaint, a supply
// order, a visit), and the setting that switches it on per record type.
// Postgres only. Nothing here reads or writes Google Sheets or Apps Script.
//
// A pin is a paper (a handoff_items row, like every other paper on the
// board). It points at the record; it never changes it. Unpinning or Done on
// the board changes the paper only.
//
//   to-do, visit   a yellow paper of its own: kind 'note', item_id
//                  "pin-<type>-<record id>"
//   complaint,     the same paper the board pins by itself for that record;
//   supply order   pinning it by hand puts it in the chosen square (and back
//                  up, if it had been taken down)
//
// How the board pins complaints, supply orders, new accounts and extra jobs
// by itself is in lib/pg/board.ts and is not changed by anything here.

import { getSql } from "@/lib/db";
import { PIN_TYPES, readPinTypes, type PinRequest, type PinType, type PinTypes } from "@/lib/boardPins";
import { SUB_ORDER_GROUPS } from "@/lib/pg/board";

/** The settings column comes with migration 024. Until it is applied, the defaults are used and nothing can be saved. */
export async function pinSettingsReady(): Promise<boolean> {
  const sql = getSql();
  const rows = (await sql`
    SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'board_settings' AND column_name = 'pin_types') AS ok
  `) as { ok: boolean }[];
  return rows[0]?.ok === true;
}

export async function getPinTypes(): Promise<PinTypes> {
  const sql = getSql();
  // to_jsonb(row) -> 'pin_types' is simply NULL where the column does not exist yet.
  const rows = (await sql`SELECT to_jsonb(b) -> 'pin_types' AS pin_types FROM board_settings b WHERE b.id = true`) as { pin_types: unknown }[];
  return readPinTypes(rows[0]?.pin_types);
}

export async function savePinTypes(types: PinTypes, by: string): Promise<PinTypes> {
  const clean = readPinTypes(types);
  const sql = getSql();
  await sql`UPDATE board_settings SET pin_types = ${JSON.stringify(clean)}::jsonb, updated_by = ${by}, updated_at = now() WHERE id = true`;
  return clean;
}

const noteItemId = (type: PinType, recordId: string) => `pin-${type}-${recordId}`;

/** Where each kind of record opens. */
function recordHref(type: PinType, recordId: string): string {
  if (type === "visit") return `/visits/${encodeURIComponent(recordId)}`;
  if (type === "todo") return "/to-do";
  return "";
}

// The board's own id for the supply order a line belongs to: the same
// expression as SUB_ORDER_GROUPS in lib/pg/board.ts (keep the two in step).
const ORDER_PAPER_ID = `'sub-' || COALESCE(
  NULLIF(btrim(o.order_group_id), ''),
  md5(o.ordered_on::text || '|' || lower(btrim(COALESCE(NULLIF(btrim(o.subcontractor_email), ''), o.subcontractor))) || '|' || lower(btrim(o.account_name))),
  NULLIF(btrim(o.order_id), ''),
  o.sheet_row::text
)`;

// Putting a paper (back) up in a square: a paper that was taken down comes
// back as new (pinned now, nobody has it); one that is still up only moves.
const REPIN = `
  board_square = EXCLUDED.board_square,
  board_pinned_at = CASE WHEN handoff_items.board_done_at IS NOT NULL OR handoff_items.board_pinned_at IS NULL THEN now() ELSE handoff_items.board_pinned_at END,
  taken_by = CASE WHEN handoff_items.board_done_at IS NOT NULL THEN '' ELSE handoff_items.taken_by END,
  taken_at = CASE WHEN handoff_items.board_done_at IS NOT NULL THEN NULL ELSE handoff_items.taken_at END,
  board_done_at = NULL,
  board_done_by = ''`;

/**
 * Pins one record to the board, in the chosen square ("" = Office). Returns
 * false when the record was not found. The record itself is only read.
 */
export async function pinRecord(request: PinRequest, by: string): Promise<boolean> {
  const sql = getSql();
  const square = request.square.trim();
  const recordId = request.recordId.trim();

  if (request.type === "todo" || request.type === "visit") {
    const one = PIN_TYPES.find((entry) => entry.type === request.type)!.one;
    const data = { notes: "", recordType: request.type, recordId, label: one, href: recordHref(request.type, recordId) };
    await sql.query(
      `INSERT INTO handoff_items (kind, item_id, title, account_id, account_name, manager, step, data, created_by, board_pinned_at, board_square)
       VALUES ('note', $1, $2, $3, $4, '', 'pinned', $5::jsonb, $6, now(), $7)
       ON CONFLICT (kind, item_id) DO UPDATE SET title = EXCLUDED.title, account_id = EXCLUDED.account_id, account_name = EXCLUDED.account_name, ${REPIN}`,
      [noteItemId(request.type, recordId), request.title.trim().slice(0, 300) || one, (request.accountId ?? "").trim(), (request.accountName ?? "").trim(), JSON.stringify(data), by, square]
    );
    return true;
  }

  if (request.type === "complaint") {
    const rows = (await sql.query(
      `INSERT INTO handoff_items (kind, item_id, title, account_id, account_name, manager, step, step_since, data, created_by, board_pinned_at, board_square)
       SELECT 'complaint', t.item_id, c.account_name, COALESCE(c.account_ref, ''), c.account_name, c.assigned_to, 'open', t.since,
              jsonb_build_object('issue', left(c.issue, 300), 'priority', c.priority), c.reported_by, now(), $2
       FROM complaints c
       CROSS JOIN LATERAL (
         SELECT COALESCE(NULLIF(btrim(c.complaint_id), ''), c.legacy_key) AS item_id, COALESCE(c.complaint_date::timestamptz, c.created_at) AS since
       ) t
       WHERE t.item_id = $1
       LIMIT 1
       ON CONFLICT (kind, item_id) DO UPDATE SET ${REPIN}
       RETURNING item_id`,
      [recordId, square]
    )) as unknown[];
    return rows.length > 0;
  }

  if (request.type === "supply") {
    const rows = (await sql.query(
      `INSERT INTO handoff_items (kind, item_id, title, account_id, account_name, manager, step, step_since, data, created_by, board_pinned_at, board_square)
       SELECT 'supply', g.item_id, COALESCE(NULLIF(g.account_name, ''), 'Supply order'), g.account_id, g.account_name, g.manager, 'open', g.since,
              jsonb_build_object('items', left(g.items, 600), 'count', g.lines::text, 'subcontractor', g.subcontractor, 'orderId', g.order_id),
              g.subcontractor, now(), $2
       FROM (${SUB_ORDER_GROUPS}) g
       WHERE g.item_id = (SELECT ${ORDER_PAPER_ID} FROM sub_supply_orders o WHERE btrim(o.order_id) = $1 OR o.sheet_row::text = $1 LIMIT 1)
       ON CONFLICT (kind, item_id) DO UPDATE SET ${REPIN}
       RETURNING item_id`,
      [recordId, square]
    )) as unknown[];
    return rows.length > 0;
  }

  return false;
}

/** Per record type, the ids of the records that are on the board right now (so their button can say "On the board"). */
export async function listPinnedRecords(): Promise<Partial<Record<PinType, string[]>>> {
  const sql = getSql();
  const [notes, complaints, orders] = (await Promise.all([
    sql`
      SELECT data->>'recordType' AS type, data->>'recordId' AS id FROM handoff_items
      WHERE kind = 'note' AND item_id LIKE 'pin-%' AND board_pinned_at IS NOT NULL AND board_done_at IS NULL
    `,
    sql`SELECT item_id AS id FROM handoff_items WHERE kind = 'complaint' AND board_pinned_at IS NOT NULL AND board_done_at IS NULL`,
    sql.query(`
      SELECT COALESCE(NULLIF(btrim(o.order_id), ''), o.sheet_row::text) AS id
      FROM sub_supply_orders o
      JOIN handoff_items h ON h.kind = 'supply' AND h.item_id = ${ORDER_PAPER_ID}
      WHERE h.board_pinned_at IS NOT NULL AND h.board_done_at IS NULL
    `),
  ])) as [{ type: string; id: string }[], { id: string }[], { id: string }[]];
  return {
    todo: notes.filter((row) => row.type === "todo").map((row) => row.id),
    visit: notes.filter((row) => row.type === "visit").map((row) => row.id),
    complaint: complaints.map((row) => row.id),
    supply: orders.map((row) => row.id),
  };
}
