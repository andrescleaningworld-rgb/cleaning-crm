// Crew Link / Team Hub checklists and problem reports in the subcontractor
// portal (read-only). ONE access rule, used by every read:
//
//   a sub may see an account only if an Active SubSchedules row has that
//   AccountID and a SubID equal to the sub's signed-in email.
//
// SubSchedules.SubID holds the sub's login email — the only stable id-like
// link between an account and a sub (the Subcontractors "id" is a row
// position, the Accounts tab only has the sub's name, and Team Hub crews'
// sub_id holds a name). Names are never matched here. The email always
// comes from the sub_session cookie, never from the request.
//
// Sheets touch: fetchSubSchedules (read-only, cached). Everything else is
// Postgres.
import { getSql } from "@/lib/db";
import { fetchSubSchedules } from "@/lib/googleSheets";
import type { ChecklistSubmissionSection } from "@/lib/checklistTemplate";

export const SUB_PORTAL_CHECKLIST_DAYS = 60;

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

export async function listAccountIdsLinkedToSub(subEmail: string): Promise<Set<string>> {
  const email = normalizeEmail(subEmail);
  const ids = new Set<string>();
  if (!email) return ids;
  for (const schedule of await fetchSubSchedules()) {
    if (schedule.status.trim() === "Active" && schedule.accountId.trim() && normalizeEmail(schedule.subId) === email) {
      ids.add(schedule.accountId.trim());
    }
  }
  return ids;
}

export async function subCanSeeAccount(subEmail: string, accountId: string): Promise<boolean> {
  const id = accountId.trim();
  return Boolean(id) && (await listAccountIdsLinkedToSub(subEmail)).has(id);
}

// ─── Reads (callers must check subCanSeeAccount first) ───────────────────

const toIso = (v: unknown) => (v instanceof Date ? v.toISOString() : String(v));
const sinceIso = () => new Date(Date.now() - SUB_PORTAL_CHECKLIST_DAYS * 86_400_000).toISOString();

export type SubPortalChecklistRow = {
  source: "crew-link" | "team-hub";
  id: number;
  submittedAt: string;
  name: string;
  label: string | null; // tab name (Crew Link) or crew name (Team Hub)
  doneCount: number;
  totalCount: number;
};

export async function listChecklistsForAccount(accountId: string): Promise<SubPortalChecklistRow[]> {
  const sql = getSql();
  const since = sinceIso();
  const [crewLink, teamHub] = await Promise.all([
    sql`
      SELECT id, submitted_at, porter_name, tab_name, completed_count, total_count
      FROM checklist_submissions
      WHERE account_id = ${accountId} AND submitted_at >= ${since}
      ORDER BY submitted_at DESC LIMIT 200
    `,
    sql`
      SELECT r.id, r.submitted_at, r.total_items, c.name AS crew_name, w.first_name AS worker_first_name,
             COUNT(ri.id) FILTER (WHERE ri.status IN ('done', 'na'))::int AS done_count
      FROM hub_checklist_runs r
      JOIN hub_crews c ON c.id = r.crew_id
      JOIN hub_sites s ON s.id = c.site_id
      LEFT JOIN hub_workers w ON w.id = r.started_by_worker_id
      LEFT JOIN hub_checklist_run_items ri ON ri.run_id = r.id
      WHERE s.account_id = ${accountId} AND r.submitted_at IS NOT NULL AND r.submitted_at >= ${since}
      GROUP BY r.id, c.name, w.first_name
      ORDER BY r.submitted_at DESC LIMIT 200
    `,
  ]);
  const rows: SubPortalChecklistRow[] = [
    ...crewLink.map((r) => ({
      source: "crew-link" as const,
      id: r.id as number,
      submittedAt: toIso(r.submitted_at),
      name: (r.porter_name as string) || "—",
      label: (r.tab_name as string | null) ?? null,
      doneCount: Number(r.completed_count),
      totalCount: Number(r.total_count),
    })),
    ...teamHub.map((r) => ({
      source: "team-hub" as const,
      id: r.id as number,
      submittedAt: toIso(r.submitted_at),
      name: (r.worker_first_name as string | null) ?? "—",
      label: (r.crew_name as string | null) ?? null,
      doneCount: Number(r.done_count),
      totalCount: Number(r.total_items ?? r.done_count),
    })),
  ];
  return rows.sort((a, b) => b.submittedAt.localeCompare(a.submittedAt));
}

export type SubPortalChecklistItem = { label: string; subNote: string; checked: boolean; status: string; note: string; photos: string[] };
export type SubPortalChecklistDetail = {
  source: "crew-link" | "team-hub";
  id: number;
  submittedAt: string;
  startedAt: string | null;
  name: string;
  label: string | null;
  doneCount: number;
  totalCount: number;
  notes: string;
  notesEnglish: string | null;
  notesLang: string | null;
  sections: { title: string; items: SubPortalChecklistItem[] }[];
};

// Scoped to accountId in the WHERE clause, so an id from another account
// returns null even if someone guesses it.
export async function getCrewLinkChecklistDetail(accountId: string, id: number): Promise<SubPortalChecklistDetail | null> {
  const sql = getSql();
  const rows = await sql`
    SELECT * FROM checklist_submissions
    WHERE id = ${id} AND account_id = ${accountId} AND submitted_at >= ${sinceIso()}
  `;
  const row = rows[0] as Record<string, unknown> | undefined;
  if (!row) return null;
  const sections = (row.items_snapshot_json as ChecklistSubmissionSection[] | null) ?? [];
  return {
    source: "crew-link",
    id,
    submittedAt: toIso(row.submitted_at),
    startedAt: row.started_at ? toIso(row.started_at) : null,
    name: (row.porter_name as string) || "—",
    label: (row.tab_name as string | null) ?? null,
    doneCount: Number(row.completed_count),
    totalCount: Number(row.total_count),
    notes: (row.general_notes as string) ?? "",
    notesEnglish: (row.general_notes_english as string | null) ?? null,
    notesLang: (row.general_notes_lang as string | null) ?? null,
    sections: sections.map((section) => ({
      title: section.title,
      items: section.items.map((item) => ({
        label: item.label,
        subNote: item.subNote ?? "",
        checked: Boolean(item.checked),
        status: item.checked ? "done" : "not done",
        note: item.note ?? "",
        photos: [],
      })),
    })),
  };
}

export async function getTeamHubRunDetail(accountId: string, runId: number): Promise<SubPortalChecklistDetail | null> {
  const sql = getSql();
  const runs = await sql`
    SELECT r.id, r.started_at, r.submitted_at, r.total_items, c.name AS crew_name, w.first_name AS worker_first_name
    FROM hub_checklist_runs r
    JOIN hub_crews c ON c.id = r.crew_id
    JOIN hub_sites s ON s.id = c.site_id
    LEFT JOIN hub_workers w ON w.id = r.started_by_worker_id
    WHERE r.id = ${runId} AND s.account_id = ${accountId} AND r.submitted_at IS NOT NULL AND r.submitted_at >= ${sinceIso()}
  `;
  const run = runs[0] as Record<string, unknown> | undefined;
  if (!run) return null;
  const items = await sql`
    SELECT ri.id, ri.status, ri.note, lib.area, lib.text, ci.instance_label
    FROM hub_checklist_run_items ri
    JOIN hub_crew_items ci ON ci.id = ri.crew_item_id
    LEFT JOIN hub_checklist_library lib ON ci.item_type = 'checklist' AND lib.id = ci.item_id
    WHERE ri.run_id = ${runId}
    ORDER BY lib.area NULLS LAST, ci.sort_order, ri.id
  `;
  const photoRows = await sql`
    SELECT parent_id, blob_url FROM hub_photos
    WHERE parent_type = 'run_item' AND parent_id = ANY(${items.map((i) => i.id as number)})
    ORDER BY created_at
  `;
  const photos = new Map<number, string[]>();
  for (const p of photoRows) photos.set(p.parent_id as number, [...(photos.get(p.parent_id as number) ?? []), p.blob_url as string]);

  const byArea = new Map<string, SubPortalChecklistItem[]>();
  for (const i of items) {
    const area = (i.area as string | null) ?? "";
    const label = [(i.text as string | null) ?? "Item", (i.instance_label as string | null) ?? ""].filter(Boolean).join(" — ");
    const status = i.status as string;
    byArea.set(area, [
      ...(byArea.get(area) ?? []),
      { label, subNote: "", checked: status === "done" || status === "na", status: status === "na" ? "n/a" : status, note: (i.note as string) ?? "", photos: photos.get(i.id as number) ?? [] },
    ]);
  }
  const doneCount = items.filter((i) => i.status === "done" || i.status === "na").length;
  return {
    source: "team-hub",
    id: runId,
    submittedAt: toIso(run.submitted_at),
    startedAt: run.started_at ? toIso(run.started_at) : null,
    name: (run.worker_first_name as string | null) ?? "—",
    label: (run.crew_name as string | null) ?? null,
    doneCount,
    totalCount: Number(run.total_items ?? items.length),
    notes: "",
    notesEnglish: null,
    notesLang: null,
    sections: [...byArea.entries()].map(([title, list]) => ({ title, items: list })),
  };
}

export type SubPortalProblem = {
  id: number;
  createdAt: string;
  category: string;
  status: "open" | "resolved";
  note: string;
  noteEnglish: string | null;
  noteLanguage: string | null;
  reportedBy: string;
  photos: string[];
};

// Crew Link (crew_link_account_id) and Team Hub (site's account) problem
// reports for one account: last 60 days, plus anything still open.
export async function listProblemsForAccount(accountId: string): Promise<SubPortalProblem[]> {
  const sql = getSql();
  const rows = await sql`
    SELECT i.id, i.created_at, i.category, i.status, i.note, i.note_english, i.note_language,
           COALESCE(w.first_name, i.reporter_name) AS reported_by
    FROM hub_issues i
    LEFT JOIN hub_sites s ON s.id = i.site_id
    LEFT JOIN hub_workers w ON w.id = i.worker_id
    WHERE (i.crew_link_account_id = ${accountId} OR s.account_id = ${accountId})
      AND (i.created_at >= ${sinceIso()} OR i.status = 'open')
    ORDER BY i.created_at DESC LIMIT 200
  `;
  const ids = rows.map((r) => r.id as number);
  const photoRows = ids.length
    ? await sql`SELECT parent_id, blob_url FROM hub_photos WHERE parent_type = 'issue' AND parent_id = ANY(${ids}) ORDER BY created_at`
    : [];
  const photos = new Map<number, string[]>();
  for (const p of photoRows) photos.set(p.parent_id as number, [...(photos.get(p.parent_id as number) ?? []), p.blob_url as string]);
  return rows.map((r) => ({
    id: r.id as number,
    createdAt: toIso(r.created_at),
    category: r.category as string,
    status: r.status as "open" | "resolved",
    note: (r.note as string) ?? "",
    noteEnglish: (r.note_english as string | null) ?? null,
    noteLanguage: (r.note_language as string | null) ?? null,
    reportedBy: (r.reported_by as string | null) ?? "—",
    photos: photos.get(r.id as number) ?? [],
  }));
}
