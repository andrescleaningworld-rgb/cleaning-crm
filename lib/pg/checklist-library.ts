// Checklists saved to reuse (migration 090). The built-in ones are in
// lib/checklistStarters.ts and work before it runs. Server only.

import { getSql } from "@/lib/db";
import type { ChecklistSectionDef } from "@/lib/checklistTemplate";

export type LibraryChecklist = { id: number; name: string; sections: ChecklistSectionDef[] };

let ready = false;
export async function checklistLibraryReady(): Promise<boolean> {
  if (ready) return true;
  const rows = (await getSql()`SELECT to_regclass('public.checklist_library') IS NOT NULL AS ok`) as { ok: boolean }[];
  ready = rows[0]?.ok === true;
  return ready;
}

export async function listLibrary(): Promise<LibraryChecklist[]> {
  if (!(await checklistLibraryReady())) return [];
  const rows = (await getSql()`SELECT id, name, sections_json FROM checklist_library WHERE deleted_at IS NULL ORDER BY lower(name)`) as { id: string | number; name: string; sections_json: ChecklistSectionDef[] }[];
  return rows.map((row) => ({ id: Number(row.id), name: row.name, sections: Array.isArray(row.sections_json) ? row.sections_json : [] }));
}

/** Saves under this name. The same name again replaces it. */
export async function saveToLibrary(name: string, sections: ChecklistSectionDef[], by: string): Promise<void> {
  const clean = name.trim().slice(0, 60);
  const sql = getSql();
  const updated = (await sql`
    UPDATE checklist_library SET sections_json = ${JSON.stringify(sections)}::jsonb, created_by = ${by}, created_at = now()
    WHERE lower(btrim(name)) = lower(${clean}) AND deleted_at IS NULL RETURNING id
  `) as unknown[];
  if (updated.length === 0) await sql`INSERT INTO checklist_library (name, sections_json, created_by) VALUES (${clean}, ${JSON.stringify(sections)}::jsonb, ${by})`;
}
