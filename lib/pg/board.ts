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

import { createHash, randomBytes } from "node:crypto";
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
import { ACCOUNT_DONE_STEP, currentOnboardingSection } from "@/lib/handoffs";
import { extraJobsReady } from "@/lib/pg/extra-jobs";
import { countChecklistProgress, createEmptyChecklistItems, type OnboardingChecklistItems } from "@/lib/onboardingChecklist";

let ready: boolean | null = null;

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

type ChecklistRow = { account_id: string; account_name: string; items: unknown; started_at: string | Date | null; manager: string | null };

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
  const since = input.since && !Number.isNaN(new Date(input.since).getTime()) ? new Date(input.since).toISOString() : null;
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

  // 2. New accounts: an Onboarding Checklist that is started and not finished.
  const checklists = (await sql`
    SELECT c.account_id, COALESCE(NULLIF(btrim(a.account_name), ''), c.account_name) AS account_name, c.items, c.started_at,
           COALESCE(NULLIF(btrim(m.name), ''), a.manager_raw) AS manager
    FROM onboarding_checklists c
    LEFT JOIN accounts a ON a.id = c.account_id
    LEFT JOIN managers m ON m.id = a.manager_id
    WHERE c.completed_at IS NULL
      AND btrim(c.account_id) <> ''
      AND COALESCE(a.status_key, '') <> 'cancelled'
      AND NOT EXISTS (SELECT 1 FROM handoff_items h WHERE h.kind = 'account' AND h.item_id = c.account_id)
  `) as ChecklistRow[];
  for (const row of checklists) {
    const step = currentOnboardingSection(checklistItems(row.items));
    if (step === ACCOUNT_DONE_STEP) continue;
    await insertPaper({
      kind: "account",
      itemId: row.account_id,
      title: row.account_name,
      accountId: row.account_id,
      accountName: row.account_name,
      manager: clean(row.manager),
      step,
      since: row.started_at,
      data: row.started_at ? { acceptedOn: iso(row.started_at).slice(0, 10) } : {},
    });
  }

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
    FROM (${SUB_ORDER_GROUPS}) g
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
    FROM (${SUB_ORDER_GROUPS}) g
    WHERE h.kind = 'supply' AND h.item_id = g.item_id AND g.open
      AND (h.data->>'count' IS DISTINCT FROM g.lines::text OR h.board_done_by = 'Closed in Supply Orders')
  `);

  // 5. Supply orders a crew placed from the Crew Link or the Team Hub.
  await sql`
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
    WHERE o.status IN ('new', 'ordered')
    ON CONFLICT (kind, item_id) DO NOTHING
  `;

  // 6. Take down what was finished where it lives. "Closed there" is who.
  await sql`
    UPDATE handoff_items h SET board_done_at = now(), board_done_by = 'Checklist finished'
    WHERE h.kind = 'account' AND h.board_pinned_at IS NOT NULL AND h.board_done_at IS NULL
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
        (h.item_id LIKE 'crew-%' AND NOT EXISTS (SELECT 1 FROM supply_orders o WHERE 'crew-' || o.id::text = h.item_id AND o.status IN ('new', 'ordered')))
        OR (h.item_id NOT LIKE 'crew-%' AND NOT EXISTS (SELECT 1 FROM (${SUB_ORDER_GROUPS}) g WHERE g.item_id = h.item_id AND g.open))
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
      board_done_by = CASE WHEN j.status = 'done' THEN j.done_by || ' (ready to invoice)' ELSE j.cancelled_by || ' (job cancelled)' END
    FROM extra_jobs j
    WHERE h.kind = 'extra' AND h.item_id = 'job-' || j.id::text AND j.status <> 'setup'
      AND h.board_pinned_at IS NOT NULL AND h.board_done_at IS NULL
  `;
}

/** True for a blue paper that mirrors a real extra job: it is finished on the job's page (with an after photo), not on the board. */
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
)`;

// The sub portal's supply orders, one row per order instead of one per line.
// One order = the lines that share an Order Group ID. The lines saved so far
// have none, so without it one order = what one sub ordered for one account
// on one day.
export const SUB_ORDER_GROUPS = `
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
  GROUP BY 1`;

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
};

function paperHref(row: PaperRow): string {
  const accountId = clean(row.account_id);
  if (row.kind === "account") return `/accounts/${encodeURIComponent(row.item_id)}?onboarding=1`;
  // The complaint itself (its id is the paper's id).
  if (row.kind === "complaint") return `/complaints/${encodeURIComponent(row.item_id)}`;
  if (row.kind === "supply") return clean(row.data?.orderId) ? `/supply-orders?order=${encodeURIComponent(clean(row.data?.orderId))}` : "/supply-orders";
  if (row.kind === "extra" && clean(row.data?.jobId)) return `/extra-jobs/${encodeURIComponent(clean(row.data?.jobId))}`;
  // A record pinned from its own screen ("Pin to board") opens where it lives.
  if (row.kind === "note" && clean(row.data?.recordType)) return clean(row.data?.href);
  return accountId ? `/accounts/${encodeURIComponent(accountId)}` : "";
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
    progress: row.kind === "account" ? countChecklistProgress(checklistItems(row.checklist_items)) : null,
    href: paperHref(row),
    forWho: clean(row.data?.forWho),
    dueDate: clean(row.data?.dueDate),
    recordDone: clean(row.data?.recordDoneOn) !== "",
  };
}

const SELECT_PAPER = `
  SELECT i.kind, i.item_id, i.title, i.account_id, i.account_name, i.data, i.created_by, i.board_square, i.board_pinned_at,
         i.taken_by, i.taken_at, i.board_done_at, i.board_done_by, c.items AS checklist_items
  FROM handoff_items i
  LEFT JOIN onboarding_checklists c ON i.kind = 'account' AND c.account_id = i.item_id
  WHERE i.board_pinned_at IS NOT NULL AND i.kind IN (${BOARD_KINDS_SQL})`;

/** Everything still pinned (oldest first) and the Done tray (last 30 days, newest first). */
export async function listPapers(): Promise<{ papers: Paper[]; done: Paper[] }> {
  const sql = getSql();
  const [open, done] = await Promise.all([
    sql.query(`${SELECT_PAPER} AND i.board_done_at IS NULL ORDER BY i.board_pinned_at ASC, i.item_id ASC`),
    sql.query(`${SELECT_PAPER} AND i.board_done_at > now() - interval '30 days' ORDER BY i.board_done_at DESC LIMIT 100`),
  ]);
  return { papers: (open as PaperRow[]).map(toPaper), done: (done as PaperRow[]).map(toPaper) };
}

/* ---------- what people do to a paper ---------- */

const isBoardKind = (kind: string): kind is PaperKind => (PAPER_KINDS as string[]).includes(kind);

/** "+ Pin something": a to-do someone writes by hand. (An extra job is set up on the Extra Jobs form, not here.) */
export async function pinPaper(input: { text: string; accountId?: string; accountName?: string; square: string; by: string }): Promise<string> {
  const itemId = `board-${Date.now().toString(36)}-${randomBytes(4).toString("hex")}`;
  await insertPaper({
    kind: "note",
    itemId,
    title: input.text.trim().slice(0, 500),
    accountId: clean(input.accountId),
    accountName: clean(input.accountName),
    step: "pinned",
    data: { notes: "" },
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
  const rows = (await sql`SELECT old_after_days FROM board_settings WHERE id = true`) as { old_after_days: number }[];
  return rows[0] ? { oldAfterDays: rows[0].old_after_days } : DEFAULT_BOARD_SETTINGS;
}

export async function saveBoardSettings(settings: BoardSettings, by: string): Promise<BoardSettings> {
  const sql = getSql();
  const days = Math.min(60, Math.max(1, Math.round(settings.oldAfterDays)));
  await sql`
    INSERT INTO board_settings (id, old_after_days, updated_by, updated_at) VALUES (true, ${days}, ${by}, now())
    ON CONFLICT (id) DO UPDATE SET old_after_days = EXCLUDED.old_after_days, updated_by = EXCLUDED.updated_by, updated_at = now()
  `;
  return { oldAfterDays: days };
}

/* ---------- TV links ---------- */

const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

type TvLinkRow = { id: string; label: string; created_by: string; created_at: string | Date; last_seen_at: string | Date | null; revoked_at: string | Date | null; revoked_by: string };

export async function listTvLinks(): Promise<TvLink[]> {
  const sql = getSql();
  const rows = (await sql`SELECT id::text, label, created_by, created_at, last_seen_at, revoked_at, revoked_by FROM board_tv_links ORDER BY created_at DESC`) as TvLinkRow[];
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
