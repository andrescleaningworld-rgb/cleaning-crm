// Shared Porter/Cleaning Checklist domain definitions — imported by both the
// client-side editor/porter-form components and the server-side API routes,
// so the section/item shape never drifts between what's rendered, what's
// uploaded, and what's stored. Deliberately plain TS with no server-only
// imports (no @neondatabase/serverless, no env reads) so client components
// can import it directly. Mirrors lib/onboardingChecklist.ts's shape, but
// sections/items here are per-account and editable rather than hardcoded.

import { TEAM_HUB_TIMEZONE } from "@/lib/teamHubTimezone";

export type ChecklistItemDef = {
  key: string;
  label: string;
  subNote?: string;
  /** "Must do every night": the crew sees it at the top with a star. Set by staff in the Crew Link editor. */
  mustDo?: boolean;
  // Route tabs (one row per item, in route order, only tonight's rows). Set
  // by the uploaded file; any of time / days / photo / choices / kind makes
  // the tab a route tab (isRouteTab). Tabs without them work as before.
  /** Spanish line written by the office (shown under the English; skips the automatic translation). */
  es?: string;
  subNoteEs?: string;
  /** "6:00": shown at the left of the row. */
  time?: string;
  /** "Mon", "Mon,Wed", "1st Thu", "last Fri": the row shows only on those nights (office time). No days = every night. */
  days?: string;
  /** Rows with the same slot share a time: on a night when a monthly row ("1st Thu") of the slot shows, its weekday rows don't. */
  slot?: string;
  /** The row needs a photo before it can be checked. */
  photo?: boolean;
  /** Tap buttons instead of a checkbox, each Not full / Full (the dumpsters). */
  choices?: string[];
  choicesEs?: string[];
  /** A special row: "urgent" = the Urgent request button, "night_note" = the note for the night crew. */
  kind?: RouteRowKind;
  /** Urgent request quick picks (kind "urgent"). */
  what?: string[];
  whatEs?: string[];
  who?: string[];
  whoEs?: string[];
};

export const ROUTE_ROW_KINDS = ["urgent", "night_note"] as const;
export type RouteRowKind = (typeof ROUTE_ROW_KINDS)[number];

export type ChecklistSectionDef = {
  key: string;
  title: string;
  items: ChecklistItemDef[];
};

// Crew Link tabs: an account can have several checklists, each with its own
// name and sections, all on the same crew link (checklist_tabs table — see
// scripts/setup-checklist-tabs-db.js). Every tab is submitted on its own.
export type ChecklistTabDef = {
  id: number;
  name: string;
  sections: ChecklistSectionDef[];
};

// Counts active tabs only — soft-deleted tabs don't count.
export const MAX_TABS = 10;
export const MAX_TAB_NAME_LENGTH = 40;
export const DEFAULT_TAB_NAME = "Checklist";

export function cleanTabName(value: unknown): string {
  return String(value ?? "").trim().slice(0, MAX_TAB_NAME_LENGTH);
}

export function countTabItems(tab: { sections: ChecklistSectionDef[] }): number {
  return tab.sections.reduce((sum, section) => sum + section.items.length, 0);
}

/* ---------- route tabs ---------- */

/** A tab that uses any route field gets the route screen (CrewRoute.tsx); every other tab keeps the classic screen. */
export function isRouteTab(tab: { sections: ChecklistSectionDef[] }): boolean {
  return tab.sections.some((section) =>
    section.items.some((item) => Boolean(item.time || item.days || item.photo || item.choices?.length || item.kind))
  );
}

const WEEKDAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
const ORDINALS: Record<string, number> = { "1st": 1, "2nd": 2, "3rd": 3, "4th": 4, "5th": 5, last: -1 };

/** A night in office time: weekday 0 (Sun) – 6, day of the month, days in the month. */
export type RouteNight = { weekday: number; day: number; daysInMonth: number; dateKey: string };

export function routeNightOf(date: Date, timeZone = TEAM_HUB_TIMEZONE): RouteNight {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "numeric", day: "numeric", weekday: "short" }).formatToParts(date);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  const year = Number(get("year"));
  const month = Number(get("month"));
  const day = Number(get("day"));
  return {
    weekday: WEEKDAYS.indexOf(get("weekday").toLowerCase().slice(0, 3)),
    day,
    daysInMonth: new Date(Date.UTC(year, month, 0)).getUTCDate(),
    dateKey: `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
  };
}

type DayRule = { weekday: number; nth: number | null };

/** "Mon,Wed" / "1st Thu" / "last Fri" → rules. A part that can't be read is dropped. */
export function parseDays(days: string): DayRule[] {
  return days
    .split(/[,;/]/)
    .map((part) => part.trim().toLowerCase().split(/\s+/).filter(Boolean))
    .flatMap((words): DayRule[] => {
      if (words.length === 1) {
        const weekday = WEEKDAYS.indexOf(words[0].slice(0, 3));
        return weekday >= 0 ? [{ weekday, nth: null }] : [];
      }
      if (words.length === 2 && words[0] in ORDINALS) {
        const weekday = WEEKDAYS.indexOf(words[1].slice(0, 3));
        return weekday >= 0 ? [{ weekday, nth: ORDINALS[words[0]] }] : [];
      }
      return [];
    });
}

function ruleMatches(rule: DayRule, night: RouteNight): boolean {
  if (rule.weekday !== night.weekday) return false;
  if (rule.nth === null) return true;
  if (rule.nth === -1) return night.day + 7 > night.daysInMonth;
  return Math.ceil(night.day / 7) === rule.nth;
}

/** "Mon" / "1st Thu" is readable (the upload refuses a days value it can't read). */
export const daysAreValid = (days: string) => days.split(/[,;/]/).filter((part) => part.trim()).length === parseDays(days).length && parseDays(days).length > 0;

/**
 * Tonight's rows, in order: rows with no days, and rows whose days match.
 * In a slot, a monthly row that matches tonight replaces the weekday rows.
 * Special rows (kind) are left out: the route screen shows them on their own.
 */
export function rowsForNight(sections: ChecklistSectionDef[], night: RouteNight): ChecklistItemDef[] {
  const all = sections.flatMap((section) => section.items).filter((item) => !item.kind);
  const monthlySlots = new Set<string>();
  for (const item of all) {
    if (item.slot && item.days && parseDays(item.days).some((rule) => rule.nth !== null && ruleMatches(rule, night))) monthlySlots.add(item.slot);
  }
  return all.filter((item) => {
    if (!item.days) return true;
    const matching = parseDays(item.days).filter((rule) => ruleMatches(rule, night));
    if (matching.length === 0) return false;
    // A weekday row gives way to its slot's monthly row tonight.
    if (item.slot && monthlySlots.has(item.slot)) return matching.some((rule) => rule.nth !== null);
    return true;
  });
}

/** The tab's special row of this kind (the first one), if any. */
export function routeSpecialRow(sections: ChecklistSectionDef[], kind: RouteRowKind): ChecklistItemDef | null {
  for (const section of sections) for (const item of section.items) if (item.kind === kind) return item;
  return null;
}

// Checklist times for staff screens and the PDF. New submissions record
// them automatically (started = crew's first checkbox tap, finished = Send);
// older ones keep the Time In / Time Out the crew typed.
export function describeWorkTimes(submission: {
  startedAt: string | null;
  submittedAt: string;
  timeIn: string;
  timeOut: string;
}): { startLabel: string; start: string; endLabel: string; end: string } {
  if (submission.startedAt) {
    const format = (iso: string) => {
      const date = new Date(iso);
      if (Number.isNaN(date.getTime())) return "—";
      return date.toLocaleTimeString("en-US", { timeZone: TEAM_HUB_TIMEZONE, hour: "numeric", minute: "2-digit" });
    };
    return { startLabel: "Started", start: format(submission.startedAt), endLabel: "Finished", end: format(submission.submittedAt) };
  }
  return { startLabel: "Time In", start: submission.timeIn || "—", endLabel: "Time Out", end: submission.timeOut || "—" };
}

// A submission snapshots each item's label/subNote as of submission time
// (see items_snapshot_json) alongside the porter's checked state and note,
// so a later template edit/upload never rewrites history.
export type ChecklistSubmissionItemState = ChecklistItemDef & {
  checked: boolean;
  note: string;
  /** "Some things I couldn't do": why this one was not done (unchecked items only). */
  skipReason?: SkipReason;
  /** Route rows: the crew photos taken on this row (their phone-made ids; photo_index source_key "crew:<id>"). */
  photos?: string[];
  /** Filled in when staff read a submission: the photos' addresses (not stored). */
  photoUrls?: { url: string; thumbUrl: string }[];
  /** Not a task (an urgent request): left out of the done count and of skips. */
  info?: boolean;
};

/** The crew's one-tap reasons for a skipped item on the classic screen. */
export const SKIP_REASONS = ["no_time", "blocked", "no_supplies", "other"] as const;
/** The route screen's picks: Locked (= blocked) / Occupied / No time / Other. */
export const ROUTE_SKIP_REASONS = ["blocked", "occupied", "no_time", "other"] as const;
export type SkipReason = (typeof SKIP_REASONS)[number] | "occupied";
export const isSkipReason = (value: unknown): value is SkipReason => SKIP_REASONS.includes(value as (typeof SKIP_REASONS)[number]) || value === "occupied";
/** The office's words for a reason (the Pin Board, Accounts Center). */
export const SKIP_REASON_WORDS: Record<SkipReason, string> = { no_time: "No time", blocked: "Blocked / locked", no_supplies: "No supplies", other: "Other", occupied: "Occupied" };

/** Must-do items first, the rest in their order (a stable sort). */
export function mustDoFirst<T extends { mustDo?: boolean }>(items: T[]): T[] {
  return [...items.filter((item) => item.mustDo), ...items.filter((item) => !item.mustDo)];
}

export type ChecklistSubmissionSection = {
  key: string;
  title: string;
  items: ChecklistSubmissionItemState[];
};

const MAX_UPLOAD_ROWS = 500;

export function slugifyKey(value: string): string {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "item";
}

export function countSubmissionProgress(sections: ChecklistSubmissionSection[]): { done: number; total: number } {
  let done = 0;
  let total = 0;
  for (const section of sections) {
    for (const item of section.items) {
      if (item.info) continue;
      total += 1;
      if (item.checked) done += 1;
    }
  }
  return { done, total };
}

// Live progress while a porter is still filling out the form — the template
// itself has no checked state, so it's tracked separately by item key.
export function countTemplateProgress(
  sections: ChecklistSectionDef[],
  checkedKeys: Set<string>
): { done: number; total: number } {
  let done = 0;
  let total = 0;
  for (const section of sections) {
    for (const item of section.items) {
      total += 1;
      if (checkedKeys.has(item.key)) done += 1;
    }
  }
  return { done, total };
}

export type UploadedChecklistRow = {
  section: string;
  item: string;
  sub_note?: string;
  // Route fields (JSON uploads only); see ChecklistItemDef.
  es?: unknown;
  sub_note_es?: unknown;
  time?: unknown;
  days?: unknown;
  slot?: unknown;
  photo?: unknown;
  choices?: unknown;
  choices_es?: unknown;
  type?: unknown;
  what?: unknown;
  what_es?: unknown;
  who?: unknown;
  who_es?: unknown;
};

const MAX_ROUTE_TEXT = 200;
const MAX_ROUTE_LIST = 12;

const routeText = (value: unknown) => (typeof value === "string" ? value.trim().slice(0, MAX_ROUTE_TEXT) : "");
const routeList = (value: unknown): string[] => (Array.isArray(value) ? value.map(routeText).filter(Boolean).slice(0, MAX_ROUTE_LIST) : []);

/** The route fields of one uploaded row, or why the row is wrong. */
function routeFieldsOf(row: UploadedChecklistRow, rowNumber: number): { ok: true; fields: Partial<ChecklistItemDef> } | { ok: false; error: string } {
  const fields: Partial<ChecklistItemDef> = {};
  const es = routeText(row.es);
  const subNoteEs = routeText(row.sub_note_es);
  const time = routeText(row.time);
  const days = routeText(row.days);
  const slot = routeText(row.slot);
  if (es) fields.es = es;
  if (subNoteEs) fields.subNoteEs = subNoteEs;
  if (time) {
    if (!/^\d{1,2}:\d{2}(\s?[ap]m)?$/i.test(time)) return { ok: false, error: `Row ${rowNumber}: time "${time}" should look like 6:00 or 6:00 pm.` };
    fields.time = time;
  }
  if (days) {
    if (!daysAreValid(days)) return { ok: false, error: `Row ${rowNumber}: days "${days}" should look like Mon, Mon,Wed or 1st Thu.` };
    fields.days = days;
  }
  if (slot) fields.slot = slot;
  if (row.photo === true) fields.photo = true;
  const choices = routeList(row.choices);
  if (choices.length) {
    fields.choices = choices;
    const choicesEs = routeList(row.choices_es);
    if (choicesEs.length) fields.choicesEs = choicesEs;
  }
  const type = routeText(row.type);
  if (type) {
    if (!ROUTE_ROW_KINDS.includes(type as RouteRowKind)) return { ok: false, error: `Row ${rowNumber}: type "${type}" should be urgent or night_note.` };
    fields.kind = type as RouteRowKind;
    if (type === "urgent") {
      const what = routeList(row.what);
      const who = routeList(row.who);
      if (!what.length || !who.length) return { ok: false, error: `Row ${rowNumber}: an urgent row needs "what" and "who" lists.` };
      fields.what = what;
      fields.who = who;
      const whatEs = routeList(row.what_es);
      const whoEs = routeList(row.who_es);
      if (whatEs.length) fields.whatEs = whatEs;
      if (whoEs.length) fields.whoEs = whoEs;
    }
  }
  return { ok: true, fields };
}

export type ChecklistUploadResult =
  | { ok: true; sections: ChecklistSectionDef[] }
  | { ok: false; error: string };

// Groups a flat list of {section, item, sub_note} rows (in first-seen
// section order) into nested ChecklistSectionDef[]. Item keys are slugified
// from "section-item" plus a running index to guarantee uniqueness even
// when two rows share a label.
export function buildSectionsFromRows(rows: UploadedChecklistRow[]): ChecklistUploadResult {
  if (!Array.isArray(rows) || rows.length === 0) {
    return { ok: false, error: "The uploaded file has no rows." };
  }
  if (rows.length > MAX_UPLOAD_ROWS) {
    return { ok: false, error: `The uploaded file has ${rows.length} rows — the max is ${MAX_UPLOAD_ROWS}.` };
  }

  const sectionsByKey = new Map<string, ChecklistSectionDef>();
  const order: string[] = [];
  const usedItemKeys = new Set<string>();

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const sectionTitle = (row?.section ?? "").toString().trim();
    const itemLabel = (row?.item ?? "").toString().trim();
    const subNote = (row?.sub_note ?? "").toString().trim();

    if (!sectionTitle || !itemLabel) {
      return { ok: false, error: `Row ${i + 1} is missing a section or item value.` };
    }

    const sectionKey = slugifyKey(sectionTitle);
    if (!sectionsByKey.has(sectionKey)) {
      sectionsByKey.set(sectionKey, { key: sectionKey, title: sectionTitle, items: [] });
      order.push(sectionKey);
    }

    let itemKey = `${sectionKey}.${slugifyKey(itemLabel)}`;
    let dedupeSuffix = 2;
    while (usedItemKeys.has(itemKey)) {
      itemKey = `${sectionKey}.${slugifyKey(itemLabel)}-${dedupeSuffix}`;
      dedupeSuffix += 1;
    }
    usedItemKeys.add(itemKey);

    const route = routeFieldsOf(row, i + 1);
    if (!route.ok) return { ok: false, error: route.error };

    sectionsByKey.get(sectionKey)!.items.push({
      key: itemKey,
      label: itemLabel,
      ...(subNote ? { subNote } : {}),
      ...route.fields,
    });
  }

  return { ok: true, sections: order.map((key) => sectionsByKey.get(key)!) };
}

// Minimal CSV parser — handles quoted fields with embedded commas, since no
// CSV library is installed anywhere else in this codebase and the expected
// input (section, item, sub_note) is simple enough not to need one.
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += c;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((cell) => cell.trim().length > 0));
}

// Accepts either a CSV (with a "section,item,sub_note" header row) or a JSON
// array of {section, item, sub_note} objects — both described as the
// expected upload formats to staff. Returns a clear, specific error instead
// of throwing, so the caller can surface it without corrupting the existing
// template.
export function parseUploadedChecklistFile(text: string, filename: string): ChecklistUploadResult {
  const trimmed = text.trim();
  if (!trimmed) {
    return { ok: false, error: "The uploaded file is empty." };
  }

  const looksLikeJson = filename.toLowerCase().endsWith(".json") || trimmed.startsWith("[");
  if (looksLikeJson) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      return { ok: false, error: "The uploaded file is not valid JSON." };
    }
    if (!Array.isArray(parsed)) {
      return { ok: false, error: "Expected a JSON array of {section, item, sub_note} objects." };
    }
    const rows: UploadedChecklistRow[] = parsed.map((entry) => ({
      ...(entry && typeof entry === "object" ? entry : {}),
      section: typeof entry?.section === "string" ? entry.section : "",
      item: typeof entry?.item === "string" ? entry.item : "",
      sub_note: typeof entry?.sub_note === "string" ? entry.sub_note : "",
    }));
    return buildSectionsFromRows(rows);
  }

  const csvRows = parseCsv(trimmed);
  if (csvRows.length === 0) {
    return { ok: false, error: "The uploaded CSV has no rows." };
  }

  const header = csvRows[0].map((h) => h.trim().toLowerCase());
  const sectionIdx = header.indexOf("section");
  const itemIdx = header.indexOf("item");
  const subNoteIdx = header.indexOf("sub_note");

  if (sectionIdx === -1 || itemIdx === -1) {
    return { ok: false, error: 'CSV header must include "section" and "item" columns (sub_note is optional).' };
  }

  const dataRows = csvRows.slice(1).map((cells) => ({
    section: cells[sectionIdx] ?? "",
    item: cells[itemIdx] ?? "",
    sub_note: subNoteIdx !== -1 ? cells[subNoteIdx] ?? "" : "",
  }));

  return buildSectionsFromRows(dataRows);
}

// Validates a manually-built sections array (e.g. before saveTemplate),
// same rules as an upload — non-empty, every item has a label, sane size.
export function validateSections(sections: unknown): ChecklistUploadResult {
  if (!Array.isArray(sections) || sections.length === 0) {
    return { ok: false, error: "The checklist must have at least one section." };
  }
  let itemCount = 0;
  for (const section of sections) {
    if (!section || typeof section !== "object") return { ok: false, error: "Malformed section entry." };
    const s = section as Partial<ChecklistSectionDef>;
    if (!s.title || !s.key) return { ok: false, error: "Every section needs a title." };
    if (!Array.isArray(s.items) || s.items.length === 0) {
      return { ok: false, error: `Section "${s.title}" has no items.` };
    }
    for (const item of s.items) {
      itemCount += 1;
      if (!item || typeof item !== "object" || !item.key || !item.label) {
        return { ok: false, error: `Section "${s.title}" has an item missing a label.` };
      }
    }
  }
  if (itemCount > MAX_UPLOAD_ROWS) {
    return { ok: false, error: `The checklist has ${itemCount} items — the max is ${MAX_UPLOAD_ROWS}.` };
  }
  return { ok: true, sections: sections as ChecklistSectionDef[] };
}

export function generatePorterCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I to avoid transcription errors
  let code = "";
  const bytes = new Uint8Array(8);
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  for (let i = 0; i < bytes.length; i++) {
    code += alphabet[bytes[i] % alphabet.length];
  }
  return code;
}
