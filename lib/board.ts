// The Office Pin Board: the shared words and rules for /board, /board/tv and
// /board/calendar. Plain TS with no server imports, so client components can
// use it directly. The database side is lib/pg/board.ts.

import { FLOW_STEPS, type FlowView } from "@/lib/accountFlow";
import type { SetupSummary } from "@/lib/setupWizard";

export type PaperKind = "account" | "extra" | "complaint" | "supply" | "note";

export const PAPER_KINDS: PaperKind[] = ["account", "extra", "complaint", "supply", "note"];

/** The four shared squares on the top row, left to right. A note has no shared square: it always hangs in a person's square. */
export const SHARED_SQUARES: { kind: Exclude<PaperKind, "note">; label: string }[] = [
  { kind: "account", label: "New accepted" },
  { kind: "extra", label: "Extra jobs" },
  { kind: "complaint", label: "Complaints" },
  { kind: "supply", label: "Supply orders" },
];

/** The few words printed on a paper, and the only thing besides the account name that TV mode shows. */
export const KIND_LABEL: Record<PaperKind, string> = {
  account: "New account",
  extra: "Extra job",
  complaint: "Complaint",
  supply: "Supply order",
  note: "To-do",
};

export type Paper = {
  kind: PaperKind;
  itemId: string;
  /** What kind of thing it is, when that is more exact than its kind: "Visit" on a pinned visit. "" = the kind's own name. */
  label: string;
  /** The big line on the paper: the account name, or the note itself. */
  title: string;
  accountId: string;
  accountName: string;
  /** One more short line: what was ordered, what the complaint is about. */
  detail: string;
  /** A few words printed on the paper itself: "3 items" on a supply order. */
  badge: string;
  /** "" = the shared square for its kind; otherwise the Staff ID of the manager who has it. */
  square: string;
  pinnedAt: string;
  pinnedBy: string;
  takenBy: string;
  takenAt: string;
  doneAt: string;
  doneBy: string;
  /** New accounts not in the 8-step flow: the setup wizard's screens done, out of how many. */
  progress: { done: number; total: number } | null;
  /** New accounts: the setup wizard's count and the gold "Ready to start" (lib/setupWizard.ts). null for every other paper. */
  setup?: SetupSummary | null;
  /** A new account made with "New Accepted Account": its 8-step pizza tracker. null for every other paper. */
  flow: FlowView | null;
  /** Red on the board and TV: a crew "Couldn't do" paper with the same item skipped 3 nights in a row (lib/pg/crew-skips.ts). */
  alert?: boolean;
  /**
   * Set only on the copy papersIn puts in "New accepted" for a new account
   * that is in a manager's square (it stays there too until Live). The same
   * paper, so it opens the same popup; drawn with "Handed to <manager>".
   */
  mirror?: boolean;
  /** The real record this paper opens. "" = the paper is all there is (a note). */
  href: string;
  /** A pinned account: its Admin (office) PDF, made fresh each time it is opened (no stored file). "" = none, and always "" on the TV. */
  pdfHref: string;
  /** A pinned record: who it is for and when it is due (YYYY-MM-DD). "" when not known. */
  forWho: string;
  dueDate: string;
  /** A pinned to-do that is Done: green check, comes down the next day. */
  recordDone: boolean;
  /** A sticky note added inside a shared box ("supply", "complaint", "account"): it hangs there. "" = the Office box. */
  box: string;
  /** The latest status someone gave it (migration 062). null = none yet. */
  status: PinStatus | null;
  /** Asked for a status and not answered yet: the "Status needed" tag. */
  statusNeeded: boolean;
};

/* ---------- the status check (migration 062, lib/pg/pin-status.ts) ---------- */

export type PinStatusKey = "on_it" | "waiting_customer" | "waiting_sub" | "done";

/** The big buttons, in order. */
export const PIN_STATUSES: { key: PinStatusKey; label: string }[] = [
  { key: "on_it", label: "On it" },
  { key: "waiting_customer", label: "Waiting on customer" },
  { key: "waiting_sub", label: "Waiting on sub" },
  { key: "done", label: "Done" },
];

export const isPinStatus = (value: string): value is PinStatusKey => PIN_STATUSES.some((entry) => entry.key === value);
export const pinStatusLabel = (key: string) => PIN_STATUSES.find((entry) => entry.key === key)?.label ?? "";

export type PinStatus = { key: PinStatusKey; note: string; by: string; at: string };

/** The note that goes with a status: one short line. */
export const STATUS_NOTE_MAX = 140;

/** One line of a pin's status history. */
export type PinStatusEvent = { event: "status" | "ask" | "owner"; status: string; note: string; by: string; at: string };

/** "Waiting on sub · Greg · Oct 27": the status line on a paper. */
export function statusLine(status: PinStatus): string {
  const day = new Date(status.at);
  const when = Number.isNaN(day.getTime()) ? "" : day.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  return [pinStatusLabel(status.key), status.by.split(/\s+/)[0] ?? "", when].filter(Boolean).join(" · ");
}

/** The shared boxes a plain sticky note can be added into. */
export const NOTE_BOXES = ["account", "complaint", "supply"] as const;

/** Past its due date and not done: the red corner. */
export function isOverdue(paper: Pick<Paper, "dueDate" | "recordDone">, now = new Date()): boolean {
  if (!paper.dueDate || paper.recordDone) return false;
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  return paper.dueDate < today;
}

/** This tab only: where the board was scrolled to, and the page a paper opened, so its back arrow returns to the board. */
export const BOARD_SCROLL_KEY = "cwBoardScroll";
export const BOARD_FROM_KEY = "cwBoardFrom";

/** "Oct 12" from YYYY-MM-DD. */
export function dueLabel(dueDate: string): string {
  const [y, m, d] = dueDate.split("-").map(Number);
  if (!y || !m || !d) return "";
  return new Date(y, m - 1, d).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/** The few words printed on a paper: its own label when it has one, else its kind's. */
export const paperLabel = (paper: Pick<Paper, "kind" | "label">) => paper.label || KIND_LABEL[paper.kind];

export type BoardManager = { id: string; name: string };

export type BoardSettings = {
  oldAfterDays: number;
  /** Days a finished paper stays in the Done tray before it moves to the Archive. */
  doneDays: number;
};

export const DEFAULT_BOARD_SETTINGS: BoardSettings = { oldAfterDays: 3, doneDays: 7 };

export type BoardMe = {
  name: string;
  /** My square: my Staff ID when I am one of the managers on the board, else "". */
  squareId: string;
  /** Only the owner changes the settings and the TV links. */
  isOwner: boolean;
};

export type BoardData = {
  settings: BoardSettings;
  me: BoardMe;
  managers: BoardManager[];
  /** Still pinned, oldest first. */
  papers: Paper[];
  /** The Done tray: finished in the last settings.doneDays days, newest first. Older ones are in the Archive. */
  done: Paper[];
  /** Migration 062 is in: pins take a status (the big buttons in a pin's card). */
  statusOn: boolean;
};

export type TvLink = { id: string; label: string; createdBy: string; createdAt: string; lastSeenAt: string; revokedAt: string; revokedBy: string };

const DAY_MS = 24 * 60 * 60 * 1000;

/** Whole days the paper has been on the board. */
export function daysPinned(paper: Pick<Paper, "pinnedAt">, now = new Date()): number {
  const since = new Date(paper.pinnedAt).getTime();
  if (Number.isNaN(since)) return 0;
  return Math.max(0, Math.floor((now.getTime() - since) / DAY_MS));
}

/** Stuck too long: yellowed, curled corner, red "X days" tag. */
export function isOld(paper: Pick<Paper, "pinnedAt">, settings: BoardSettings, now = new Date()): boolean {
  return daysPinned(paper, now) >= settings.oldAfterDays;
}

export function daysLabel(days: number): string {
  return days === 1 ? "1 day" : `${days} days`;
}

/**
 * A small, steady tilt for a paper, from its id: the same paper always hangs
 * the same way, so the board does not jump around on every refresh.
 */
export function paperTilt(itemId: string): number {
  let hash = 0;
  for (let i = 0; i < itemId.length; i++) hash = (hash * 31 + itemId.charCodeAt(i)) | 0;
  const steps = [-2.4, -1.6, -0.8, 0.6, 1.4, 2.2];
  return steps[Math.abs(hash) % steps.length];
}

/** The papers hanging in one square. */
/** A new account in the 8-step flow, handed to a manager and not Live yet: it also shows in "New accepted". */
export function stillNewAccepted(paper: Paper): boolean {
  return paper.kind === "account" && paper.square !== "" && paper.flow !== null && paper.flow.step !== "live";
}

export function papersIn(papers: Paper[], square: { shared: PaperKind } | { manager: string }): Paper[] {
  // A sticky note with no square hangs in the box it was added into, or in the Office box.
  if ("shared" in square) {
    const own = papers.filter((paper) => paper.square === "" && (paper.kind === "note" ? (paper.box || "note") === square.shared : paper.kind === square.shared));
    // "New accepted" keeps every new account until it is Live, also once it is handed to a manager.
    if (square.shared !== "account") return own;
    return [...own, ...papers.filter(stillNewAccepted).map((paper) => ({ ...paper, mirror: true }))];
  }
  return papers.filter((paper) => paper.square === square.manager);
}

/** "Step 3 of 8 · Confirm availability": where a new account is, for its copy in "New accepted". */
export function flowStepLine(paper: Paper): string {
  if (!paper.flow) return "";
  const steps = FLOW_STEPS.length - 1;
  const def = FLOW_STEPS[paper.flow.index];
  return paper.flow.step === "live" ? "Live" : `Step ${paper.flow.index + 1} of ${steps} · ${def?.action ?? ""}`;
}

export function sameDay(isoA: string, b: Date): boolean {
  const a = new Date(isoA);
  return !Number.isNaN(a.getTime()) && a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}
