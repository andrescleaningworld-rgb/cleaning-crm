// The Office Pin Board: the shared words and rules for /board, /board/tv and
// /board/calendar. Plain TS with no server imports, so client components can
// use it directly. The database side is lib/pg/board.ts.

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
  /** New accounts only: Onboarding Checklist items ticked, out of how many. */
  progress: { done: number; total: number } | null;
  /** The real record this paper opens. "" = the paper is all there is (a note). */
  href: string;
  /** A pinned record: who it is for and when it is due (YYYY-MM-DD). "" when not known. */
  forWho: string;
  dueDate: string;
  /** A pinned to-do that is Done: green check, comes down the next day. */
  recordDone: boolean;
};

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

export type BoardSettings = { oldAfterDays: number };

export const DEFAULT_BOARD_SETTINGS: BoardSettings = { oldAfterDays: 3 };

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
  /** The Done tray: unpinned in the last 30 days, newest first. */
  done: Paper[];
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
export function papersIn(papers: Paper[], square: { shared: PaperKind } | { manager: string }): Paper[] {
  if ("shared" in square) return papers.filter((paper) => paper.square === "" && paper.kind === square.shared);
  return papers.filter((paper) => paper.square === square.manager);
}

export function sameDay(isoA: string, b: Date): boolean {
  const a = new Date(isoA);
  return !Number.isNaN(a.getTime()) && a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}
