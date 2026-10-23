// Papers the reminders put on the Pin Board by themselves (sub insurance,
// "At risk", price review, customer check-in). Server only.
//
// Each paper is a yellow note (handoff_items kind 'note', the same as a
// Markate estimate's paper), with an item_id that names the reason it is up,
// e.g. "coi-soon-<sub id>-2026-11-30". pinOnce never puts the same item_id up
// twice, so a paper someone took down stays down. takeDownPapers takes the
// papers that start with a prefix down, with the reason in the Done tray.

import { getSql } from "@/lib/db";
import { squareForManager, OFFICE_SQUARE } from "@/lib/boardPins";
import { listBoardManagers } from "@/lib/pg/board";

export type AutoPaper = {
  itemId: string;
  /** The big line on the paper. */
  title: string;
  /** The few words above it: "Insurance", "At risk". */
  label: string;
  /** One more short line. */
  notes: string;
  /** Where the paper opens. */
  href: string;
  /** A manager's Staff ID, or "" for the Office square. */
  square: string;
  accountId?: string;
  accountName?: string;
};

/** Puts the paper up, once. true when it went up now. */
export async function pinOnce(paper: AutoPaper): Promise<boolean> {
  const data = { label: paper.label, notes: paper.notes.slice(0, 600), href: paper.href, recordType: "reminder", box: "" };
  const rows = (await getSql()`
    INSERT INTO handoff_items (kind, item_id, title, account_id, account_name, manager, step, data, created_by, board_pinned_at, board_square)
    VALUES ('note', ${paper.itemId}, ${paper.title.slice(0, 300) || paper.label}, ${paper.accountId ?? ""}, ${paper.accountName ?? ""}, '', 'pinned',
            ${JSON.stringify(data)}::jsonb, 'Reminder', now(), ${paper.square})
    ON CONFLICT (kind, item_id) DO NOTHING
    RETURNING item_id
  `) as unknown[];
  return rows.length > 0;
}

/** Changes the short line on a paper that is up (a comment added later). */
export async function updatePaperNotes(itemId: string, notes: string): Promise<void> {
  await getSql()`
    UPDATE handoff_items SET data = data || jsonb_build_object('notes', ${notes.slice(0, 600)}::text)
    WHERE kind = 'note' AND item_id = ${itemId}
  `;
}

/** Takes down every paper still up whose item_id starts with the prefix. */
export async function takeDownPapers(prefix: string, why: string): Promise<number> {
  const rows = (await getSql()`
    UPDATE handoff_items SET board_done_at = now(), board_done_by = ${why.slice(0, 120)}
    WHERE kind = 'note' AND left(item_id, ${prefix.length}) = ${prefix} AND board_pinned_at IS NOT NULL AND board_done_at IS NULL
    RETURNING item_id
  `) as unknown[];
  return rows.length;
}

/** The square of the manager with this name; the Office square when they have none. */
export async function managerSquareFinder(): Promise<(managerName: string) => string> {
  const managers = await listBoardManagers().catch(() => []);
  return (managerName: string) => (managerName.trim() ? squareForManager(managers, managerName) : OFFICE_SQUARE);
}
