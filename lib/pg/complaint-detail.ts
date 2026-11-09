// One complaint for the Complaint Detail page (app/complaints/[id]), and the
// photos of complaints for the sub portal. Read only. No new tables:
//   - photos: the photos table (uploaded with the complaint, source "complaint")
//     plus the links on a "Photos:" line of the notes (customer portal
//     complaints, lib/pg/customer-portal.ts savePortalComplaint);
//   - edit history: activity_log, where the complaint edit / close / create
//     are already written (app/api/complaints/route.ts).

import { getSql } from "@/lib/db";
import { FILES_ROUTE } from "@/lib/files";
import { getComplaintsAppsScriptShape, type AppsScriptComplaint } from "@/lib/pg/complaints";

const clean = (value: unknown) => String(value ?? "").trim();

/** The photo links on the "Photos:" line(s) of a complaint's notes: the app's own stored files and https links only. */
export function photoLinksInNotes(notes: string): string[] {
  const links: string[] = [];
  for (const line of String(notes ?? "").split(/\r?\n/)) {
    const match = /^\s*photos?\s*:\s*(.+)$/i.exec(line);
    if (!match) continue;
    for (const part of match[1].split(/[\s,|]+/)) {
      const link = part.trim();
      if (link.startsWith(FILES_ROUTE) || /^https:\/\/[^\s]+$/i.test(link)) links.push(link);
    }
  }
  return links;
}

/** The pictures of each complaint (by its Complaint ID): uploaded ones first, then the ones linked in its notes. */
export async function complaintPhotoMap(complaints: { id: string; notes: string }[]): Promise<Map<string, string[]>> {
  const out = new Map<string, string[]>();
  const ids = [...new Set(complaints.map((c) => clean(c.id)).filter(Boolean))];
  if (ids.length > 0) {
    const rows = (await getSql().query(
      `SELECT btrim(source_id) AS source_id, COALESCE(NULLIF(btrim(blob_url), ''), btrim(drive_url)) AS url
       FROM photos
       WHERE btrim(source_id) = ANY($1::text[]) AND lower(source_type) LIKE '%complaint%' AND lower(btrim(status)) <> 'inactive'
         AND COALESCE(NULLIF(btrim(blob_url), ''), btrim(drive_url)) <> ''
       ORDER BY sheet_row`,
      [ids]
    )) as { source_id: string; url: string }[];
    for (const row of rows) out.set(row.source_id, [...(out.get(row.source_id) ?? []), row.url]);
  }
  for (const complaint of complaints) {
    const id = clean(complaint.id);
    if (!id) continue;
    const all = [...(out.get(id) ?? []), ...photoLinksInNotes(complaint.notes)];
    out.set(id, [...new Set(all)]);
  }
  return out;
}

export type ComplaintHistoryEntry = { who: string; when: string; what: string };

export type ComplaintDetail = {
  complaint: AppsScriptComplaint;
  photos: string[];
  history: ComplaintHistoryEntry[];
};

/** One complaint by its Complaint ID, its internal key (Pin Board papers) or its row number. Null when there is none. */
export async function getComplaintDetail(key: string): Promise<ComplaintDetail | null> {
  const wanted = clean(key);
  if (!wanted) return null;
  const sql = getSql();
  const found = (await sql.query(
    `SELECT sheet_row FROM complaints
     WHERE btrim(complaint_id) = $1::text OR legacy_key = $1::text OR sheet_row::text = $1::text
     ORDER BY (btrim(complaint_id) = $1::text) DESC, (legacy_key = $1::text) DESC, sheet_row
     LIMIT 1`,
    [wanted]
  )) as { sheet_row: number }[];
  if (!found[0]) return null;
  // The same shape (and the same hidden-account rule) as the Complaints list.
  const complaint = (await getComplaintsAppsScriptShape()).find((c) => c.rowNumber === found[0].sheet_row);
  if (!complaint) return null;

  const id = clean(complaint.id);
  const [photos, log] = await Promise.all([
    complaintPhotoMap([{ id: id || String(complaint.rowNumber), notes: complaint.notes }]),
    sql.query(
      `SELECT actor_name, created_at, action, detail FROM activity_log
       WHERE entity_type = 'complaint' AND entity_id = ANY($1::text[])
       ORDER BY created_at DESC LIMIT 100`,
      [[id, String(complaint.rowNumber)].filter(Boolean)]
    ) as unknown as Promise<{ actor_name: string; created_at: string | Date; action: string; detail: string | null }[]>,
  ]);

  const history = log.map((row) => {
    const detail = clean(row.detail).replace(/^Complaint edited:\s*/i, "");
    const what = detail || (row.action === "create" ? "Complaint added." : row.action === "update" ? "Complaint closed." : row.action);
    return { who: clean(row.actor_name) || "Someone", when: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at), what };
  });

  return { complaint, photos: photos.get(id || String(complaint.rowNumber)) ?? [], history };
}
