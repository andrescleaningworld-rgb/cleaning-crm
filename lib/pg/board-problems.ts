// Problems on the Pin Board (docs/unification-plan.md, Phase 2). A crew's or a
// sub's problem report gets one yellow paper in the square of the account's
// manager (no manager: the Office box), and that manager gets one text.
//
//   item_id  problem-crew-<hub_issues.id>, problem-sub-<sub_portal_issues.issue_id>
//   Done on the pin    closes the report where it lives
//   Pin back           opens a report that its pin closed
//   Closed elsewhere   the pin comes down by itself
//
// Only reports made after PROBLEMS_START: the old ones never go up. The report
// stays in its own table and on its own page. Server only.

import { getSql } from "@/lib/db";
import { notifyBoardSquare } from "@/lib/pg/board-sms";

/** When this went live. Anything reported earlier is never pinned. */
export const PROBLEMS_START = "2026-11-22T20:19:33Z";

const CREW = "problem-crew-";
const SUB = "problem-sub-";
const PORTAL = "problem-portal-";

/** The customer sees a request's status, so it is only ever changed on Portal Requests. */
export const PORTAL_PIN_MESSAGE = "The customer sees this status. Tap Open full details and set it on Portal Requests. The pin then comes down by itself.";

const clean = (value: unknown) => String(value ?? "").trim();

/** The Staff ID of the account's manager, when they have a square on the board. "" = the Office box. */
const MANAGER_SQUARE = `COALESCE((
  SELECT st.id FROM staff st
  WHERE st.role = 'Manager' AND st.active AND btrim(st.name) <> '' AND lower(btrim(st.name)) <> 'cw'
    AND (st.id = mg.staff_id OR lower(btrim(st.name)) = lower(btrim(COALESCE(NULLIF(btrim(mg.name), ''), a.manager_raw, ''))))
  ORDER BY (st.id = mg.staff_id) DESC NULLS LAST
  LIMIT 1
), '')`;

const NEW_PIN = `
  INSERT INTO handoff_items (kind, item_id, title, account_id, account_name, manager, step, step_since, data, created_by, board_pinned_at, board_square)
  SELECT 'note', p.item_id, p.title, p.account_id, p.account_name, p.manager, 'pinned', p.since,
         jsonb_build_object('notes', left(p.notes, 600), 'label', p.label, 'recordType', 'problem', 'recordId', p.record_id, 'href', p.href, 'forWho', p.manager, 'dueDate', '', 'box', ''),
         p.who, p.since, p.square
  FROM (__SOURCE__) p
  ON CONFLICT (kind, item_id) DO NOTHING
  RETURNING item_id, board_square, title, account_name, data->>'notes' AS notes`;

const CREW_SOURCE = `
  SELECT '${CREW}' || i.id::text AS item_id, i.id::text AS record_id,
         'Crew problem: ' || i.category AS title, 'Crew problem' AS label,
         COALESCE(NULLIF(btrim(i.note_english), ''), i.note, '') AS notes,
         COALESCE(a.id, '') AS account_id, COALESCE(btrim(a.account_name), '') AS account_name,
         COALESCE(NULLIF(btrim(mg.name), ''), btrim(a.manager_raw), '') AS manager,
         COALESCE(NULLIF(btrim(i.reporter_name), ''), 'Crew') AS who, i.created_at AS since,
         CASE WHEN a.id IS NULL THEN '/accounts-center' ELSE '/accounts/' || a.id || CASE WHEN i.site_id IS NULL THEN '' ELSE '?tab=team-hub' END END AS href,
         ${MANAGER_SQUARE} AS square
  FROM hub_issues i
  LEFT JOIN hub_sites hs ON hs.id = i.site_id
  LEFT JOIN accounts a ON a.id = COALESCE(i.crew_link_account_id, hs.account_id)
  LEFT JOIN managers mg ON mg.id = a.manager_id
  WHERE i.status = 'open' AND i.created_at >= '${PROBLEMS_START}'::timestamptz AND (to_jsonb(a)->>'deleted_at') IS NULL`;

const SUB_SOURCE = `
  SELECT '${SUB}' || btrim(i.issue_id) AS item_id, btrim(i.issue_id) AS record_id,
         'Sub problem: ' || COALESCE(NULLIF(btrim(i.issue_type), ''), 'Issue') AS title, 'Sub problem' AS label,
         i.description AS notes,
         COALESCE(a.id, '') AS account_id, COALESCE(NULLIF(btrim(a.account_name), ''), btrim(i.account_name)) AS account_name,
         COALESCE(NULLIF(btrim(mg.name), ''), btrim(a.manager_raw), '') AS manager,
         COALESCE(NULLIF(btrim(i.subcontractor_name), ''), 'Sub') AS who, i.created_at AS since,
         '/notifications' AS href,
         ${MANAGER_SQUARE} AS square
  FROM sub_portal_issues i
  LEFT JOIN accounts a ON a.id = i.account_ref
  LEFT JOIN managers mg ON mg.id = a.manager_id
  WHERE lower(btrim(i.status)) IN ('', 'new') AND btrim(i.issue_id) <> '' AND i.imported_at IS NULL
    AND i.created_at >= '${PROBLEMS_START}'::timestamptz AND (to_jsonb(a)->>'deleted_at') IS NULL`;

// Phase 3: what a customer asks for in the portal (extra cleaning, a date
// change, billing). A portal problem is already a complaint, with its own pin.
const PORTAL_WORDS = `CASE r.tab WHEN 'portal-service-requests' THEN 'Extra cleaning' WHEN 'portal-date-changes' THEN 'Date change' ELSE 'Billing' END`;
const PORTAL_SOURCE = `
  SELECT '${PORTAL}' || r.id::text AS item_id, r.id::text AS record_id,
         'Customer request: ' || ${PORTAL_WORDS} AS title, 'Customer request' AS label,
         concat_ws(' - ', NULLIF(btrim(r.field_1), ''), NULLIF(btrim(r.field_2), ''), NULLIF(btrim(r.field_3), '')) AS notes,
         COALESCE(a.id, '') AS account_id, COALESCE(NULLIF(btrim(a.account_name), ''), btrim(r.account_name)) AS account_name,
         COALESCE(NULLIF(btrim(mg.name), ''), btrim(a.manager_raw), '') AS manager,
         'Customer' AS who, r.created_at AS since,
         '/portal-requests' AS href,
         ${MANAGER_SQUARE} AS square
  FROM portal_requests r
  LEFT JOIN accounts a ON a.id = r.account_ref
  LEFT JOIN managers mg ON mg.id = a.manager_id
  WHERE r.tab IN ('portal-service-requests', 'portal-date-changes', 'portal-billing-requests')
    AND lower(btrim(r.status)) IN ('', 'new', 'in progress') AND r.imported_at IS NULL
    AND r.created_at >= '${PROBLEMS_START}'::timestamptz AND (to_jsonb(a)->>'deleted_at') IS NULL`;

type NewPin = { item_id: string; board_square: string; title: string; account_name: string; notes: string };

let lastRun = 0;
let running: Promise<NewPin[]> | null = null;

async function runSync(): Promise<NewPin[]> {
  const sql = getSql();
  const [crew, sub, portal] = (await Promise.all([
    sql.query(NEW_PIN.replace("__SOURCE__", CREW_SOURCE)),
    sql.query(NEW_PIN.replace("__SOURCE__", SUB_SOURCE)),
    sql.query(NEW_PIN.replace("__SOURCE__", PORTAL_SOURCE)),
  ])) as [NewPin[], NewPin[], NewPin[]];
  // Closed where it lives: the pin comes down.
  await sql.query(`
    UPDATE handoff_items h SET board_done_at = now(), board_done_by = 'Closed in Crew problems'
    FROM hub_issues i
    WHERE h.kind = 'note' AND h.item_id = '${CREW}' || i.id::text AND h.board_pinned_at IS NOT NULL AND h.board_done_at IS NULL AND i.status <> 'open'`);
  await sql.query(`
    UPDATE handoff_items h SET board_done_at = now(), board_done_by = 'Closed in Notifications'
    FROM sub_portal_issues i
    WHERE h.kind = 'note' AND h.item_id = '${SUB}' || btrim(i.issue_id) AND h.board_pinned_at IS NOT NULL AND h.board_done_at IS NULL
      AND lower(btrim(i.status)) NOT IN ('', 'new')`);
  await sql.query(`
    UPDATE handoff_items h SET board_done_at = now(), board_done_by = 'Closed in Portal Requests'
    FROM portal_requests r
    WHERE h.kind = 'note' AND h.item_id = '${PORTAL}' || r.id::text AND h.board_pinned_at IS NOT NULL AND h.board_done_at IS NULL
      AND lower(btrim(r.status)) NOT IN ('', 'new', 'in progress')`);
  return [...crew, ...sub, ...portal];
}

/** Pins what is new and takes down what was closed. At most once every 15 seconds per server. Returns the new papers. */
export async function syncProblems(force = false): Promise<NewPin[]> {
  if (!force && Date.now() - lastRun < 15_000) return [];
  if (running) return [];
  running = runSync().finally(() => {
    lastRun = Date.now();
    running = null;
  });
  return running;
}

/** One text per new paper, to the manager of its square. A paper in a shared box texts nobody. Never throws. */
export async function textNewProblems(pins: NewPin[], origin: string): Promise<void> {
  for (const pin of pins) {
    await notifyBoardSquare({
      square: clean(pin.board_square),
      byStaffId: "",
      paperId: pin.item_id,
      title: clean(pin.title),
      accountName: clean(pin.account_name),
      notes: clean(pin.notes),
      origin,
      routeContext: "board/problem",
    }).catch((error) => console.error("[board problems] text:", error instanceof Error ? error.message : error));
  }
}

async function pinIsUp(itemId: string): Promise<boolean> {
  const rows = (await getSql()`
    SELECT 1 FROM handoff_items WHERE kind = 'note' AND item_id = ${itemId} AND board_pinned_at IS NOT NULL AND board_done_at IS NULL LIMIT 1
  `) as unknown[];
  return rows.length > 0;
}

const markClosedByPin = (itemId: string) => getSql()`UPDATE handoff_items SET data = data || '{"closedByPin":"1"}'::jsonb WHERE kind = 'note' AND item_id = ${itemId}`;

/**
 * Call before a problem's pin comes down as Done: the report is closed where
 * it lives. Returns the words to show when the pin must stay up (a customer
 * request). Throws when the report did not save.
 */
export async function finishProblemOfPin(kind: string, itemId: string): Promise<string | null> {
  if (kind === "note" && itemId.startsWith(PORTAL)) return (await pinIsUp(itemId)) ? PORTAL_PIN_MESSAGE : null;
  if (kind !== "note" || !(itemId.startsWith(CREW) || itemId.startsWith(SUB)) || !(await pinIsUp(itemId))) return null;
  const sql = getSql();
  if (itemId.startsWith(CREW)) {
    const id = Number(itemId.slice(CREW.length));
    if (!Number.isInteger(id)) return null;
    const rows = (await sql`UPDATE hub_issues SET status = 'resolved', resolved_at = now() WHERE id = ${id} AND status = 'open' RETURNING id`) as unknown[];
    if (rows.length > 0) await markClosedByPin(itemId);
    return null;
  }
  const rows = (await sql`
    UPDATE sub_portal_issues SET status = 'Reviewed', updated_at = now()
    WHERE btrim(issue_id) = ${itemId.slice(SUB.length)} AND lower(btrim(status)) IN ('', 'new') RETURNING id
  `) as unknown[];
  if (rows.length > 0) await markClosedByPin(itemId);
  return null;
}

/** Call after Pin back: a report that this pin closed opens again. */
export async function reopenProblemOfPin(kind: string, itemId: string): Promise<void> {
  if (kind !== "note" || !(itemId.startsWith(CREW) || itemId.startsWith(SUB))) return;
  const sql = getSql();
  const marked = (await sql`
    UPDATE handoff_items SET data = data - 'closedByPin' WHERE kind = 'note' AND item_id = ${itemId} AND data->>'closedByPin' = '1' RETURNING item_id
  `) as unknown[];
  if (marked.length === 0) return;
  if (itemId.startsWith(CREW)) {
    const id = Number(itemId.slice(CREW.length));
    if (Number.isInteger(id)) await sql`UPDATE hub_issues SET status = 'open', resolved_at = NULL WHERE id = ${id}`;
    return;
  }
  await sql`UPDATE sub_portal_issues SET status = 'New', updated_at = now() WHERE btrim(issue_id) = ${itemId.slice(SUB.length)} AND status = 'Reviewed'`;
}
