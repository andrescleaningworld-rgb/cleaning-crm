// "Some things I couldn't do" for the office (the crew screen is
// app/porter/[code]/CrewChecklist.tsx). Server only. Nothing new is stored:
// the skips are in the sent checklists (checklist_submissions, each item's
// checked + skipReason), and the alert is ONE Pin Board paper per account in
// its manager's square (handoff_items kind 'note', item_id 'skip:<account>'):
//
//   "Rose Brand: couldn't do Cardboard (No time) · 2 nights"
//
//   - every checklist sent with a skip updates the paper: the latest night's
//     skipped items, and how many nights had skips since the paper went up;
//   - red when the same item was skipped 3 nights in a row (that tab's last
//     3 nights with a checklist sent);
//   - it comes down when the manager marks it Done on the board, and a new
//     skip after that puts it back up, counting from 1 again.
// A "night" is the office's day 6 hours earlier, so a 1 am Send counts for
// the night before.

import { getSql } from "@/lib/db";
import { squareForManager } from "@/lib/boardPins";
import { finishPaper, listBoardManagers } from "@/lib/pg/board";
import { SKIP_REASON_WORDS, isSkipReason, type ChecklistSubmissionSection } from "@/lib/checklistTemplate";

const clean = (value: unknown) => String(value ?? "").trim();
const typed = async <T,>(query: PromiseLike<unknown>): Promise<T> => (await query) as T;

export const skipPinId = (accountId: string) => `skip:${accountId}`;

/** Same item skipped this many nights in a row: the paper turns red. */
export const RED_AFTER_NIGHTS = 3;

type SentRow = { id: number; tab_id: number | null; submitted_at: string | Date; night: string; items_snapshot_json: ChecklistSubmissionSection[] | null };

type Skip = { key: string; label: string; reason: string };

/** The items not done in one sent checklist (an unchecked item without a reason is a skip too: an older crew screen). */
export function skipsOf(sections: ChecklistSubmissionSection[] | null | undefined): Skip[] {
  const out: Skip[] = [];
  for (const section of sections ?? []) {
    for (const item of section.items ?? []) {
      if (item.checked) continue;
      out.push({ key: clean(item.key), label: clean(item.label) || clean(item.key), reason: isSkipReason(item.skipReason) ? SKIP_REASON_WORDS[item.skipReason] : "" });
    }
  }
  return out;
}

/** "Cardboard (No time), Trash (No supplies)". */
const skipWords = (skips: Skip[]) => skips.map((skip) => (skip.reason ? `${skip.label} (${skip.reason})` : skip.label)).join(", ");

/**
 * After a checklist is sent: puts up (or updates) the account's "Couldn't
 * do" paper when that checklist had a skip. Does nothing otherwise: the
 * paper stays until the manager marks it handled.
 */
export async function refreshSkipPin(accountId: string, accountName: string, submissionId: number): Promise<void> {
  const sql = getSql();
  const sent = await typed<SentRow[]>(sql`
    SELECT id, tab_id, submitted_at, items_snapshot_json,
           to_char(((submitted_at - interval '6 hours') AT TIME ZONE 'America/New_York')::date, 'YYYY-MM-DD') AS night
    FROM checklist_submissions
    WHERE account_id = ${accountId} AND submitted_at > now() - interval '45 days'
    ORDER BY submitted_at DESC, id DESC
  `);
  const latest = sent.find((row) => row.id === submissionId);
  if (!latest || skipsOf(latest.items_snapshot_json).length === 0) return;

  // The paper as it is: still up (counting from when it went up), or down / never up (it starts again now).
  const pins = await typed<{ data: Record<string, string> | null; board_done_at: string | Date | null; board_pinned_at: string | Date | null }[]>(sql`
    SELECT data, board_done_at, board_pinned_at FROM handoff_items WHERE kind = 'note' AND item_id = ${skipPinId(accountId)} LIMIT 1
  `);
  const pin = pins[0];
  const up = Boolean(pin && pin.board_pinned_at && !pin.board_done_at);
  const since = up && clean(pin?.data?.since) ? clean(pin?.data?.since) : new Date(latest.submitted_at).toISOString();

  // The latest night's skips, every tab sent that night.
  const tonight = sent.filter((row) => row.night === latest.night);
  const seen = new Set<string>();
  const skips = tonight.flatMap((row) => skipsOf(row.items_snapshot_json)).filter((skip) => !seen.has(skip.key) && seen.add(skip.key));

  // Nights with a skip since the paper went up.
  const nights = new Set(sent.filter((row) => new Date(row.submitted_at).toISOString() >= since && skipsOf(row.items_snapshot_json).length > 0).map((row) => row.night)).size || 1;

  // Red: an item skipped on each of its tab's last 3 nights with a checklist sent.
  const red = tonight.some((row) => {
    const byNight = new Map<string, SentRow>();
    for (const each of sent) if (each.tab_id === row.tab_id && !byNight.has(each.night)) byNight.set(each.night, each); // newest first: the night's last send
    const lastNights = [...byNight.values()].slice(0, RED_AFTER_NIGHTS);
    if (lastNights.length < RED_AFTER_NIGHTS) return false;
    return skipsOf(row.items_snapshot_json).some((skip) => lastNights.every((night) => skipsOf(night.items_snapshot_json).some((other) => other.key === skip.key)));
  });

  const name = clean(accountName) || "Account";
  const title = `${name}: couldn't do ${skipWords(skips)} · ${nights} ${nights === 1 ? "night" : "nights"}`;
  const managers = await listBoardManagers();
  const managerRows = await typed<{ manager: string | null }[]>(sql`
    SELECT COALESCE(NULLIF(btrim(m.name), ''), btrim(a.manager_raw)) AS manager
    FROM accounts a LEFT JOIN managers m ON m.id = a.manager_id WHERE a.id = ${accountId} LIMIT 1
  `);
  const square = squareForManager(managers, clean(managerRows[0]?.manager));
  const data = {
    label: "Couldn't do",
    notes: red ? `Same item skipped ${RED_AFTER_NIGHTS} nights in a row.` : "",
    href: `/accounts/${encodeURIComponent(accountId)}`,
    recordType: "crew-skip",
    box: "",
    since,
    nights: String(nights),
    red: red ? "1" : "",
  };
  await sql`
    INSERT INTO handoff_items (kind, item_id, title, account_id, account_name, manager, step, data, created_by, board_pinned_at, board_square)
    VALUES ('note', ${skipPinId(accountId)}, ${title.slice(0, 300)}, ${accountId}, ${name}, ${clean(managerRows[0]?.manager)}, 'pinned',
            ${JSON.stringify(data)}::jsonb, 'Crew Link', now(), ${square})
    ON CONFLICT (kind, item_id) DO UPDATE SET
      title = EXCLUDED.title, account_name = EXCLUDED.account_name, manager = EXCLUDED.manager, data = EXCLUDED.data, board_square = EXCLUDED.board_square,
      board_pinned_at = CASE WHEN handoff_items.board_done_at IS NOT NULL OR handoff_items.board_pinned_at IS NULL THEN now() ELSE handoff_items.board_pinned_at END,
      board_done_at = NULL, board_done_by = '', taken_by = CASE WHEN handoff_items.board_done_at IS NOT NULL THEN '' ELSE handoff_items.taken_by END,
      taken_at = CASE WHEN handoff_items.board_done_at IS NOT NULL THEN NULL ELSE handoff_items.taken_at END
  `;
}

/** Accounts Center: every "Couldn't do" paper still up, red first, then newest. */
export type OpenSkip = { accountId: string; accountName: string; title: string; nights: number; red: boolean; since: string };

export async function listOpenSkips(): Promise<OpenSkip[]> {
  const rows = await typed<{ account_id: string; account_name: string; title: string; data: Record<string, string> | null; board_pinned_at: string | Date }[]>(getSql()`
    SELECT account_id, account_name, title, data, board_pinned_at FROM handoff_items
    WHERE kind = 'note' AND item_id LIKE 'skip:%' AND board_pinned_at IS NOT NULL AND board_done_at IS NULL
    ORDER BY (data ->> 'red') = '1' DESC, board_pinned_at DESC
    LIMIT 100
  `);
  return rows.map((row) => ({
    accountId: clean(row.account_id),
    accountName: clean(row.account_name),
    title: clean(row.title),
    nights: Number(row.data?.nights) || 1,
    red: row.data?.red === "1",
    since: new Date(row.board_pinned_at).toISOString(),
  }));
}

/** "Handled": the paper comes down (the Done tray); the next skip puts it back. */
export async function markSkipsHandled(accountId: string, by: string): Promise<boolean> {
  return finishPaper("note", skipPinId(accountId), by, true);
}
