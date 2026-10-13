// Pin Board texts: a manager gets one text when someone else puts a paper in
// their square. Sent right away, one text per paper. Best-effort like the
// To-Do texts (app/api/to-do/route.ts): callers run it inside after(), and it
// never throws.
//
// Squares are Staff IDs; phones are in the managers table (the same numbers
// the To-Do texts use). Every attempt is written to the SMS log under
// "board:<paper>", so it never shows on a to-do and the credit banner still
// sees it.

import { getSql } from "@/lib/db";
import { PAPER_KINDS, type PaperKind } from "@/lib/board";
import { appendSmsLog } from "@/lib/data/todos";
import { sanitizeSmsText, sendSms, smsLastLine } from "@/lib/sms";

const clean = (value: unknown) => String(value ?? "").trim();

export type PaperNow = { itemId: string; square: string; title: string; accountName: string; notes: string };

/** A paper that is up on the board now: where it hangs and what it says. Null when it is not up. */
export async function paperOnBoard(kind: string, itemId: string): Promise<PaperNow | null> {
  if (!(PAPER_KINDS as string[]).includes(kind) || !itemId) return null;
  const sql = getSql();
  const rows = (await sql`
    SELECT item_id, board_square, title, account_name, COALESCE(data->>'notes', '') AS notes
    FROM handoff_items
    WHERE kind = ${kind as PaperKind} AND item_id = ${itemId} AND board_pinned_at IS NOT NULL AND board_done_at IS NULL
    LIMIT 1
  `) as { item_id: string; board_square: string | null; title: string | null; account_name: string | null; notes: string }[];
  const row = rows[0];
  return row ? { itemId: row.item_id, square: clean(row.board_square), title: clean(row.title), accountName: clean(row.account_name), notes: clean(row.notes) } : null;
}

/**
 * True when the To-Do text for this to-do already went to the manager of this
 * square: the to-do was made in the last two minutes and is assigned to them.
 */
export async function toDoTextCoversSquare(toDoId: string, square: string): Promise<boolean> {
  if (!toDoId || !square) return false;
  try {
    const sql = getSql();
    const rows = (await sql`
      SELECT 1 FROM todos t JOIN staff s ON s.id = ${square}
      WHERE t.todo_id = ${toDoId} AND t.created_at > now() - interval '2 minutes'
        AND lower(btrim(t.assigned_to)) = lower(btrim(s.name))
      LIMIT 1
    `) as unknown[];
    return rows.length > 0;
  } catch (error) {
    console.error("[sms] board: to-do check failed:", error instanceof Error ? error.message : error);
    return false;
  }
}

const DETAIL_MAX = 140;

/** The words of the text. Exported so the wording has one home. */
export function boardSmsText(paper: { title: string; accountName: string; notes?: string }, origin: string): string {
  const title = clean(paper.title).replace(/\s*·\s*/g, " - ");
  const name = clean(paper.accountName) || title || "a paper";
  const detail = [title && title !== name ? title : "", clean(paper.notes)].filter(Boolean).join(" - ");
  return [`New on the board for you: ${name}`, detail.length > DETAIL_MAX ? `${detail.slice(0, DETAIL_MAX - 3)}...` : detail, smsLastLine(`${origin}/board`, "staff")]
    .filter(Boolean)
    .join("\n");
}

/**
 * Texts the manager whose square a paper just landed in. Nothing is sent when
 * the paper went to a shared square, or when the manager put it there
 * themselves.
 */
export async function notifyBoardSquare(input: {
  square: string;
  /** Staff ID of the person who pinned or moved it. */
  byStaffId: string;
  /** The paper's ID, for the SMS log. */
  paperId: string;
  title: string;
  accountName: string;
  notes?: string;
  origin: string;
  routeContext: string;
}): Promise<void> {
  const square = clean(input.square);
  if (!square || square === clean(input.byStaffId)) return;

  let phone = "";
  let name = "";
  try {
    const sql = getSql();
    const rows = (await sql`
      SELECT s.name, COALESCE(m.phone, '') AS phone
      FROM staff s
      LEFT JOIN managers m ON m.staff_id = s.id OR lower(btrim(m.name)) = lower(btrim(s.name))
      WHERE s.id = ${square} AND s.role = 'Manager' AND s.active
      ORDER BY (m.staff_id = s.id) DESC NULLS LAST, (btrim(COALESCE(m.phone, '')) <> '') DESC
      LIMIT 1
    `) as { name: string; phone: string }[];
    if (rows.length === 0) return;
    name = clean(rows[0].name);
    phone = clean(rows[0].phone);
  } catch (error) {
    console.error(`[notify] ${input.routeContext} lookup failed:`, error instanceof Error ? error.message : error);
    return;
  }

  if (!phone) {
    console.debug(`[sms] skip ${input.routeContext}: manager "${name}" has no phone on file`);
    return;
  }

  const message = sanitizeSmsText(boardSmsText(input, input.origin), Infinity);
  const result = await sendSms(phone, message, input.routeContext);
  try {
    await appendSmsLog({
      toDoId: `board:${input.paperId}`,
      managerPhone: phone,
      textId: result.textId !== undefined ? String(result.textId) : "",
      status: result.success ? "sent" : "failed",
      quotaRemaining: result.quotaRemaining,
    });
  } catch (error) {
    console.error("[sms] failed to write SmsLog row:", error instanceof Error ? error.message : error);
  }
}
