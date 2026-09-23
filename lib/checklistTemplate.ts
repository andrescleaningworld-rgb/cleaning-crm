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
};

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
};

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
};

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

    sectionsByKey.get(sectionKey)!.items.push({
      key: itemKey,
      label: itemLabel,
      ...(subNote ? { subNote } : {}),
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
