// Server-only Postgres query layer for the Porter/Cleaning Checklist module
// (checklist_templates / checklist_submissions tables — see
// scripts/setup-checklist-db.js). Mirrors the one-file-per-feature,
// typed-function convention used in lib/googleSheets.ts, just backed by
// Neon Postgres instead of Sheets. There is deliberately no "active"/
// "enabled" column here — whether an account's checklist is live is always
// derived from the Accounts sheet's checklistNeeded flag (see
// getMainAccountById / setAccountChecklistNeeded in lib/googleSheets.ts), so
// there's a single source of truth for that and disabling an account can
// never delete or hide rows here.

import { getSql } from "@/lib/db";
import {
  generatePorterCode,
  type ChecklistSectionDef,
  type ChecklistSubmissionSection,
} from "@/lib/checklistTemplate";

export type ChecklistTemplateRow = {
  accountId: string;
  accountName: string;
  locationName: string;
  porterCode: string;
  sections: ChecklistSectionDef[];
  createdAt: string;
  updatedAt: string;
};

function rowToTemplate(row: Record<string, unknown>): ChecklistTemplateRow {
  return {
    accountId: row.account_id as string,
    accountName: row.account_name as string,
    locationName: row.location_name as string,
    porterCode: row.porter_code as string,
    sections: (row.sections_json as ChecklistSectionDef[]) ?? [],
    createdAt: (row.created_at as Date | string) instanceof Date ? (row.created_at as Date).toISOString() : String(row.created_at),
    updatedAt: (row.updated_at as Date | string) instanceof Date ? (row.updated_at as Date).toISOString() : String(row.updated_at),
  };
}

export async function getTemplateByAccountId(accountId: string): Promise<ChecklistTemplateRow | null> {
  const sql = getSql();
  const rows = await sql`SELECT * FROM checklist_templates WHERE account_id = ${accountId} LIMIT 1`;
  return rows.length > 0 ? rowToTemplate(rows[0] as Record<string, unknown>) : null;
}

export async function getTemplateByPorterCode(porterCode: string): Promise<ChecklistTemplateRow | null> {
  const sql = getSql();
  const rows = await sql`SELECT * FROM checklist_templates WHERE porter_code = ${porterCode} LIMIT 1`;
  return rows.length > 0 ? rowToTemplate(rows[0] as Record<string, unknown>) : null;
}

// Idempotent create-if-missing — the porter_code, once generated, is stable
// across future disable/re-enable cycles so a previously shared link keeps
// working if the account is re-flagged later.
export async function ensureTemplate(accountId: string, accountName: string): Promise<ChecklistTemplateRow> {
  const existing = await getTemplateByAccountId(accountId);
  if (existing) return existing;

  const sql = getSql();
  const porterCode = generatePorterCode();
  const rows = await sql`
    INSERT INTO checklist_templates (account_id, account_name, location_name, porter_code, sections_json)
    VALUES (${accountId}, ${accountName}, ${accountName}, ${porterCode}, '[]'::jsonb)
    ON CONFLICT (account_id) DO UPDATE SET account_name = EXCLUDED.account_name
    RETURNING *
  `;
  return rowToTemplate(rows[0] as Record<string, unknown>);
}

export async function saveTemplateSections(
  accountId: string,
  locationName: string,
  sections: ChecklistSectionDef[]
): Promise<ChecklistTemplateRow> {
  const sql = getSql();
  const rows = await sql`
    UPDATE checklist_templates
    SET location_name = ${locationName}, sections_json = ${JSON.stringify(sections)}::jsonb, updated_at = now()
    WHERE account_id = ${accountId}
    RETURNING *
  `;
  if (rows.length === 0) {
    throw new Error(`saveTemplateSections: no template found for account "${accountId}" — call ensureTemplate first`);
  }
  return rowToTemplate(rows[0] as Record<string, unknown>);
}

export type NewSubmissionInput = {
  accountId: string;
  accountName: string;
  locationName: string;
  porterName: string;
  weekOf: string | null;
  timeIn: string;
  timeOut: string;
  generalNotes: string;
  sections: ChecklistSubmissionSection[];
  completedCount: number;
  totalCount: number;
};

export async function insertSubmission(input: NewSubmissionInput): Promise<number> {
  const sql = getSql();
  const rows = await sql`
    INSERT INTO checklist_submissions (
      account_id, account_name, location_name, porter_name, week_of, time_in, time_out,
      completed_count, total_count, general_notes, items_snapshot_json
    ) VALUES (
      ${input.accountId}, ${input.accountName}, ${input.locationName}, ${input.porterName},
      ${input.weekOf}, ${input.timeIn}, ${input.timeOut},
      ${input.completedCount}, ${input.totalCount}, ${input.generalNotes},
      ${JSON.stringify(input.sections)}::jsonb
    )
    RETURNING id
  `;
  return (rows[0] as { id: number }).id;
}

export type SubmissionSummary = {
  id: number;
  accountId: string;
  accountName: string;
  locationName: string;
  porterName: string;
  weekOf: string | null;
  timeIn: string;
  timeOut: string;
  completedCount: number;
  totalCount: number;
  generalNotes: string;
  submittedAt: string;
};

export type SubmissionDetail = SubmissionSummary & {
  sections: ChecklistSubmissionSection[];
};

function rowToSummary(row: Record<string, unknown>): SubmissionSummary {
  return {
    id: row.id as number,
    accountId: row.account_id as string,
    accountName: row.account_name as string,
    locationName: row.location_name as string,
    porterName: row.porter_name as string,
    weekOf: row.week_of ? (row.week_of instanceof Date ? row.week_of.toISOString().slice(0, 10) : String(row.week_of)) : null,
    timeIn: (row.time_in as string) ?? "",
    timeOut: (row.time_out as string) ?? "",
    completedCount: row.completed_count as number,
    totalCount: row.total_count as number,
    generalNotes: (row.general_notes as string) ?? "",
    submittedAt: (row.submitted_at as Date | string) instanceof Date ? (row.submitted_at as Date).toISOString() : String(row.submitted_at),
  };
}

export async function listSubmissions(accountId?: string): Promise<SubmissionSummary[]> {
  const sql = getSql();
  const rows = accountId
    ? await sql`
        SELECT id, account_id, account_name, location_name, porter_name, week_of, time_in, time_out,
               completed_count, total_count, general_notes, submitted_at
        FROM checklist_submissions
        WHERE account_id = ${accountId}
        ORDER BY submitted_at DESC
        LIMIT 200
      `
    : await sql`
        SELECT id, account_id, account_name, location_name, porter_name, week_of, time_in, time_out,
               completed_count, total_count, general_notes, submitted_at
        FROM checklist_submissions
        ORDER BY submitted_at DESC
        LIMIT 200
      `;
  return rows.map((r) => rowToSummary(r as Record<string, unknown>));
}

export async function getSubmissionDetail(id: number): Promise<SubmissionDetail | null> {
  const sql = getSql();
  const rows = await sql`SELECT * FROM checklist_submissions WHERE id = ${id} LIMIT 1`;
  if (rows.length === 0) return null;
  const row = rows[0] as Record<string, unknown>;
  return {
    ...rowToSummary(row),
    sections: (row.items_snapshot_json as ChecklistSubmissionSection[]) ?? [],
  };
}
