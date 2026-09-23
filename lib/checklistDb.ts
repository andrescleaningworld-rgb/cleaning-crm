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
  DEFAULT_TAB_NAME,
  MAX_TABS,
  generatePorterCode,
  type ChecklistSectionDef,
  type ChecklistSubmissionSection,
  type ChecklistTabDef,
} from "@/lib/checklistTemplate";

export type ChecklistTemplateRow = {
  accountId: string;
  accountName: string;
  locationName: string;
  porterCode: string;
  sections: ChecklistSectionDef[];
  // Crew Link modules (docs/crew-link-spec.md) — stored here, never in
  // Sheets. The checklist module itself stays on the Sheets flag above.
  supplyOrdersEnabled: boolean;
  problemReportsEnabled: boolean;
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
    supplyOrdersEnabled: row.supply_orders_enabled === true,
    problemReportsEnabled: row.problem_reports_enabled === true,
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
  await ensureFirstTab(accountId);
  return rowToTemplate(rows[0] as Record<string, unknown>);
}

// ---------------------------------------------------------------------------
// Tabs (checklist_tabs). checklist_templates.sections_json is kept as a copy
// of the first active tab (lowest position, not deleted) after every tab
// write, so it never goes stale and older code reading it stays correct.
// ---------------------------------------------------------------------------

function rowToTab(row: Record<string, unknown>): ChecklistTabDef {
  return {
    id: row.id as number,
    name: row.name as string,
    sections: (row.sections_json as ChecklistSectionDef[]) ?? [],
  };
}

export async function listActiveTabs(accountId: string): Promise<ChecklistTabDef[]> {
  const sql = getSql();
  const rows = await sql`
    SELECT id, name, sections_json FROM checklist_tabs
    WHERE account_id = ${accountId} AND deleted_at IS NULL
    ORDER BY position ASC, id ASC
  `;
  return rows.map((r) => rowToTab(r as Record<string, unknown>));
}

// Includes soft-deleted tabs — a crew that loaded a tab just before an admin
// deleted it can still submit, and the submission stays linked to it.
export async function getTabForAccount(accountId: string, tabId: number): Promise<ChecklistTabDef | null> {
  const sql = getSql();
  const rows = await sql`
    SELECT id, name, sections_json FROM checklist_tabs
    WHERE id = ${tabId} AND account_id = ${accountId}
    LIMIT 1
  `;
  return rows.length > 0 ? rowToTab(rows[0] as Record<string, unknown>) : null;
}

// Every template keeps at least one active tab. Creates a "Checklist" tab
// from the template's current sections_json when there is none (new
// accounts, or any account the migration hasn't reached yet).
export async function ensureFirstTab(accountId: string): Promise<ChecklistTabDef[]> {
  const sql = getSql();
  await sql`
    INSERT INTO checklist_tabs (account_id, name, position, sections_json)
    SELECT t.account_id, ${DEFAULT_TAB_NAME}, 0, t.sections_json
    FROM checklist_templates t
    WHERE t.account_id = ${accountId}
      AND NOT EXISTS (SELECT 1 FROM checklist_tabs c WHERE c.account_id = t.account_id AND c.deleted_at IS NULL)
  `;
  return listActiveTabs(accountId);
}

function syncLegacySectionsQuery(accountId: string) {
  const sql = getSql();
  return sql`
    UPDATE checklist_templates
    SET sections_json = COALESCE(
          (SELECT sections_json FROM checklist_tabs
           WHERE account_id = ${accountId} AND deleted_at IS NULL
           ORDER BY position ASC, id ASC LIMIT 1),
          sections_json
        ),
        updated_at = now()
    WHERE account_id = ${accountId}
  `;
}

export async function addTab(accountId: string, name: string): Promise<ChecklistTabDef[]> {
  const sql = getSql();
  const inserted = await sql`
    INSERT INTO checklist_tabs (account_id, name, position)
    SELECT ${accountId}, ${name}, COALESCE(MAX(position) + 1, 0)
    FROM checklist_tabs
    WHERE account_id = ${accountId} AND deleted_at IS NULL
    HAVING COUNT(*) < ${MAX_TABS}
    RETURNING id
  `;
  if (inserted.length === 0) {
    throw new Error(`An account can have at most ${MAX_TABS} tabs.`);
  }
  await syncLegacySectionsQuery(accountId);
  return listActiveTabs(accountId);
}

export async function renameTab(accountId: string, tabId: number, name: string): Promise<ChecklistTabDef[]> {
  const sql = getSql();
  const rows = await sql`
    UPDATE checklist_tabs SET name = ${name}, updated_at = now()
    WHERE id = ${tabId} AND account_id = ${accountId} AND deleted_at IS NULL
    RETURNING id
  `;
  if (rows.length === 0) throw new Error("That tab no longer exists.");
  return listActiveTabs(accountId);
}

// orderedIds must be exactly the account's active tabs, in the new order.
export async function reorderTabs(accountId: string, orderedIds: number[]): Promise<ChecklistTabDef[]> {
  const current = await listActiveTabs(accountId);
  const currentIds = current.map((t) => t.id).sort((a, b) => a - b);
  const requested = [...orderedIds].sort((a, b) => a - b);
  if (currentIds.length !== requested.length || currentIds.some((id, i) => id !== requested[i])) {
    throw new Error("The tab list changed — reload the page and try again.");
  }

  const sql = getSql();
  await sql.transaction([
    ...orderedIds.map(
      (id, index) => sql`
        UPDATE checklist_tabs SET position = ${index}, updated_at = now()
        WHERE id = ${id} AND account_id = ${accountId} AND deleted_at IS NULL
      `
    ),
    syncLegacySectionsQuery(accountId),
  ]);
  return listActiveTabs(accountId);
}

// Soft delete: the row stays so past submissions keep their tab_id link.
export async function deleteTab(accountId: string, tabId: number): Promise<ChecklistTabDef[]> {
  const sql = getSql();
  const rows = await sql`
    UPDATE checklist_tabs SET deleted_at = now(), updated_at = now()
    WHERE id = ${tabId} AND account_id = ${accountId} AND deleted_at IS NULL
      AND (SELECT COUNT(*) FROM checklist_tabs WHERE account_id = ${accountId} AND deleted_at IS NULL) > 1
    RETURNING id
  `;
  if (rows.length === 0) {
    throw new Error("That tab can't be deleted — every account keeps at least one tab.");
  }
  await syncLegacySectionsQuery(accountId);
  return listActiveTabs(accountId);
}

// Replaces ONLY this tab's sections (plus the account-level location name,
// which the editor saves alongside, same as before tabs).
export async function saveTabSections(
  accountId: string,
  tabId: number,
  locationName: string,
  sections: ChecklistSectionDef[]
): Promise<{ template: ChecklistTemplateRow; tabs: ChecklistTabDef[] }> {
  const sql = getSql();
  const [tabRows] = await sql.transaction([
    sql`
      UPDATE checklist_tabs SET sections_json = ${JSON.stringify(sections)}::jsonb, updated_at = now()
      WHERE id = ${tabId} AND account_id = ${accountId} AND deleted_at IS NULL
      RETURNING id
    `,
    sql`UPDATE checklist_templates SET location_name = ${locationName} WHERE account_id = ${accountId}`,
    syncLegacySectionsQuery(accountId),
  ]);
  if ((tabRows as unknown[]).length === 0) {
    throw new Error("That tab no longer exists — reload the page and try again.");
  }
  const template = await getTemplateByAccountId(accountId);
  if (!template) {
    throw new Error(`saveTabSections: no template found for account "${accountId}" — call ensureTemplate first`);
  }
  return { template, tabs: await listActiveTabs(accountId) };
}

// Crew Link module switches. Creates the template row first if needed so
// an account can turn on orders/problems without the checklist (the link's
// porter_code lives on this row).
export async function setCrewLinkModules(
  accountId: string,
  accountName: string,
  modules: { supplyOrders: boolean; problemReports: boolean }
): Promise<ChecklistTemplateRow> {
  await ensureTemplate(accountId, accountName);
  const sql = getSql();
  const rows = await sql`
    UPDATE checklist_templates
    SET supply_orders_enabled = ${modules.supplyOrders}, problem_reports_enabled = ${modules.problemReports}, updated_at = now()
    WHERE account_id = ${accountId}
    RETURNING *
  `;
  return rowToTemplate(rows[0] as Record<string, unknown>);
}

export type NewSubmissionInput = {
  accountId: string;
  accountName: string;
  locationName: string;
  tabId: number | null;
  tabName: string | null;
  porterName: string;
  weekOf: string | null;
  timeIn: string;
  timeOut: string;
  // Crew Link: first checkbox tap (ISO), recorded automatically. Null for
  // older pages that still send typed Time In / Time Out.
  startedAt: string | null;
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
      completed_count, total_count, general_notes, items_snapshot_json, tab_id, tab_name, started_at
    ) VALUES (
      ${input.accountId}, ${input.accountName}, ${input.locationName}, ${input.porterName},
      ${input.weekOf}, ${input.timeIn}, ${input.timeOut},
      ${input.completedCount}, ${input.totalCount}, ${input.generalNotes},
      ${JSON.stringify(input.sections)}::jsonb, ${input.tabId}, ${input.tabName}, ${input.startedAt}
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
  // Name of the tab as it was when submitted (null only for rows the tabs
  // migration couldn't link — no template for that account).
  tabName: string | null;
  // Automatic start time (null for older, typed-time submissions — see
  // describeWorkTimes in lib/checklistTemplate.ts).
  startedAt: string | null;
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
    tabName: (row.tab_name as string | null) ?? null,
    startedAt: row.started_at
      ? row.started_at instanceof Date
        ? row.started_at.toISOString()
        : String(row.started_at)
      : null,
  };
}

export async function listSubmissions(accountId?: string): Promise<SubmissionSummary[]> {
  const sql = getSql();
  const rows = accountId
    ? await sql`
        SELECT id, account_id, account_name, location_name, porter_name, week_of, time_in, time_out,
               completed_count, total_count, general_notes, submitted_at, tab_name, started_at
        FROM checklist_submissions
        WHERE account_id = ${accountId}
        ORDER BY submitted_at DESC
        LIMIT 200
      `
    : await sql`
        SELECT id, account_id, account_name, location_name, porter_name, week_of, time_in, time_out,
               completed_count, total_count, general_notes, submitted_at, tab_name, started_at
        FROM checklist_submissions
        ORDER BY submitted_at DESC
        LIMIT 200
      `;
  return rows.map((r) => rowToSummary(r as Record<string, unknown>));
}

export async function listSubmissionsForReport(
  accountId: string,
  startISO: string,
  endISO: string
): Promise<SubmissionDetail[]> {
  const sql = getSql();
  const rows = await sql`
    SELECT * FROM checklist_submissions
    WHERE account_id = ${accountId}
      AND submitted_at >= ${startISO}
      AND submitted_at < ${endISO}
    ORDER BY submitted_at ASC
    LIMIT 200
  `;
  return rows.map((r) => {
    const row = r as Record<string, unknown>;
    return { ...rowToSummary(row), sections: (row.items_snapshot_json as ChecklistSubmissionSection[]) ?? [] };
  });
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
