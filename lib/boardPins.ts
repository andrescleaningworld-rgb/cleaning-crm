// "Pin to board" as a setting (Settings -> Pin Board): which kinds of record
// offer a "Pin to board" switch and button, and whether a new one is pinned
// by default. Plain TS with no server imports, so client components can use
// it directly. The database side is in lib/pg/board.ts.
//
// Pinning never touches the record itself: a pinned to-do or visit is a
// paper that points at it. Unpinning or Done on the board changes the paper
// only.

export type PinType = "todo" | "complaint" | "supply" | "visit" | "account" | "update" | "packet";

export type PinTypeSetting = { show: boolean; pinned: boolean };

export type PinTypes = Record<PinType, PinTypeSetting>;

export const PIN_TYPES: {
  type: PinType;
  label: string;
  /** One record of this kind, as printed on the paper. */
  one: string;
  /** False = its records are still saved through Apps Script, so it cannot be pinned from here yet. */
  available: boolean;
}[] = [
  { type: "todo", label: "To-dos", one: "To-do", available: true },
  { type: "complaint", label: "Complaints", one: "Complaint", available: true },
  { type: "supply", label: "Supply orders", one: "Supply order", available: true },
  { type: "visit", label: "Visits", one: "Visit", available: true },
  { type: "account", label: "Accounts", one: "Account", available: true },
  // Account Updates and the New Account packet are still saved by Apps Script.
  // Pinning one would need its record in Postgres first.
  { type: "update", label: "Account Updates", one: "Account update", available: false },
  { type: "packet", label: "New Account packet", one: "New account packet", available: false },
];

export const NOT_AVAILABLE_YET = "Available after tonight's update";

/** To-dos start switched on (not pinned by default); everything else starts off. */
export const DEFAULT_PIN_TYPES: PinTypes = {
  todo: { show: true, pinned: false },
  complaint: { show: false, pinned: false },
  supply: { show: false, pinned: false },
  visit: { show: false, pinned: false },
  account: { show: false, pinned: false },
  update: { show: false, pinned: false },
  packet: { show: false, pinned: false },
};

export const isPinType = (value: string): value is PinType => PIN_TYPES.some((entry) => entry.type === value);

/** What is saved, laid over the defaults. A type that cannot be pinned yet is always off. */
export function readPinTypes(saved: unknown): PinTypes {
  const result = { ...DEFAULT_PIN_TYPES };
  const source = saved && typeof saved === "object" ? (saved as Record<string, { show?: unknown; pinned?: unknown }>) : {};
  for (const entry of PIN_TYPES) {
    const row = source[entry.type];
    const base = DEFAULT_PIN_TYPES[entry.type];
    const show = entry.available && (row && typeof row.show === "boolean" ? row.show : base.show);
    // "Pinned by default" means nothing while the type is not shown.
    const pinned = show && (row && typeof row.pinned === "boolean" ? row.pinned : base.pinned);
    result[entry.type] = { show, pinned };
  }
  return result;
}

/** The square a pin goes to: "" is the Office square; otherwise a manager's Staff ID. */
export const OFFICE_SQUARE = "";
export const OFFICE_LABEL = "Office";

/** What the screens need to offer "Pin to board". */
export type PinInfo = {
  types: PinTypes;
  managers: { id: string; name: string }[];
  /** Per type, the ids of the records that are on the board right now. */
  pinned: Partial<Record<PinType, string[]>>;
};

export type PinRequest = {
  type: PinType;
  recordId: string;
  /** The big line on the paper. */
  title: string;
  accountId?: string;
  accountName?: string;
  /** "" = Office. */
  square: string;
  /** Printed on the paper: who it is for, and when it is due (YYYY-MM-DD). */
  forWho?: string;
  dueDate?: string;
};

/** The square a record's manager owns, by name; Office when that manager has no square. */
export function squareForManager(managers: { id: string; name: string }[], managerName: string): string {
  const wanted = managerName.trim().toLowerCase();
  if (!wanted) return OFFICE_SQUARE;
  const plain = (text: string) =>
    text
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "");
  return managers.find((manager) => plain(manager.name) === plain(wanted))?.id ?? OFFICE_SQUARE;
}
