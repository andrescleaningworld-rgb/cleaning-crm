// Office TV slideshow (db/migrations/069_tv_slideshow_drive.sql): how long
// the board sits idle before the slideshow starts, and the pictures copied
// from a Google Drive folder ("Office TV Slideshow").
//
// The TV has no Google login, so every Drive picture is copied to Vercel Blob
// (resized to at most 1920px) and the TV loads it from there. Drive is only
// read (drive.readonly): nothing in Drive is ever changed or deleted. The
// copy runs every hour (app/api/cron/tv-slideshow) and from "Sync now".

import { google } from "googleapis";
import { del, put } from "@/lib/files";
import sharp from "sharp";
import heicConvert from "heic-convert";
import { getSql } from "@/lib/db";

export const DEFAULT_IDLE_MINUTES = 5;
/** How long each picture stays up, and how many slides one round shows (migration 070). */
export const DEFAULT_SLIDE_SECONDS = 10;
export const DEFAULT_SLIDES_PER_SHOW = 6;
export const SLIDE_SECONDS_RANGE = { min: 5, max: 60 };
export const SLIDES_PER_SHOW_RANGE = { min: 1, max: 50 };
export const DEFAULT_DRIVE_FOLDER = "1STnQFkkCZ1Bb79iVkDSlSPs5cF1N4oG3";

export type TvSlideshowSettings = {
  idleMinutes: number;
  slideSeconds: number;
  slidesPerShow: number;
  /** False until migration 070: the two timing numbers stay at 10 seconds and 6 slides. */
  timingReady: boolean;
  driveFolderId: string;
  driveEnabled: boolean;
  lastSyncedAt: string;
  lastError: string;
  /** Pictures from Drive ready for the TV now. */
  pictureCount: number;
  /** A copy is running right now. */
  syncing: boolean;
};

const DEFAULTS: TvSlideshowSettings = {
  idleMinutes: DEFAULT_IDLE_MINUTES,
  slideSeconds: DEFAULT_SLIDE_SECONDS,
  slidesPerShow: DEFAULT_SLIDES_PER_SHOW,
  timingReady: false,
  driveFolderId: DEFAULT_DRIVE_FOLDER,
  driveEnabled: false,
  lastSyncedAt: "",
  lastError: "",
  pictureCount: 0,
  syncing: false,
};

const missingTable = (error: unknown) => (error as { code?: string }).code === "42P01";
const iso = (value: string | Date | null) => (value ? new Date(value).toISOString() : "");

/** False until migration 069 is applied. */
export async function tvSlideshowReady(): Promise<boolean> {
  try {
    const rows = (await getSql()`SELECT to_regclass('public.tv_slideshow_settings') IS NOT NULL AS ready`) as { ready: boolean }[];
    return rows[0]?.ready === true;
  } catch {
    return false;
  }
}

export async function getTvSlideshowSettings(): Promise<TvSlideshowSettings> {
  try {
    const sql = getSql();
    const rows = (await sql`
      SELECT idle_minutes, to_jsonb(s) ->> 'slide_seconds' AS slide_seconds, to_jsonb(s) ->> 'slides_per_show' AS slides_per_show, drive_folder_id, drive_enabled, last_synced_at, last_error,
             sync_started_at IS NOT NULL AND sync_started_at > now() - interval '10 minutes' AS syncing,
             (SELECT count(*)::int FROM tv_drive_slides WHERE folder_id = s.drive_folder_id) AS picture_count
      FROM tv_slideshow_settings s WHERE id = true
    `) as { idle_minutes: number; slide_seconds: string | null; slides_per_show: string | null; drive_folder_id: string; drive_enabled: boolean; last_synced_at: string | Date | null; last_error: string; syncing: boolean; picture_count: number }[];
    const row = rows[0];
    if (!row) return DEFAULTS;
    const seconds = Number(row.slide_seconds);
    const perShow = Number(row.slides_per_show);
    const timingReady = row.slide_seconds !== null && row.slides_per_show !== null;
    return {
      idleMinutes: row.idle_minutes,
      slideSeconds: timingReady && seconds > 0 ? seconds : DEFAULT_SLIDE_SECONDS,
      slidesPerShow: timingReady && perShow > 0 ? perShow : DEFAULT_SLIDES_PER_SHOW,
      timingReady,
      driveFolderId: row.drive_folder_id,
      driveEnabled: row.drive_enabled,
      lastSyncedAt: iso(row.last_synced_at),
      lastError: row.last_error,
      pictureCount: row.picture_count,
      syncing: row.syncing,
    };
  } catch (error) {
    if (missingTable(error)) return DEFAULTS;
    throw error;
  }
}

/** A folder link ("…/folders/<id>", "…?id=<id>") or the bare ID → the ID. "" when it is neither. */
export function folderIdFrom(value: string): string {
  const text = value.trim();
  const fromLink = /\/folders\/([A-Za-z0-9_-]{10,})/.exec(text) ?? /[?&]id=([A-Za-z0-9_-]{10,})/.exec(text);
  if (fromLink) return fromLink[1];
  return /^[A-Za-z0-9_-]{10,}$/.test(text) ? text : "";
}

const within = (value: number, range: { min: number; max: number }) => Math.min(range.max, Math.max(range.min, Math.round(value)));

export async function saveTvSlideshowSettings(
  input: { idleMinutes: number; driveFolderId: string; driveEnabled: boolean; slideSeconds?: number; slidesPerShow?: number },
  by: string
): Promise<TvSlideshowSettings> {
  const idle = Math.min(60, Math.max(1, Math.round(input.idleMinutes)));
  const sql = getSql();
  await sql`
    INSERT INTO tv_slideshow_settings (id, idle_minutes, drive_folder_id, drive_enabled, updated_by, updated_at)
    VALUES (true, ${idle}, ${input.driveFolderId}, ${input.driveEnabled}, ${by}, now())
    ON CONFLICT (id) DO UPDATE SET idle_minutes = EXCLUDED.idle_minutes, drive_folder_id = EXCLUDED.drive_folder_id,
      drive_enabled = EXCLUDED.drive_enabled, updated_by = EXCLUDED.updated_by, updated_at = now()
  `;
  // Its own step: the two columns are only there once migration 070 is applied.
  if (input.slideSeconds !== undefined && input.slidesPerShow !== undefined) {
    try {
      await sql`
        UPDATE tv_slideshow_settings SET slide_seconds = ${within(input.slideSeconds, SLIDE_SECONDS_RANGE)},
          slides_per_show = ${within(input.slidesPerShow, SLIDES_PER_SHOW_RANGE)} WHERE id = true
      `;
    } catch (error) {
      if ((error as { code?: string }).code !== "42703") throw error;
    }
  }
  return getTvSlideshowSettings();
}

/** The copied Drive pictures for the TV. Empty when the switch is off or before migration 069. */
export async function driveSlideUrls(): Promise<string[]> {
  try {
    const rows = (await getSql()`
      SELECT d.blob_url FROM tv_drive_slides d JOIN tv_slideshow_settings s ON s.id = true
      WHERE s.drive_enabled AND d.folder_id = s.drive_folder_id
    `) as { blob_url: string }[];
    return rows.map((row) => row.blob_url);
  } catch {
    return [];
  }
}

/* ---------- copying from Drive ---------- */

/** Picture types copied; anything else in the folder (videos, documents) is skipped. */
const PICTURE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif", "image/heic", "image/heif", "image/tiff", "image/bmp"]);
/** A bigger file is skipped (a TV picture never needs it). */
const MAX_BYTES = 60 * 1024 * 1024;
const MAX_SIDE = 1920;

type DriveFile = { id: string; name: string; mimeType: string; modifiedTime: string; size: number };

function driveClient() {
  return google.drive({
    version: "v3",
    auth: new google.auth.GoogleAuth({
      credentials: {
        client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
        private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
      },
      // Read only: this code can never change or delete anything in Drive.
      scopes: ["https://www.googleapis.com/auth/drive.readonly"],
    }),
  });
}

async function listFolder(drive: ReturnType<typeof driveClient>, folderId: string): Promise<DriveFile[]> {
  const files: DriveFile[] = [];
  let pageToken: string | undefined;
  do {
    const { data } = await drive.files.list({
      q: `'${folderId.replace(/'/g, "")}' in parents and trashed = false`,
      fields: "nextPageToken, files(id, name, mimeType, modifiedTime, size)",
      pageSize: 1000,
      pageToken,
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
    });
    for (const file of data.files ?? []) {
      if (!file.id || !PICTURE_TYPES.has(String(file.mimeType ?? "").toLowerCase())) continue;
      files.push({ id: file.id, name: file.name ?? "", mimeType: String(file.mimeType).toLowerCase(), modifiedTime: file.modifiedTime ?? "", size: Number(file.size ?? 0) });
    }
    pageToken = data.nextPageToken ?? undefined;
  } while (pageToken);
  return files;
}

/** Drive's file → a JPEG no wider or taller than 1920px, turned the right way up. */
async function resized(drive: ReturnType<typeof driveClient>, file: DriveFile): Promise<Buffer> {
  const { data } = await drive.files.get({ fileId: file.id, alt: "media", supportsAllDrives: true }, { responseType: "arraybuffer" });
  let input = Buffer.from(data as ArrayBuffer);
  // iPhone photos: this server's image tool cannot open HEIC, so it is turned into a JPEG first.
  if (file.mimeType === "image/heic" || file.mimeType === "image/heif") {
    input = Buffer.from(await heicConvert({ buffer: new Uint8Array(input), format: "JPEG", quality: 0.92 }));
  }
  return sharp(input, { failOn: "none" })
    .rotate()
    .resize({ width: MAX_SIDE, height: MAX_SIDE, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 82, mozjpeg: true })
    .toBuffer();
}

function driveProblem(error: unknown): string {
  const code = Number((error as { code?: number | string }).code ?? (error as { response?: { status?: number } }).response?.status);
  const message = error instanceof Error ? error.message : String(error);
  if (code === 404) return `The folder was not found. Share it with ${process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL ?? "the app's Google account"} as Viewer, and check the folder link.`;
  if (code === 403 && /has not been used|disabled/i.test(message)) return "The Google Drive API is turned off for the app's Google Cloud project.";
  if (code === 403) return `No access to the folder. Share it with ${process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL ?? "the app's Google account"} as Viewer.`;
  return `The copy did not finish: ${message.slice(0, 200)}`;
}

export type SyncResult = { ran: boolean; reason?: string; copied: number; removed: number; skipped: number; left: number; total: number; error: string };

/**
 * Copies new and changed pictures, removes the copies of pictures no longer
 * in the folder. Stops starting new copies after `budgetMs`; the rest are
 * copied next time. Never runs twice at once.
 */
export async function syncDriveSlides(budgetMs = 240_000): Promise<SyncResult> {
  const began = Date.now();
  const none: SyncResult = { ran: false, copied: 0, removed: 0, skipped: 0, left: 0, total: 0, error: "" };
  if (!(await tvSlideshowReady())) return { ...none, reason: "not ready" };
  const sql = getSql();
  const claimed = (await sql`
    UPDATE tv_slideshow_settings SET sync_started_at = now()
    WHERE id = true AND drive_enabled AND (sync_started_at IS NULL OR sync_started_at < now() - interval '10 minutes')
    RETURNING drive_folder_id
  `) as { drive_folder_id: string }[];
  if (!claimed[0]) {
    const settings = await getTvSlideshowSettings();
    return { ...none, reason: settings.driveEnabled ? "already running" : "off" };
  }
  const folderId = claimed[0].drive_folder_id;
  const result: SyncResult = { ...none, ran: true };
  try {
    const drive = driveClient();
    const files = await listFolder(drive, folderId);
    result.total = files.length;
    const have = (await sql`SELECT file_id, folder_id, modified_time, blob_url FROM tv_drive_slides`) as { file_id: string; folder_id: string; modified_time: string; blob_url: string }[];
    const byId = new Map(have.map((row) => [row.file_id, row]));
    const inFolder = new Set(files.map((file) => file.id));

    // Gone from the folder (or from another folder chosen before): our copy goes. Drive is not touched.
    for (const row of have) {
      if (row.folder_id === folderId && inFolder.has(row.file_id)) continue;
      await del(row.blob_url).catch(() => undefined);
      await sql`DELETE FROM tv_drive_slides WHERE file_id = ${row.file_id}`;
      result.removed += 1;
    }

    for (const file of files) {
      const kept = byId.get(file.id);
      if (kept && kept.folder_id === folderId && kept.modified_time === file.modifiedTime) continue;
      if (Date.now() - began > budgetMs) {
        result.left += 1;
        continue;
      }
      if (file.size > MAX_BYTES) {
        result.skipped += 1;
        continue;
      }
      try {
        const jpeg = await resized(drive, file);
        const stamp = file.modifiedTime.replace(/\D/g, "").slice(0, 14) || String(Date.now());
        const blob = await put(`tv-drive/${file.id}-${stamp}.jpg`, jpeg, { access: "public", contentType: "image/jpeg", addRandomSuffix: false, allowOverwrite: true });
        await sql`
          INSERT INTO tv_drive_slides (file_id, folder_id, name, modified_time, blob_url, copied_at)
          VALUES (${file.id}, ${folderId}, ${file.name.slice(0, 300)}, ${file.modifiedTime}, ${blob.url}, now())
          ON CONFLICT (file_id) DO UPDATE SET folder_id = EXCLUDED.folder_id, name = EXCLUDED.name,
            modified_time = EXCLUDED.modified_time, blob_url = EXCLUDED.blob_url, copied_at = now()
        `;
        // A changed picture: the old copy goes.
        if (kept && kept.blob_url !== blob.url) await del(kept.blob_url).catch(() => undefined);
        result.copied += 1;
      } catch (error) {
        console.error(`[tv-slideshow] ${file.name} not copied:`, error instanceof Error ? error.message : error);
        result.skipped += 1;
      }
    }
  } catch (error) {
    result.error = driveProblem(error);
    console.error("[tv-slideshow] sync:", error instanceof Error ? error.message : error);
  }
  const count = (await sql`SELECT count(*)::int AS n FROM tv_drive_slides WHERE folder_id = ${folderId}`) as { n: number }[];
  await sql`
    UPDATE tv_slideshow_settings SET sync_started_at = NULL, last_error = ${result.error}, last_count = ${count[0]?.n ?? 0},
      last_synced_at = CASE WHEN ${result.error} = '' THEN now() ELSE last_synced_at END
    WHERE id = true
  `;
  return result;
}
