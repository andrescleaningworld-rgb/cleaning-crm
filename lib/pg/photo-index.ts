// The photo index (db/migrations/024_photo_index.sql): every photo in the
// app in one list, for the Photos page. Postgres only.
//
// How it stays complete: syncPhotoIndex() copies in, from every place the app
// keeps photos, the ones the index does not have yet. It runs whenever the
// Photos page asks for photos (at most once a minute), so a photo saved
// anywhere shows up without each upload screen having to know about the
// index. It only ever adds index rows: it never moves, changes or deletes a
// file or a row in the tables that own them. The one outside source, the
// Photos tab in Sheets (complaint and old sub portal photos, kept in Google
// Drive by Apps Script), is read through Apps Script's read-only "getPhotos".
//
// Feature flag FEATURE_PHOTOS: "1" on, "0" off, unset = off on Production,
// on in local dev and on Vercel previews (same rule as the other flags).

import { fetchAppsScript } from "@/lib/appsScriptFetch";
import { getSql } from "@/lib/db";

export const PHOTO_KINDS = ["Complaint", "Crew problem", "Sub photo", "Extra job", "Estimate", "Equipment", "Visit"] as const;
export type PhotoKind = (typeof PHOTO_KINDS)[number];

export type IndexedPhoto = {
  id: number;
  store: "blob" | "drive";
  url: string;
  accountId: string;
  accountName: string;
  kind: PhotoKind;
  moment: "" | "before" | "after";
  linkedType: string;
  linkedId: string;
  linkedLabel: string;
  linkedHref: string;
  takenBy: string;
  takenAt: string;
  isImage: boolean;
  /** A Drive photo added with "Add photos": its picture is fetched through the app, because the file may be shared only with the app. */
  viaApp: boolean;
};

export function photosFlagOn(): boolean {
  const flag = (process.env.FEATURE_PHOTOS ?? "").trim();
  if (flag === "1") return true;
  if (flag === "0") return false;
  if (process.env.NODE_ENV !== "production") return true;
  return process.env.VERCEL_ENV === "preview" || process.env.VERCEL_ENV === "development";
}

let ready: boolean | null = null;

export async function photosReady(): Promise<boolean> {
  if (!photosFlagOn()) return false;
  if (ready === true) return true;
  try {
    const rows = (await getSql()`SELECT to_regclass('public.photo_index') IS NOT NULL AS ok`) as { ok: boolean }[];
    ready = rows[0]?.ok === true;
  } catch {
    ready = false;
  }
  return ready === true;
}

/* ---------- filling the index ---------- */

// One INSERT ... SELECT per place photos live. Each is on its own, so a
// table that does not exist in a database (or has a different shape) only
// skips that source. ON CONFLICT DO NOTHING: a photo is indexed once.
const INSERT = `INSERT INTO photo_index (source_key, store, url, account_id, account_name, kind, moment, linked_type, linked_id, linked_label, linked_href, taken_by, taken_at, is_image)`;
const IS_IMAGE = (column: string) => `(${column} !~* '\\.(pdf|docx?|xlsx?)(\\?|$)')`;

const SOURCES: { name: string; sql: string }[] = [
  {
    // Complaint photos and old sub portal issue photos: Google Drive, listed in the Photos tab (copied to "photos").
    name: "Drive photos (complaints, old sub portal)",
    sql: `${INSERT}
      SELECT 'drive:' || p.photo_id, 'drive', p.drive_url, COALESCE(p.account_ref, p.account_id_raw, ''), p.account_name,
        CASE WHEN p.source_type ILIKE '%complaint%' THEN 'Complaint' ELSE 'Sub photo' END, '',
        CASE WHEN p.source_type ILIKE '%complaint%' THEN 'complaint' ELSE 'sub-issue' END, p.source_id,
        CASE WHEN p.source_type ILIKE '%complaint%' THEN 'Open the complaint' ELSE 'Open the account' END,
        CASE WHEN p.source_type ILIKE '%complaint%' AND btrim(p.source_id) <> '' THEN '/complaints/' || p.source_id
             WHEN COALESCE(p.account_ref, '') <> '' THEN '/accounts/' || p.account_ref ELSE '' END,
        p.uploaded_by, COALESCE(p.taken_on::timestamptz, p.created_at), true
      FROM photos p WHERE btrim(p.photo_id) <> '' AND btrim(p.drive_url) <> ''
      ON CONFLICT (source_key) DO NOTHING`,
  },
  {
    // Crew problem reports (Team Hub and Crew Link): Blob, hub_photos on a hub_issue.
    name: "Crew problem photos",
    sql: `${INSERT}
      SELECT 'hub:' || hp.id, 'blob', hp.blob_url, COALESCE(i.crew_link_account_id, s.account_id, ''), COALESCE(a.account_name, s.label, ''),
        'Crew problem', '', 'crew-problem', i.id::text, 'Open Crew Link problems', '/accounts-center?tab=team-hub',
        COALESCE(NULLIF(i.reporter_name, ''), 'Crew'), hp.created_at, true
      FROM hub_photos hp
      JOIN hub_issues i ON hp.parent_type = 'issue' AND i.id = hp.parent_id
      LEFT JOIN hub_sites s ON s.id = i.site_id
      LEFT JOIN accounts a ON a.id = COALESCE(i.crew_link_account_id, s.account_id)
      WHERE btrim(hp.blob_url) <> ''
      ON CONFLICT (source_key) DO NOTHING`,
  },
  {
    // The sub portal's Photos button: Blob, before / after at a site.
    name: "Sub portal before / after photos",
    sql: `${INSERT}
      SELECT 'sub-site:' || sp.id, 'blob', sp.url, sp.account_id, sp.account_name, 'Sub photo', sp.moment,
        'account', sp.account_id, 'Open the account', CASE WHEN sp.account_id <> '' THEN '/accounts/' || sp.account_id ELSE '' END,
        sp.sub_name, sp.taken_at, true
      FROM sub_site_photos sp WHERE btrim(sp.url) <> ''
      ON CONFLICT (source_key) DO NOTHING`,
  },
  {
    // Extra jobs: Blob, the after (and before) photos of a job.
    name: "Extra job photos",
    sql: `${INSERT}
      SELECT 'extra-job:' || ep.id, 'blob', ep.url, COALESCE(j.account_id, ''), COALESCE(j.account_name, ''), 'Extra job', ep.moment,
        'extra-job', j.job_number::text, 'Open the extra job', '/extra-jobs?job=' || j.job_number,
        ep.uploaded_by, ep.uploaded_at, ${IS_IMAGE("ep.url")}
      FROM extra_job_photos ep JOIN extra_jobs j ON j.id = ep.job_id WHERE btrim(ep.url) <> ''
      ON CONFLICT (source_key) DO NOTHING`,
  },
  {
    // Accepted estimates: Blob, a photo or a PDF, on the new account's handoff.
    name: "Accepted estimates",
    sql: `${INSERT}
      SELECT 'estimate:' || h.item_id || ':' || md5(h.data->>'estimateUrl'), 'blob', h.data->>'estimateUrl', h.account_id, h.account_name, 'Estimate', '',
        'account', h.account_id, 'Open the account', '/accounts/' || h.account_id || '?onboarding=1',
        h.created_by, h.created_at, ${IS_IMAGE("(h.data->>'estimateUrl')")}
      FROM handoff_items h WHERE h.kind = 'account' AND btrim(COALESCE(h.data->>'estimateUrl', '')) <> ''
      ON CONFLICT (source_key) DO NOTHING`,
  },
  {
    // A photo a sub attached to a problem or an extra job from the portal home: Blob.
    name: "Photos on sub problems and extra-job requests",
    sql: `${INSERT}
      SELECT 'handoff:' || h.kind || ':' || h.item_id, 'blob', h.data->>'photoUrl', h.account_id, h.account_name,
        CASE WHEN h.kind = 'extra' THEN 'Extra job' ELSE 'Sub photo' END, '',
        h.kind, h.item_id, CASE WHEN h.kind = 'extra' THEN 'Open To process' ELSE 'Open My work' END,
        CASE WHEN h.kind = 'extra' THEN '/account-updates?process=' || h.item_id ELSE '/' END,
        COALESCE(h.data->>'sub', h.created_by), h.created_at, true
      FROM handoff_items h WHERE h.kind IN ('issue', 'extra') AND btrim(COALESCE(h.data->>'photoUrl', '')) <> ''
      ON CONFLICT (source_key) DO NOTHING`,
  },
  {
    // Customer portal complaints: Google Drive links, comma separated on the request.
    name: "Customer portal complaint photos",
    sql: `${INSERT}
      SELECT 'portal-request:' || r.id || ':' || n.ordinality, CASE WHEN n.link ILIKE '%drive.google%' THEN 'drive' ELSE 'blob' END, btrim(n.link),
        COALESCE(r.account_ref, r.account_id_raw, ''), r.account_name, 'Complaint', '', 'portal-request', r.id::text, 'Open Portal Requests', '/portal-requests',
        'Customer', COALESCE(r.submitted_date::timestamptz, r.created_at), true
      FROM portal_requests r, unnest(string_to_array(r.photos, ',')) WITH ORDINALITY AS n(link, ordinality)
      WHERE btrim(n.link) LIKE 'http%'
      ON CONFLICT (source_key) DO NOTHING`,
  },
  {
    name: "Equipment photos",
    sql: `${INSERT}
      SELECT 'equipment:' || e.id || ':' || md5(e.photo_url), 'blob', e.photo_url, '', '', 'Equipment', '', 'equipment', e.id::text, 'Open the equipment', '/equipment/' || e.id,
        '', COALESCE(e.item_created_at, e.created_at), true
      FROM equipment e WHERE btrim(e.photo_url) LIKE 'http%'
      ON CONFLICT (source_key) DO NOTHING`,
  },
  {
    name: "Equipment check report photos",
    sql: `${INSERT}
      SELECT 'equipment-report:' || r.id || ':' || n.ordinality, 'blob', n.link, '', '', 'Equipment', '', 'equipment', r.equipment_id::text, 'Open the equipment', '/equipment/' || r.equipment_id,
        '', r.created_at, true
      FROM equipment_reports r, unnest(r.photo_urls) WITH ORDINALITY AS n(link, ordinality)
      WHERE btrim(n.link) LIKE 'http%'
      ON CONFLICT (source_key) DO NOTHING`,
  },
  {
    name: "Vehicle photos",
    sql: `${INSERT}
      SELECT 'vehicle:' || v.id || ':' || md5(v.photo_url), 'blob', v.photo_url, '', '', 'Equipment', '', 'vehicle', v.id::text, 'Open vehicles', '/equipment/vehicles',
        '', v.created_at, true
      FROM vehicles v WHERE btrim(v.photo_url) LIKE 'http%'
      ON CONFLICT (source_key) DO NOTHING`,
  },
];

type ScriptPhoto = Record<string, unknown>;

/** The Photos tab as Apps Script reports it today (read-only). Adds the ones the index does not have. */
async function syncFromAppsScript(): Promise<number> {
  const base = process.env.GOOGLE_SCRIPT_URL;
  if (!base) return 0;
  const url = new URL(base);
  url.searchParams.set("action", "getPhotos");
  const response = await fetchAppsScript(url.toString(), { method: "GET", cache: "no-store" }, undefined, { retryOn5xx: true, retryOnThrow: true });
  const data = (await response.json().catch(() => ({}))) as { photos?: ScriptPhoto[]; data?: ScriptPhoto[] };
  const photos = data.photos ?? data.data ?? [];
  const text = (photo: ScriptPhoto, ...keys: string[]) => {
    for (const key of keys) {
      const value = photo[key];
      if (value !== undefined && value !== null && String(value).trim() !== "") return String(value).trim();
    }
    return "";
  };
  const sql = getSql();
  let added = 0;
  for (const photo of photos) {
    const photoId = text(photo, "photoId", "Photo ID", "id");
    const driveUrl = text(photo, "driveUrl", "Drive URL", "url");
    if (!photoId || !driveUrl) continue;
    const sourceType = text(photo, "sourceType", "Source Type");
    const sourceId = text(photo, "sourceId", "Source ID");
    const complaint = /complaint/i.test(sourceType);
    const accountId = text(photo, "accountId", "Account ID");
    const taken = new Date(text(photo, "timestamp", "Timestamp", "date", "Date"));
    const rows = (await sql.query(
      `${INSERT} VALUES ($1, 'drive', $2, $3, $4, $5, '', $6, $7, $8, $9, $10, COALESCE($11::timestamptz, now()), true)
       ON CONFLICT (source_key) DO NOTHING RETURNING id`,
      [
        `drive:${photoId}`,
        driveUrl,
        accountId,
        text(photo, "accountName", "Account Name"),
        complaint ? "Complaint" : "Sub photo",
        complaint ? "complaint" : "sub-issue",
        sourceId,
        complaint ? "Open the complaint" : "Open the account",
        complaint && sourceId ? `/complaints/${sourceId}` : accountId ? `/accounts/${accountId}` : "",
        text(photo, "uploadedBy", "Uploaded By"),
        Number.isNaN(taken.getTime()) ? null : taken.toISOString(),
      ]
    )) as unknown[];
    added += rows.length;
  }
  return added;
}

export type SyncReport = { source: string; ok: boolean }[];

let lastSync = 0;
let lastScriptSync = 0;
const SYNC_EVERY_MS = 60 * 1000;
const SCRIPT_EVERY_MS = 5 * 60 * 1000;

/** Copies new photos into the index. `force` skips the once-a-minute wait (the fill script uses it). */
export async function syncPhotoIndex(force = false): Promise<SyncReport> {
  const now = Date.now();
  const report: SyncReport = [];
  if (!force && now - lastSync < SYNC_EVERY_MS) return report;
  lastSync = now;
  const sql = getSql();
  for (const source of SOURCES) {
    try {
      await sql.query(source.sql);
      report.push({ source: source.name, ok: true });
    } catch (error) {
      // A source this database does not have (yet) is simply not there to index.
      report.push({ source: source.name, ok: false });
      if (force) console.error(`[photo index] ${source.name}:`, error instanceof Error ? error.message : error);
    }
  }
  if (force || now - lastScriptSync >= SCRIPT_EVERY_MS) {
    lastScriptSync = now;
    try {
      await syncFromAppsScript();
      report.push({ source: "Photos tab (Apps Script, read-only)", ok: true });
    } catch (error) {
      report.push({ source: "Photos tab (Apps Script, read-only)", ok: false });
      if (force) console.error("[photo index] Apps Script:", error instanceof Error ? error.message : error);
    }
  }
  return report;
}

/* ---------- reading ---------- */

type Row = {
  id: string | number;
  source_key: string;
  store: "blob" | "drive";
  url: string;
  account_id: string;
  account_name: string;
  kind: PhotoKind;
  moment: "" | "before" | "after";
  linked_type: string;
  linked_id: string;
  linked_label: string;
  linked_href: string;
  taken_by: string;
  taken_at: string | Date;
  is_image: boolean;
};

const toPhoto = (row: Row): IndexedPhoto => ({
  id: Number(row.id),
  store: row.store,
  url: row.url,
  accountId: row.account_id,
  accountName: row.account_name,
  kind: row.kind,
  moment: row.moment,
  linkedType: row.linked_type,
  linkedId: row.linked_id,
  linkedLabel: row.linked_label,
  linkedHref: row.linked_href,
  takenBy: row.taken_by,
  takenAt: new Date(row.taken_at).toISOString(),
  isImage: row.is_image,
  viaApp: row.source_key.startsWith("drive-import:"),
});

export type PhotoFilter = {
  /** Words typed in "Find an account". */
  search?: string;
  /** One exact account (the Account chip, or More -> Photos on an account page). */
  account?: string;
  accountId?: string;
  kind?: string;
  /** "problems" = complaints, crew problems and sub problem photos; "before-after". */
  group?: string;
  from?: string;
  to?: string;
  /** Older than this photo (taken_at, id): for "more load as you scroll". */
  beforeAt?: string;
  beforeId?: number;
  limit?: number;
};

const isMoment = (value: string | undefined): value is string => Boolean(value) && !Number.isNaN(new Date(value as string).getTime());

function where(filter: PhotoFilter): { clause: string; params: unknown[] } {
  const parts: string[] = [];
  const params: unknown[] = [];
  const add = (sqlText: string, value: unknown) => {
    params.push(value);
    parts.push(sqlText.replace("?", `$${params.length}`));
  };
  if (filter.search?.trim()) add(`lower(account_name) LIKE '%' || ? || '%'`, filter.search.trim().toLowerCase());
  if (filter.accountId?.trim() && filter.account?.trim()) {
    params.push(filter.accountId.trim(), filter.account.trim().toLowerCase());
    parts.push(`(account_id = $${params.length - 1} OR lower(account_name) = $${params.length})`);
  } else if (filter.account?.trim()) add(`lower(account_name) = ?`, filter.account.trim().toLowerCase());
  else if (filter.accountId?.trim()) add(`account_id = ?`, filter.accountId.trim());
  if (filter.kind && (PHOTO_KINDS as readonly string[]).includes(filter.kind)) add(`kind = ?`, filter.kind);
  if (filter.group === "problems") parts.push(`(kind IN ('Complaint', 'Crew problem') OR linked_type IN ('issue', 'sub-issue'))`);
  if (filter.group === "before-after") parts.push(`moment <> ''`);
  // from / to are exact moments (the viewer's own midnight), `to` not included.
  if (isMoment(filter.from)) add(`taken_at >= ?::timestamptz`, filter.from);
  if (isMoment(filter.to)) add(`taken_at < ?::timestamptz`, filter.to);
  return { clause: parts.length ? `WHERE ${parts.join(" AND ")}` : "", params };
}

export async function listPhotos(filter: PhotoFilter): Promise<{ photos: IndexedPhoto[]; more: boolean }> {
  const limit = Math.min(120, Math.max(1, filter.limit ?? 60));
  const { clause, params } = where(filter);
  let cursor = "";
  if (filter.beforeAt && Number.isFinite(filter.beforeId)) {
    params.push(filter.beforeAt, filter.beforeId);
    cursor = `${clause ? " AND" : "WHERE"} (taken_at, id) < ($${params.length - 1}::timestamptz, $${params.length})`;
  }
  params.push(limit + 1);
  const rows = (await getSql().query(`SELECT * FROM photo_index ${clause}${cursor} ORDER BY taken_at DESC, id DESC LIMIT $${params.length}`, params)) as Row[];
  return { photos: rows.slice(0, limit).map(toPhoto), more: rows.length > limit };
}

export type PhotoCounts = { total: number; week: number; problems: number; beforeAfter: number };

/** `weekStart` is the viewer's Monday at midnight; without it the database's own week is used. */
export async function photoCounts(weekStart?: string): Promise<PhotoCounts> {
  const start = isMoment(weekStart) ? weekStart : null;
  const rows = (await getSql()`
    SELECT count(*)::int AS total,
      count(*) FILTER (WHERE taken_at >= COALESCE(${start}::timestamptz, date_trunc('week', now())))::int AS week,
      count(*) FILTER (WHERE kind IN ('Complaint', 'Crew problem') OR linked_type IN ('issue', 'sub-issue'))::int AS problems,
      count(*) FILTER (WHERE moment <> '')::int AS before_after
    FROM photo_index`) as { total: number; week: number; problems: number; before_after: number }[];
  const row = rows[0];
  return { total: row?.total ?? 0, week: row?.week ?? 0, problems: row?.problems ?? 0, beforeAfter: row?.before_after ?? 0 };
}

/** The accounts that have photos, most photos first: the Account chip's list. */
export async function photoAccounts(): Promise<{ name: string; count: number }[]> {
  const rows = (await getSql()`
    SELECT account_name AS name, count(*)::int AS count FROM photo_index
    WHERE btrim(account_name) <> '' GROUP BY account_name ORDER BY count(*) DESC, account_name LIMIT 300`) as { name: string; count: number }[];
  return rows;
}
