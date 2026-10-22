// The Office Pin Board in Postgres (db/migrations/020_pin_board.sql).
// Postgres only. Nothing here reads or writes Google Sheets or Apps Script.
//
// A paper is a handoff_items row with board_pinned_at set. Papers pin
// themselves: every time the board is read, syncBoard() looks at the open
// complaints, the supply orders still on their way (one paper per order,
// however many items it has), the extra jobs that are set up and not done
// yet (the real ones, from the Extra Jobs page) and the new accounts
// whose Onboarding Checklist is not finished, pins the ones that are not on
// the board yet, and takes down the ones that were closed where they live.
//
// The tables may not exist yet in a database (production does not have them
// until migration 020 is applied there), so every caller first asks
// boardReady() and treats "not ready" as "this feature is off".

import { createHash, randomBytes, randomInt } from "node:crypto";
import { timestampOrNull } from "@/lib/dateUtils";
import { getSql } from "@/lib/db";
import {
  DEFAULT_BOARD_SETTINGS,
  PAPER_KINDS,
  type BoardManager,
  type BoardSettings,
  type Paper,
  type PaperKind,
  type TvLink,
} from "@/lib/board";
import { extraJobsReady } from "@/lib/pg/extra-jobs";
import { notDeleted } from "@/lib/pg/supply-deleted";
import { handoffLive } from "@/lib/pg/account-live";
import { countChecklistProgress, createEmptyChecklistItems, type OnboardingChecklistItems } from "@/lib/onboardingChecklist";
import { doneStepsOf, flowView, isFlowStep } from "@/lib/accountFlow";

let ready: boolean | null = null;
let flowTable: boolean | null = null;

/** Migration 046 is in: new-account papers can show their pizza tracker. Until then the board reads as before. */
async function flowTableReady(): Promise<boolean> {
  if (flowTable === true) return true;
  try {
    const rows = (await getSql()`SELECT to_regclass('public.account_flows') IS NOT NULL AS ok`) as { ok: boolean }[];
    flowTable = rows[0]?.ok === true;
  } catch {
    flowTable = false;
  }
  return flowTable === true;
}

/**
 * The feature switch. FEATURE_PIN_BOARD=1 turns the board on,
 * FEATURE_PIN_BOARD=0 turns it off. Unset: OFF on Production (the board
 * stays hidden there until it is turned on), ON in local dev and on Vercel
 * previews, which run on the practice database.
 */
export function boardFlagOn(): boolean {
  const flag = (process.env.FEATURE_PIN_BOARD ?? "").trim();
  if (flag === "1") return true;
  if (flag === "0") return false;
  if (process.env.NODE_ENV !== "production") return true;
  return process.env.VERCEL_ENV === "preview" || process.env.VERCEL_ENV === "development";
}

export async function boardReady(): Promise<boolean> {
  if (!boardFlagOn()) return false;
  if (ready === true) return true;
  try {
    const sql = getSql();
    const rows = (await sql`SELECT to_regclass('public.board_settings') IS NOT NULL AS ok`) as { ok: boolean }[];
    ready = rows[0]?.ok === true;
  } catch {
    ready = false;
  }
  return ready === true;
}

const iso = (value: string | Date | null | undefined) => (value ? new Date(value).toISOString() : "");
const clean = (value: unknown) => String(value ?? "").trim();
const BOARD_KINDS_SQL = PAPER_KINDS.map((kind) => `'${kind}'`).join(", ");

/* ---------- the managers' squares ---------- */

/** One square per active manager in Staff. "CW" is the company, not a person, and never gets a square. */
export async function listBoardManagers(): Promise<BoardManager[]> {
  const sql = getSql();
  const rows = (await sql`
    SELECT id, name FROM staff
    WHERE role = 'Manager' AND active AND btrim(name) <> '' AND lower(btrim(name)) <> 'cw'
    ORDER BY lower(name)
  `) as { id: string; name: string }[];
  return rows.map((row) => ({ id: row.id, name: row.name.trim() }));
}

/* ---------- papers pin themselves ---------- */

function checklistItems(value: unknown): OnboardingChecklistItems {
  const items = createEmptyChecklistItems();
  if (value && typeof value === "object") {
    for (const [key, entry] of Object.entries(value as Record<string, { checked?: unknown }>)) {
      if (items[key] && entry && typeof entry === "object") items[key] = { ...items[key], checked: entry.checked === true };
    }
  }
  return items;
}

async function insertPaper(input: {
  kind: PaperKind;
  itemId: string;
  title: string;
  accountId?: string;
  accountName?: string;
  manager?: string;
  step: string;
  since?: string | Date | null;
  data?: Record<string, string>;
  createdBy?: string;
  square?: string;
}): Promise<boolean> {
  const sql = getSql();
  const since = timestampOrNull(input.since);
  const inserted = (await sql.query(
    `INSERT INTO handoff_items (kind, item_id, title, account_id, account_name, manager, step, step_since, data, created_by, board_pinned_at, board_square)
     VALUES ($1, $2, $3, $4, $5, $6, $7, COALESCE($8::timestamptz, now()), $9::jsonb, $10, COALESCE($8::timestamptz, now()), $11)
     ON CONFLICT (kind, item_id) DO NOTHING
     RETURNING item_id`,
    [
      input.kind,
      input.itemId,
      input.title.slice(0, 300),
      input.accountId ?? "",
      input.accountName ?? "",
      input.manager ?? "",
      input.step,
      since,
      JSON.stringify(input.data ?? {}),
      input.createdBy ?? "",
      input.square ?? "",
    ]
  )) as { item_id: string }[];
  return inserted.length > 0;
}

let lastSync = 0;
let syncing: Promise<void> | null = null;

/**
 * Lines the board up with the records it mirrors. Safe to call on every
 * read: it only adds papers that are missing and takes down papers whose
 * record was closed. A paper someone unpinned by hand is never pinned again.
 * At most once every 15 seconds per server instance.
 */
export async function syncBoard(force = false): Promise<void> {
  if (!force && Date.now() - lastSync < 15_000) return;
  if (syncing) return syncing;
  syncing = runSync()
    .then(() => {
      lastSync = Date.now();
    })
    .finally(() => {
      syncing = null;
    });
  return syncing;
}

async function runSync(): Promise<void> {
  const sql = getSql();

  // 1. An accepted estimate the handoff lists already track (added from
  //    Accounts) goes up on the board too.
  await sql`
    UPDATE handoff_items SET board_pinned_at = created_at
    WHERE board_pinned_at IS NULL AND done_at IS NULL AND kind = 'account'
  `;

  // 2. (Retired, migration 051.) The old 7-step system pinned a "New account"
  //    paper for every unfinished Onboarding Checklist. New accounts now come
  //    from the 8-step flow, which pins its own paper (lib/pg/account-flow.ts).

  // 3. Complaints that are still open.
  await sql`
    INSERT INTO handoff_items (kind, item_id, title, account_id, account_name, manager, step, step_since, data, created_by, board_pinned_at)
    SELECT 'complaint', t.item_id, c.account_name, COALESCE(c.account_ref, ''), c.account_name, c.assigned_to, 'open', t.since,
           jsonb_build_object('issue', left(c.issue, 300), 'priority', c.priority), c.reported_by, t.since
    FROM complaints c
    CROSS JOIN LATERAL (
      SELECT COALESCE(NULLIF(btrim(c.complaint_id), ''), c.legacy_key) AS item_id,
             COALESCE(c.complaint_date::timestamptz, c.created_at) AS since
    ) t
    WHERE lower(btrim(c.status)) NOT LIKE 'closed%' AND lower(btrim(c.status)) NOT LIKE 'resolved%'
    ON CONFLICT (kind, item_id) DO NOTHING
  `;

  // 4. Supply orders a sub placed in the portal: one paper per order (the
  //    lines that share an Order Group ID), up while any line is on its way.
  await sql.query(`
    INSERT INTO handoff_items (kind, item_id, title, account_id, account_name, manager, step, step_since, data, created_by, board_pinned_at)
    SELECT 'supply', g.item_id, COALESCE(NULLIF(g.account_name, ''), 'Supply order'), g.account_id, g.account_name, g.manager, 'open', g.since,
           jsonb_build_object('items', left(g.items, 600), 'count', g.lines::text, 'subcontractor', g.subcontractor, 'orderId', g.order_id),
           g.subcontractor, g.since
    FROM (${await subOrderGroups()}) g
    WHERE g.open
    ON CONFLICT (kind, item_id) DO NOTHING
  `);

  //    An order that got more lines shows the new count; one the board took
  //    down by itself goes back up if a line is open again.
  await sql.query(`
    UPDATE handoff_items h SET
      data = h.data || jsonb_build_object('items', left(g.items, 600), 'count', g.lines::text),
      board_done_at = CASE WHEN h.board_done_by = 'Closed in Supply Orders' THEN NULL ELSE h.board_done_at END,
      board_done_by = CASE WHEN h.board_done_by = 'Closed in Supply Orders' THEN '' ELSE h.board_done_by END
    FROM (${await subOrderGroups()}) g
    WHERE h.kind = 'supply' AND h.item_id = g.item_id AND g.open
      AND (h.data->>'count' IS DISTINCT FROM g.lines::text OR h.board_done_by = 'Closed in Supply Orders')
  `);

  // 5. Supply orders a crew placed from the Crew Link or the Team Hub.
  const crewNotDeleted = await notDeleted("o");
  await sql.query(`
    INSERT INTO handoff_items (kind, item_id, title, account_id, account_name, manager, step, step_since, data, created_by, board_pinned_at)
    SELECT 'supply', 'crew-' || o.id::text, COALESCE(NULLIF(btrim(a.account_name), ''), 'Supply order'),
           COALESCE(o.crew_link_account_id, s.account_id, ''), COALESCE(btrim(a.account_name), ''),
           COALESCE(NULLIF(btrim(m.name), ''), a.manager_raw, ''), 'open', o.created_at,
           jsonb_build_object(
             'items', left(COALESCE(l.items, ''), 600), 'count', COALESCE(l.lines, 0)::text,
             'subcontractor', COALESCE(o.reporter_name, ''), 'source', 'crew'
           ),
           COALESCE(o.reporter_name, ''), o.created_at
    FROM supply_orders o
    LEFT JOIN hub_sites s ON s.id = o.site_id
    LEFT JOIN accounts a ON a.id = COALESCE(o.crew_link_account_id, s.account_id)
    LEFT JOIN managers m ON m.id = a.manager_id
    LEFT JOIN LATERAL (
      SELECT count(*) AS lines, string_agg(sl.qty::text || ' ' || si.name, ', ' ORDER BY si.name) AS items
      FROM supply_order_lines sl JOIN supply_items si ON si.id = sl.item_id WHERE sl.order_id = o.id
    ) l ON true
    WHERE o.status IN ('new', 'ordered') AND ${crewNotDeleted} AND (to_jsonb(a)->>'deleted_at') IS NULL
    ON CONFLICT (kind, item_id) DO NOTHING
  `);

  // 6. Take down what was finished where it lives. "Closed there" is who.
  //    A new account in the 8-step flow (data.flow) is not done when its
  //    checklist is: it comes down when it goes live (lib/pg/account-flow.ts).
  await sql`
    UPDATE handoff_items h SET board_done_at = now(), board_done_by = 'Checklist finished'
    WHERE h.kind = 'account' AND h.board_pinned_at IS NOT NULL AND h.board_done_at IS NULL
      AND COALESCE(h.data->>'flow', '') = ''
      AND (h.done_at IS NOT NULL OR EXISTS (SELECT 1 FROM onboarding_checklists c WHERE c.account_id = h.item_id AND c.completed_at IS NOT NULL))
  `;
  await sql`
    UPDATE handoff_items h SET board_done_at = now(), board_done_by = 'Closed in Complaints'
    WHERE h.kind = 'complaint' AND h.board_pinned_at IS NOT NULL AND h.board_done_at IS NULL
      AND NOT EXISTS (
        SELECT 1 FROM complaints c
        WHERE COALESCE(NULLIF(btrim(c.complaint_id), ''), c.legacy_key) = h.item_id
          AND lower(btrim(c.status)) NOT LIKE 'closed%' AND lower(btrim(c.status)) NOT LIKE 'resolved%'
      )
  `;
  await sql.query(`
    UPDATE handoff_items h SET board_done_at = now(), board_done_by = 'Closed in Supply Orders'
    WHERE h.kind = 'supply' AND h.board_pinned_at IS NOT NULL AND h.board_done_at IS NULL
      AND (
        (h.item_id LIKE 'crew-%' AND NOT EXISTS (SELECT 1 FROM supply_orders o WHERE 'crew-' || o.id::text = h.item_id AND o.status IN ('new', 'ordered') AND ${crewNotDeleted}))
        OR (h.item_id NOT LIKE 'crew-%' AND NOT EXISTS (SELECT 1 FROM (${await subOrderGroups()}) g WHERE g.item_id = h.item_id AND g.open))
      )
  `);
  await syncExtraJobs();
}

/**
 * The blue papers are the real extra jobs (the Extra Jobs page, table
 * extra_jobs): one paper per job, item_id "job-<id>".
 *   Set up     pinned, in the Extra jobs square until someone hands it off
 *   Done       taken down (it is in the office's "Ready to invoice" list)
 *   Cancelled  taken down
 * A job changed on its own page shows the change here. Nothing is pinned by
 * hand any more: "+ Extra job" on the board opens the Extra Jobs form.
 */
async function syncExtraJobs(): Promise<void> {
  if (!(await extraJobsReady())) return;
  const sql = getSql();
  const facts = `jsonb_build_object('notes', left(j.description, 300), 'date', j.job_date::text, 'jobId', j.id::text, 'jobNumber', j.job_number, 'sub', j.sub_name)`;
  await sql.query(`
    INSERT INTO handoff_items (kind, item_id, title, account_id, account_name, manager, step, step_since, data, created_by, board_pinned_at)
    SELECT 'extra', 'job-' || j.id::text, j.account_name, j.account_id, j.account_name, j.manager, 'setup', j.created_at, ${facts}, j.created_by, j.created_at
    FROM extra_jobs j
    WHERE j.status = 'setup'
    ON CONFLICT (kind, item_id) DO NOTHING
  `);
  await sql.query(`
    UPDATE handoff_items h SET title = j.account_name, account_id = j.account_id, account_name = j.account_name, data = h.data || ${facts}
    FROM extra_jobs j
    WHERE h.kind = 'extra' AND h.item_id = 'job-' || j.id::text AND j.status = 'setup'
      AND (h.account_name IS DISTINCT FROM j.account_name OR h.account_id IS DISTINCT FROM j.account_id OR NOT (h.data @> ${facts}))
  `);
  await sql`
    UPDATE handoff_items h SET
      board_done_at = COALESCE(j.done_at, j.cancelled_at, now()),
      board_done_by = CASE
        WHEN j.status = 'done' THEN j.done_by || ' (ready to invoice)'
          || CASE WHEN NOT EXISTS (SELECT 1 FROM extra_job_photos p WHERE p.job_id = j.id AND p.moment = 'after') THEN ' · No photo (labor only)' ELSE '' END
        ELSE j.cancelled_by || ' (job cancelled)'
      END
    FROM extra_jobs j
    WHERE h.kind = 'extra' AND h.item_id = 'job-' || j.id::text AND j.status <> 'setup'
      AND h.board_pinned_at IS NOT NULL AND h.board_done_at IS NULL
  `;
}

/** True for a blue paper that mirrors a real extra job: it is finished on the job's page, not on the board. */
export function isExtraJobPaper(kind: string, itemId: string): boolean {
  return kind === "extra" && itemId.startsWith("job-");
}

// A line is still on its way while its Status is one of the open ones; the
// same reading as orderStepFromStatus in lib/handoffs.ts (New / Needs Review,
// Approved, Pending / In Progress). Completed, Delivered, Denied and
// Cancelled are not.
const LINE_OPEN = `(
  btrim(o.status) = '' OR lower(btrim(o.status)) = 'new' OR lower(o.status) LIKE '%review%'
  OR lower(o.status) LIKE '%approved%' OR lower(o.status) LIKE '%progress%' OR lower(o.status) LIKE '%pending%'
  -- Supply control: picked from the shelf or bought, not delivered yet.
  OR lower(btrim(o.status)) IN ('picked', 'bought')
)`;

// The sub portal's supply orders, one row per order instead of one per line.
// One order = the lines that share an Order Group ID. The lines saved so far
// have none, so without it one order = what one sub ordered for one account
// on one day. Deleted orders (migration 041) are left out: subOrderGroups().
const SUB_ORDER_GROUPS = `
  SELECT 'sub-' || COALESCE(
           NULLIF(btrim(o.order_group_id), ''),
           md5(o.ordered_on::text || '|' || lower(btrim(COALESCE(NULLIF(btrim(o.subcontractor_email), ''), o.subcontractor))) || '|' || lower(btrim(o.account_name))),
           NULLIF(btrim(o.order_id), ''),
           o.sheet_row::text
         ) AS item_id,
         COALESCE(max(btrim(o.account_name)), '') AS account_name,
         COALESCE(max(o.account_ref), max(NULLIF(btrim(o.account_id_raw), '')), '') AS account_id,
         COALESCE(max(NULLIF(btrim(m.name), '')), max(NULLIF(btrim(a.manager_raw), '')), '') AS manager,
         count(*) AS lines,
         string_agg(btrim(concat_ws(' ', NULLIF(btrim(o.quantity_raw), ''), NULLIF(btrim(o.unit), ''), NULLIF(btrim(o.supply_item), ''))), ', ' ORDER BY o.sheet_row) AS items,
         COALESCE(max(btrim(o.subcontractor)), '') AS subcontractor,
         COALESCE(min(NULLIF(btrim(o.order_id), '')), '') AS order_id,
         min(COALESCE(o.ordered_on::timestamptz, o.created_at)) AS since,
         bool_or(${LINE_OPEN}) AS open
  FROM sub_supply_orders o
  LEFT JOIN accounts a ON a.id = o.account_ref
  LEFT JOIN managers m ON m.id = a.manager_id
  WHERE __NOT_DELETED__ AND (to_jsonb(a)->>'deleted_at') IS NULL
  GROUP BY 1`;

/** SUB_ORDER_GROUPS without deleted lines (where migration 041 is in). */
export async function subOrderGroups(): Promise<string> {
  return SUB_ORDER_GROUPS.replace("__NOT_DELETED__", await notDeleted("o"));
}

/* ---------- reading the board ---------- */

type PaperRow = {
  kind: PaperKind;
  item_id: string;
  title: string;
  account_id: string;
  account_name: string;
  data: Record<string, unknown> | null;
  created_by: string;
  board_square: string;
  board_pinned_at: string | Date;
  taken_by: string;
  taken_at: string | Date | null;
  board_done_at: string | Date | null;
  board_done_by: string;
  checklist_items: unknown;
  /** account_flows, when the paper is a new account in the 8-step flow (null otherwise, and before migration 046). */
  flow_step?: string | null;
  flow_step_since?: string | Date | null;
  flow_manager?: string | null;
  flow_offer_sub?: string | null;
  flow_due?: string | Date | null;
  flow_note?: string | null;
  flow_note_by?: string | null;
  flow_note_at?: string | Date | null;
  /** The step history that says which steps are done (done / undo / the sub's No), oldest first. */
  flow_events?: { step: string; action: string }[] | null;
};

function paperFlow(row: PaperRow): Paper["flow"] {
  if (row.kind !== "account" || !row.flow_step || !isFlowStep(row.flow_step)) return null;
  const due = row.flow_due instanceof Date ? row.flow_due.toISOString().slice(0, 10) : clean(row.flow_due).slice(0, 10);
  return flowView({
    step: row.flow_step,
    stepSince: iso(row.flow_step_since),
    manager: clean(row.flow_manager),
    offerSubName: clean(row.flow_offer_sub),
    followUpDue: due,
    stuckNote: clean(row.flow_note),
    stuckNoteBy: clean(row.flow_note_by),
    stuckNoteAt: iso(row.flow_note_at),
    doneSteps: doneStepsOf(Array.isArray(row.flow_events) ? row.flow_events : []),
  });
}

function paperHref(row: PaperRow): string {
  const accountId = clean(row.account_id);
  // A new account in the 8-step flow opens on its steps (the green button); the others open the checklist.
  if (row.kind === "account") return `/accounts/${encodeURIComponent(row.item_id)}${clean(row.data?.flow) ? "" : "?onboarding=1"}`;
  // The complaint itself (its id is the paper's id).
  if (row.kind === "complaint") return `/complaints/${encodeURIComponent(row.item_id)}`;
  if (row.kind === "supply") return clean(row.data?.orderId) ? `/supply-orders?order=${encodeURIComponent(clean(row.data?.orderId))}` : "/supply-orders";
  if (row.kind === "extra" && clean(row.data?.jobId)) return `/extra-jobs/${encodeURIComponent(clean(row.data?.jobId))}`;
  // A record pinned from its own screen ("Pin to board") opens where it lives.
  if (row.kind === "note" && clean(row.data?.recordType)) return clean(row.data?.href);
  return accountId ? `/accounts/${encodeURIComponent(accountId)}` : "";
}

/** A pinned account ("Pin to board" on the account, or Print PDF -> Pin to board): the Admin (office) PDF Print PDF makes. Blanked for the TV (app/api/board/tv). */
function paperPdfHref(row: PaperRow): string {
  const accountId = clean(row.account_id);
  if (row.kind !== "note" || clean(row.data?.recordType) !== "account" || !accountId) return "";
  return `/api/accounts/${encodeURIComponent(accountId)}/pdf/admin`;
}

function paperDetail(row: PaperRow): string {
  const data = row.data ?? {};
  if (row.kind === "supply") return [clean(data.items), clean(data.subcontractor) ? `Ordered by ${clean(data.subcontractor)}` : ""].filter(Boolean).join(". ");
  if (row.kind === "complaint") return clean(data.issue);
  if (row.kind === "extra") return [clean(data.notes), clean(data.date) ? `For ${clean(data.date)}` : "", clean(data.sub) ? `Sub: ${clean(data.sub)}` : ""].filter(Boolean).join(". ");
  if (row.kind === "note") return clean(data.notes);
  return "";
}

/** "3 items" on a supply order (how big it is, at a glance); the job number on an extra job. */
function paperBadge(row: PaperRow): string {
  if (row.kind === "extra") return clean(row.data?.jobNumber);
  if (row.kind !== "supply") return "";
  const count = Number(clean(row.data?.count));
  if (!Number.isFinite(count) || count < 1) return "";
  return count === 1 ? "1 item" : `${count} items`;
}

function toPaper(row: PaperRow): Paper {
  return {
    kind: row.kind,
    itemId: row.item_id,
    label: row.kind === "note" ? clean(row.data?.label) : "",
    title: clean(row.title) || clean(row.account_name),
    accountId: clean(row.account_id),
    accountName: clean(row.account_name),
    detail: paperDetail(row),
    badge: paperBadge(row),
    square: row.board_square ?? "",
    pinnedAt: iso(row.board_pinned_at),
    pinnedBy: clean(row.created_by),
    takenBy: row.taken_by ?? "",
    takenAt: iso(row.taken_at),
    doneAt: iso(row.board_done_at),
    doneBy: row.board_done_by ?? "",
    // A paper in the 8-step flow shows its tracker instead of the checklist count.
    progress: row.kind === "account" && !paperFlow(row) ? countChecklistProgress(checklistItems(row.checklist_items)) : null,
    flow: paperFlow(row),
    href: paperHref(row),
    pdfHref: paperPdfHref(row),
    forWho: clean(row.data?.forWho),
    dueDate: clean(row.data?.dueDate),
    recordDone: clean(row.data?.recordDoneOn) !== "",
    box: row.kind === "note" ? clean(row.data?.box) : "",
  };
}

const SELECT_PAPER_PLAIN = `
  SELECT i.kind, i.item_id, i.title, i.account_id, i.account_name, i.data, i.created_by, i.board_square, i.board_pinned_at,
         i.taken_by, i.taken_at, i.board_done_at, i.board_done_by, c.items AS checklist_items
  FROM handoff_items i
  LEFT JOIN onboarding_checklists c ON i.kind = 'account' AND c.account_id = i.item_id
  WHERE i.board_pinned_at IS NOT NULL AND i.kind IN (${BOARD_KINDS_SQL}) AND ${handoffLive("i")}`;

// The same, plus each new account's 8-step flow (migration 046).
const SELECT_PAPER_FLOW = `
  SELECT i.kind, i.item_id, i.title, i.account_id, i.account_name, i.data, i.created_by, i.board_square, i.board_pinned_at,
         i.taken_by, i.taken_at, i.board_done_at, i.board_done_by, c.items AS checklist_items,
         f.step AS flow_step, f.step_since AS flow_step_since, f.manager AS flow_manager, f.offer_sub_name AS flow_offer_sub,
         f.follow_up_due AS flow_due, f.stuck_note AS flow_note, f.stuck_note_by AS flow_note_by, f.stuck_note_at AS flow_note_at,
         (SELECT json_agg(json_build_object('step', e.step, 'action', e.action) ORDER BY e.at, e.id)
          FROM account_flow_events e
          WHERE f.account_id IS NOT NULL AND e.account_id = f.account_id AND e.action IN ('done', 'undo', 'no', 'back')) AS flow_events
  FROM handoff_items i
  LEFT JOIN onboarding_checklists c ON i.kind = 'account' AND c.account_id = i.item_id
  LEFT JOIN account_flows f ON i.kind = 'account' AND f.account_id = i.item_id
  WHERE i.board_pinned_at IS NOT NULL AND i.kind IN (${BOARD_KINDS_SQL}) AND ${handoffLive("i")}`;

async function selectPaper(): Promise<string> {
  return (await flowTableReady()) ? SELECT_PAPER_FLOW : SELECT_PAPER_PLAIN;
}

/**
 * Everything still pinned (oldest first) and the Done tray: the papers
 * finished in the last `doneDays` days, newest first. A finished paper is
 * never deleted: after those days it is in the Archive (listArchive).
 */
export async function listPapers(doneDays = DEFAULT_BOARD_SETTINGS.doneDays): Promise<{ papers: Paper[]; done: Paper[] }> {
  const sql = getSql();
  const SELECT_PAPER = await selectPaper();
  const [open, done] = await Promise.all([
    sql.query(`${SELECT_PAPER} AND i.board_done_at IS NULL ORDER BY i.board_pinned_at ASC, i.item_id ASC`),
    sql.query(`${SELECT_PAPER} AND i.board_done_at > now() - ($1::int || ' days')::interval ORDER BY i.board_done_at DESC LIMIT 200`, [doneDays]),
  ]);
  return { papers: (open as PaperRow[]).map(toPaper), done: (done as PaperRow[]).map(toPaper) };
}

/**
 * The Archive: finished papers that have left the Done tray (finished more
 * than `doneDays` days ago), newest first. `search` looks in the account
 * name and the words on the paper; `day` (YYYY-MM-DD, office time) is the
 * day it was finished. 100 at a time; `more` says there are older ones.
 */
export async function listArchive(input: { doneDays: number; search?: string; day?: string; offset?: number }): Promise<{ papers: Paper[]; more: boolean; total: number }> {
  const sql = getSql();
  const params: unknown[] = [input.doneDays];
  let where = ` AND i.board_done_at <= now() - ($1::int || ' days')::interval`;
  const search = clean(input.search).toLowerCase();
  if (search) {
    params.push(search);
    where += ` AND (lower(i.account_name) LIKE '%' || $${params.length} || '%' OR lower(i.title) LIKE '%' || $${params.length} || '%')`;
  }
  if (input.day && /^\d{4}-\d{2}-\d{2}$/.test(input.day)) {
    params.push(input.day);
    where += ` AND (i.board_done_at AT TIME ZONE 'America/New_York')::date = $${params.length}::date`;
  }
  const offset = Math.max(0, Math.round(input.offset ?? 0));
  const SELECT_PAPER = await selectPaper();
  const [rows, count] = await Promise.all([
    sql.query(`${SELECT_PAPER}${where} ORDER BY i.board_done_at DESC, i.item_id LIMIT 101 OFFSET ${offset}`, params),
    sql.query(`SELECT count(*)::int AS n FROM handoff_items i WHERE i.board_pinned_at IS NOT NULL AND i.kind IN (${BOARD_KINDS_SQL}) AND ${handoffLive("i")}${where}`, params),
  ]);
  const list = rows as PaperRow[];
  return { papers: list.slice(0, 100).map(toPaper), more: list.length > 100, total: (count as { n: number }[])[0]?.n ?? 0 };
}

/* ---------- what people do to a paper ---------- */

const isBoardKind = (kind: string): kind is PaperKind => (PAPER_KINDS as string[]).includes(kind);

/** "+ Pin something": a to-do someone writes by hand. (An extra job is set up on the Extra Jobs form, not here.) */
export async function pinPaper(input: { text: string; accountId?: string; accountName?: string; square: string; by: string; notes?: string; dueDate?: string; box?: string }): Promise<string> {
  const itemId = `board-${Date.now().toString(36)}-${randomBytes(4).toString("hex")}`;
  await insertPaper({
    kind: "note",
    itemId,
    title: input.text.trim().slice(0, 500),
    accountId: clean(input.accountId),
    accountName: clean(input.accountName),
    step: "pinned",
    data: {
      notes: clean(input.notes).slice(0, 1000),
      dueDate: /^\d{4}-\d{2}-\d{2}$/.test(clean(input.dueDate)) ? clean(input.dueDate) : "",
      box: clean(input.box),
      // A sticky note added inside a box is a plain note, not a to-do.
      label: clean(input.box) || clean(input.notes) || clean(input.dueDate) ? "Note" : "",
    },
    createdBy: input.by,
    square: clean(input.square),
  });
  return itemId;
}

/** Dragging a paper into a square: "" = back to the shared square, otherwise a manager's Staff ID. */
export async function movePaper(kind: string, itemId: string, square: string): Promise<boolean> {
  if (!isBoardKind(kind)) return false;
  const sql = getSql();
  const rows = (await sql`
    UPDATE handoff_items SET board_square = ${square}
    WHERE kind = ${kind} AND item_id = ${itemId} AND board_pinned_at IS NOT NULL AND board_done_at IS NULL
    RETURNING item_id
  `) as unknown[];
  return rows.length > 0;
}

/** "Got it": the pin turns green and shows who. Taking it back turns it red again. */
export async function takePaper(kind: string, itemId: string, by: string, on: boolean): Promise<boolean> {
  if (!isBoardKind(kind)) return false;
  const sql = getSql();
  const rows = (await sql`
    UPDATE handoff_items SET taken_by = ${on ? by : ""}, taken_at = ${on ? new Date().toISOString() : null}
    WHERE kind = ${kind} AND item_id = ${itemId} AND board_pinned_at IS NOT NULL AND board_done_at IS NULL
    RETURNING item_id
  `) as unknown[];
  return rows.length > 0;
}

/** "Done": off the board and into the Done tray, with who and when. `on: false` pins it back. */
export async function finishPaper(kind: string, itemId: string, by: string, on: boolean): Promise<boolean> {
  if (!isBoardKind(kind)) return false;
  const sql = getSql();
  const rows = (await sql`
    UPDATE handoff_items SET board_done_at = ${on ? new Date().toISOString() : null}, board_done_by = ${on ? by : ""}
    WHERE kind = ${kind} AND item_id = ${itemId} AND board_pinned_at IS NOT NULL
    RETURNING item_id
  `) as unknown[];
  return rows.length > 0;
}

/* ---------- settings ---------- */

export async function getBoardSettings(): Promise<BoardSettings> {
  const sql = getSql();
  // done_days is read through to_jsonb so the board still loads where migration 032 is not applied yet (7 days there).
  const rows = (await sql`SELECT old_after_days, to_jsonb(board_settings)->>'done_days' AS done_days FROM board_settings WHERE id = true`) as { old_after_days: number; done_days: string | null }[];
  if (!rows[0]) return DEFAULT_BOARD_SETTINGS;
  const doneDays = Number(rows[0].done_days);
  return { oldAfterDays: rows[0].old_after_days, doneDays: Number.isFinite(doneDays) && doneDays >= 1 ? doneDays : DEFAULT_BOARD_SETTINGS.doneDays };
}

export async function saveBoardSettings(settings: BoardSettings, by: string): Promise<BoardSettings> {
  const sql = getSql();
  const days = Math.min(60, Math.max(1, Math.round(settings.oldAfterDays)));
  await sql`
    INSERT INTO board_settings (id, old_after_days, updated_by, updated_at) VALUES (true, ${days}, ${by}, now())
    ON CONFLICT (id) DO UPDATE SET old_after_days = EXCLUDED.old_after_days, updated_by = EXCLUDED.updated_by, updated_at = now()
  `;
  // Its own step: the column is only there once migration 032 is applied.
  const doneDays = Math.min(90, Math.max(1, Math.round(settings.doneDays)));
  try {
    await sql`UPDATE board_settings SET done_days = ${doneDays} WHERE id = true`;
  } catch (error) {
    if ((error as { code?: string }).code !== "42703") throw error;
    return { oldAfterDays: days, doneDays: DEFAULT_BOARD_SETTINGS.doneDays };
  }
  return { oldAfterDays: days, doneDays };
}

/* ---------- TV links ---------- */

const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

type TvLinkRow = { id: string; label: string; created_by: string; created_at: string | Date; last_seen_at: string | Date | null; revoked_at: string | Date | null; revoked_by: string };

export async function listTvLinks(): Promise<TvLink[]> {
  const sql = getSql();
  // A TV that is still showing its code (not connected yet) is not a link to list.
  const rows = (await sql`SELECT id::text, label, created_by, created_at, last_seen_at, revoked_at, revoked_by FROM board_tv_links WHERE revoked_by NOT LIKE ${PAIR_PREFIX + "%"} ORDER BY created_at DESC`) as TvLinkRow[];
  return rows.map((row) => ({
    id: row.id,
    label: row.label,
    createdBy: row.created_by,
    createdAt: iso(row.created_at),
    lastSeenAt: iso(row.last_seen_at),
    revokedAt: iso(row.revoked_at),
    revokedBy: row.revoked_by,
  }));
}

/* ---------- connecting a TV with a 6-digit code ----------
 *
 * The TV makes its own secret and keeps it. While it waits, that secret is
 * stored (hashed, like every TV link) as a link that is still off, marked
 * "pair:<code>". When the owner types the code on a phone, the link is
 * switched on and named, and the TV's secret starts working. No new table.
 */

const PAIR_PREFIX = "pair:";
export const TV_CODE_MINUTES = 10;
const MAX_WAITING_TVS = 30;

const validTvSecret = (secret: string) => secret.length >= 20 && secret.length <= 100;

export type TvPairing = { state: "connected" } | { state: "renew" } | { state: "busy" } | { state: "waiting"; code: string; secondsLeft: number };

/** A TV asks for (or asks again about) its code. */
export async function startTvPairing(secret: string): Promise<TvPairing> {
  if (!validTvSecret(secret)) return { state: "renew" };
  const sql = getSql();
  const hash = hashToken(secret);
  // Codes nobody used: gone after 10 minutes.
  await sql`DELETE FROM board_tv_links WHERE revoked_by LIKE ${PAIR_PREFIX + "%"} AND created_at < now() - make_interval(mins => ${TV_CODE_MINUTES})`;
  const mine = (await sql`
    SELECT revoked_at IS NULL AS live, revoked_by, GREATEST(0, ${TV_CODE_MINUTES * 60} - EXTRACT(EPOCH FROM now() - created_at))::int AS left
    FROM board_tv_links WHERE token_hash = ${hash}
  `) as { live: boolean; revoked_by: string; left: number }[];
  if (mine[0]?.live) return { state: "connected" };
  if (mine[0]?.revoked_by.startsWith(PAIR_PREFIX)) return { state: "waiting", code: mine[0].revoked_by.slice(PAIR_PREFIX.length), secondsLeft: mine[0].left };
  // This TV was disconnected: its old secret never works again, it needs a new one.
  if (mine[0]) return { state: "renew" };

  const waiting = (await sql`SELECT revoked_by FROM board_tv_links WHERE revoked_by LIKE ${PAIR_PREFIX + "%"}`) as { revoked_by: string }[];
  if (waiting.length >= MAX_WAITING_TVS) return { state: "busy" };
  const taken = new Set(waiting.map((row) => row.revoked_by));
  let code = "";
  for (let attempt = 0; attempt < 20 && !code; attempt++) {
    const candidate = String(randomInt(0, 1_000_000)).padStart(6, "0");
    if (!taken.has(PAIR_PREFIX + candidate)) code = candidate;
  }
  if (!code) return { state: "busy" };
  await sql`
    INSERT INTO board_tv_links (token_hash, label, created_by, revoked_at, revoked_by)
    VALUES (${hash}, 'Waiting to connect', '', now(), ${PAIR_PREFIX + code})
    ON CONFLICT (token_hash) DO NOTHING
  `;
  return { state: "waiting", code, secondsLeft: TV_CODE_MINUTES * 60 };
}

/** The owner typed a TV's code: that TV is connected and named. False when the code is wrong or older than 10 minutes. */
export async function connectTv(code: string, label: string, by: string): Promise<boolean> {
  if (!/^\d{6}$/.test(code)) return false;
  const sql = getSql();
  const rows = (await sql`
    UPDATE board_tv_links
    SET label = ${label.trim().slice(0, 60) || "Office TV"}, created_by = ${by}, created_at = now(), revoked_at = NULL, revoked_by = ''
    WHERE revoked_by = ${PAIR_PREFIX + code} AND created_at > now() - make_interval(mins => ${TV_CODE_MINUTES})
    RETURNING id
  `) as unknown[];
  return rows.length > 0;
}

/** Makes a new TV link. The token is returned once, here, and never stored. */
export async function createTvLink(label: string, by: string): Promise<{ token: string }> {
  const sql = getSql();
  const token = randomBytes(24).toString("base64url");
  await sql`INSERT INTO board_tv_links (token_hash, label, created_by) VALUES (${hashToken(token)}, ${label.trim().slice(0, 60)}, ${by})`;
  return { token };
}

export async function revokeTvLink(id: string, by: string): Promise<boolean> {
  if (!/^\d+$/.test(id)) return false;
  const sql = getSql();
  const rows = (await sql`UPDATE board_tv_links SET revoked_at = now(), revoked_by = ${by} WHERE id = ${id}::bigint AND revoked_at IS NULL RETURNING id`) as unknown[];
  return rows.length > 0;
}

/** True when the token belongs to a TV link that has not been revoked. */
export async function tvTokenIsValid(token: string): Promise<boolean> {
  if (!token || token.length < 20 || token.length > 100) return false;
  const sql = getSql();
  const rows = (await sql`
    UPDATE board_tv_links SET last_seen_at = now()
    WHERE token_hash = ${hashToken(token)} AND revoked_at IS NULL
    RETURNING id
  `) as unknown[];
  return rows.length > 0;
}
