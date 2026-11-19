// Photo Checklist on the server (rules in lib/photoChecklist.ts). Server only.
//   crew screen     checklist_templates.crew_screen ('classic' | 'photo', migration 085)
//   photo details   photo_index.visit_id / item_key / time_source / added_at (085):
//                   which visit and item a crew photo is for, and where its time came from
//   work reports    the Photo Checklist submissions (client_id "pc-…") and their photos,
//                   for the account's Work reports list and the Work Report PDF
// Everything here works before 085 runs: the screen is Classic, photos carry
// no details, the report falls back to the photos listed in the checklist.

import { getSql } from "@/lib/db";
import { isCrewScreen, isPhotoTimeSource, photoTimeFlag, VISIT_ID_PREFIX, type CrewScreen, type PhotoTimeSource } from "@/lib/photoChecklist";

const typed = async <T,>(query: PromiseLike<unknown>): Promise<T> => (await query) as T;
const iso = (value: unknown): string | null => (value == null || value === "" ? null : value instanceof Date ? value.toISOString() : new Date(String(value)).toISOString());

let readyCache = false;

/** Migration 085 is in. */
export async function photoChecklistReady(): Promise<boolean> {
  if (readyCache) return true;
  try {
    const rows = await typed<{ ok: boolean }[]>(getSql()`
      SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'photo_index' AND column_name = 'visit_id')
         AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'checklist_templates' AND column_name = 'crew_screen') AS ok
    `);
    readyCache = rows[0]?.ok === true;
  } catch {
    readyCache = false;
  }
  return readyCache;
}

/** Which crew screen the account's CW Now link opens ('classic' before 085, and by default). */
export async function getCrewScreen(accountId: string): Promise<CrewScreen> {
  try {
    const rows = await typed<{ screen: string | null }[]>(getSql()`
      SELECT to_jsonb(t) ->> 'crew_screen' AS screen FROM checklist_templates t WHERE account_id = ${accountId} LIMIT 1
    `);
    return rows[0]?.screen === "photo" ? "photo" : "classic";
  } catch {
    return "classic";
  }
}

export async function setCrewScreen(accountId: string, screen: CrewScreen): Promise<void> {
  if (!isCrewScreen(screen)) throw new Error("Pick Classic or Photo Checklist.");
  if (!(await photoChecklistReady())) throw new Error("The Photo Checklist is not turned on yet (database update 085).");
  const rows = await typed<unknown[]>(getSql()`UPDATE checklist_templates SET crew_screen = ${screen}, updated_at = now() WHERE account_id = ${accountId} RETURNING account_id`);
  if (rows.length === 0) throw new Error("This account has no CW Now link yet.");
}

/** What the Photo Checklist screen sends with each photo. */
export type VisitPhotoDetails = { visitId: string; itemKey: string; timeSource: PhotoTimeSource; addedAt: string | null };

/** Saves which visit and item a crew photo is for (after the photo row is in). Nothing before 085. */
export async function tagVisitPhoto(photoId: number, details: VisitPhotoDetails): Promise<void> {
  if (!photoId || !(await photoChecklistReady())) return;
  const timeSource = isPhotoTimeSource(details.timeSource) ? details.timeSource : "camera";
  await getSql()`
    UPDATE photo_index
    SET visit_id = ${details.visitId}, item_key = ${details.itemKey.slice(0, 200)}, time_source = ${timeSource}, added_at = ${details.addedAt}
    WHERE id = ${photoId} AND kind = 'Crew'
  `;
}

/** One photo of a visit, for the report and the office. */
export type VisitPhoto = {
  id: number;
  url: string;
  thumbUrl: string;
  takenAt: string;
  takenBy: string;
  itemKey: string;
  caption: string;
  timeSource: PhotoTimeSource | null;
  addedAt: string | null;
  isImage: boolean;
  /** "early" (taken before the visit / more than a day before it was added), "added_later", or null. */
  flag: "early" | "added_later" | null;
};

type PhotoRow = {
  id: number | string;
  url: string;
  thumb_url: string;
  taken_at: string | Date;
  taken_by: string;
  item_key: string | null;
  caption: string;
  time_source: string | null;
  added_at: string | Date | null;
  is_image: boolean;
  source_key: string;
};

function toVisitPhoto(row: PhotoRow, visitStartedAt: string | null): VisitPhoto {
  const takenAt = iso(row.taken_at) ?? new Date().toISOString();
  const timeSource = isPhotoTimeSource(row.time_source) ? row.time_source : null;
  const addedAt = iso(row.added_at);
  return {
    id: Number(row.id),
    url: String(row.url ?? ""),
    thumbUrl: String(row.thumb_url ?? "") || String(row.url ?? ""),
    takenAt,
    takenBy: String(row.taken_by ?? ""),
    itemKey: String(row.item_key ?? ""),
    caption: String(row.caption ?? ""),
    timeSource,
    addedAt,
    isImage: row.is_image !== false,
    flag: photoTimeFlag({ takenAt, timeSource, addedAt }, visitStartedAt),
  };
}

/**
 * Every photo of one visit, in the order taken: the ones tagged with the
 * visit (085), plus any listed in the checklist itself (before 085, or one
 * the server had not tagged). `listed` maps a phone photo id to its item.
 */
export async function listVisitPhotos(visitId: string, listed: Map<string, string>, visitStartedAt: string | null): Promise<VisitPhoto[]> {
  const sql = getSql();
  const keys = [...listed.keys()].map((id) => `crew:${id}`);
  const ready = await photoChecklistReady();
  const rows = ready
    ? await typed<PhotoRow[]>(sql`
        SELECT id, url, thumb_url, taken_at, taken_by, item_key, caption, time_source, added_at, is_image, source_key
        FROM photo_index
        WHERE kind = 'Crew' AND (visit_id = ${visitId} OR source_key = ANY(${keys}))
        ORDER BY taken_at ASC, id ASC
      `)
    : await typed<PhotoRow[]>(sql`
        SELECT id, url, thumb_url, taken_at, taken_by, NULL::text AS item_key, caption, NULL::text AS time_source, NULL::timestamptz AS added_at, is_image, source_key
        FROM photo_index
        WHERE kind = 'Crew' AND source_key = ANY(${keys})
        ORDER BY taken_at ASC, id ASC
      `);
  return rows.map((row) => {
    const photo = toVisitPhoto(row, visitStartedAt);
    if (!photo.itemKey) photo.itemKey = listed.get(String(row.source_key).slice("crew:".length)) ?? "";
    return photo;
  });
}

/** One Photo Checklist visit in the account's Work reports list. */
export type WorkReportSummary = {
  id: number;
  submittedAt: string;
  startedAt: string | null;
  porterName: string;
  tabName: string | null;
  completedCount: number;
  totalCount: number;
  photoCount: number;
  /** Photos taken earlier than the visit (gallery). */
  earlyCount: number;
};

/** The account's latest Photo Checklist visits (newest first). */
export async function listWorkReports(accountId: string, limit = 15): Promise<WorkReportSummary[]> {
  const sql = getSql();
  const prefix = `${VISIT_ID_PREFIX}%`;
  const subs = await typed<Record<string, unknown>[]>(sql`
    SELECT id, submitted_at, started_at, porter_name, tab_name, completed_count, total_count, to_jsonb(s) ->> 'client_id' AS client_id
    FROM checklist_submissions s
    WHERE account_id = ${accountId} AND (to_jsonb(s) ->> 'client_id') LIKE ${prefix}
    ORDER BY submitted_at DESC
    LIMIT ${Math.min(50, Math.max(1, limit))}
  `);
  if (subs.length === 0) return [];
  const visitIds = subs.map((row) => String(row.client_id));
  const photos = (await photoChecklistReady())
    ? await typed<{ visit_id: string; taken_at: string | Date; time_source: string | null; added_at: string | Date | null }[]>(sql`
        SELECT visit_id, taken_at, time_source, added_at FROM photo_index WHERE kind = 'Crew' AND visit_id = ANY(${visitIds})
      `)
    : [];
  return subs.map((row) => {
    const visitId = String(row.client_id);
    const startedAt = iso(row.started_at);
    const mine = photos.filter((photo) => photo.visit_id === visitId);
    return {
      id: Number(row.id),
      submittedAt: iso(row.submitted_at) ?? "",
      startedAt,
      porterName: String(row.porter_name ?? ""),
      tabName: (row.tab_name as string | null) ?? null,
      completedCount: Number(row.completed_count ?? 0),
      totalCount: Number(row.total_count ?? 0),
      photoCount: mine.length,
      earlyCount: mine.filter((photo) => photoTimeFlag({ takenAt: iso(photo.taken_at) ?? "", timeSource: photo.time_source, addedAt: iso(photo.added_at) }, startedAt) === "early").length,
    };
  });
}

/** The visit id (client_id) of a checklist, when it is a Photo Checklist visit. */
export async function visitIdOfSubmission(submissionId: number): Promise<string | null> {
  const rows = await typed<{ client_id: string | null }[]>(getSql()`
    SELECT to_jsonb(s) ->> 'client_id' AS client_id FROM checklist_submissions s WHERE id = ${submissionId} LIMIT 1
  `);
  const id = rows[0]?.client_id ?? null;
  return id && id.startsWith(VISIT_ID_PREFIX) ? id : null;
}

/** The team doing the work at this account (customer-facing name: the company, else the contact). "" when none. */
export async function teamNameOf(accountId: string): Promise<string> {
  try {
    const rows = await typed<{ name: string | null }[]>(getSql()`
      SELECT COALESCE(NULLIF(btrim(s.company_name), ''), NULLIF(btrim(s.contact_name), ''), NULLIF(btrim(a.subcontractor_raw), '')) AS name
      FROM accounts a LEFT JOIN subcontractors s ON s.id = a.subcontractor_id
      WHERE a.id = ${accountId} LIMIT 1
    `);
    return String(rows[0]?.name ?? "").trim();
  } catch {
    return "";
  }
}
