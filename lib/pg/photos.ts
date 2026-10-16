// Complaint photos and sub portal issue photos on Postgres
// (DATA_SOURCE_PHOTOS=postgres): the same list and the same upload Apps
// Script's getPhotos / uploadPhoto gave, in the same shape, so the pages do
// not change. New photos go to Blob storage. The old ones stay in Google
// Drive and are also copied to Blob, a few at a time (copyDrivePhotos); the
// Drive originals are never changed or removed.
import { put } from "@vercel/blob";
import { google } from "googleapis";
import { getSql } from "@/lib/db";

/** One photo, in the shape Apps Script answered with. */
export type PhotoRow = {
  rowNumber: number;
  timestamp: string;
  photoId: string;
  accountId: string;
  accountName: string;
  sourceType: string;
  sourceId: string;
  uploadedBy: string;
  userRole: string;
  fileName: string;
  driveFileId: string;
  /** Where the picture is: the Blob copy when there is one, else the Drive link. The pages show either. */
  driveUrl: string;
  folderUrl: string;
  notes: string;
  status: string;
};

type DbRow = {
  sheet_row: number;
  timestamp_raw: string;
  taken_on: string | null;
  photo_id: string;
  account_id_raw: string;
  account_name: string;
  source_type: string;
  source_id: string;
  uploaded_by: string;
  user_role: string;
  file_name: string;
  drive_file_id: string;
  drive_url: string;
  folder_url: string;
  blob_url: string;
  notes: string;
  status: string;
};

const clean = (value: unknown) => String(value ?? "").trim();

export async function listPhotosShape(): Promise<PhotoRow[]> {
  const rows = (await getSql()`
    SELECT sheet_row, timestamp_raw, to_char(taken_on, 'YYYY-MM-DD') AS taken_on, photo_id, account_id_raw, account_name, source_type, source_id,
           uploaded_by, user_role, file_name, drive_file_id, drive_url, folder_url, blob_url, notes, status
    FROM photos ORDER BY sheet_row
  `) as DbRow[];
  return rows.map((row) => ({
    rowNumber: row.sheet_row,
    timestamp: row.taken_on ?? row.timestamp_raw,
    photoId: row.photo_id,
    accountId: row.account_id_raw,
    accountName: row.account_name,
    sourceType: row.source_type,
    sourceId: row.source_id,
    uploadedBy: row.uploaded_by,
    userRole: row.user_role,
    fileName: row.file_name,
    driveFileId: row.drive_file_id,
    driveUrl: row.blob_url || row.drive_url,
    folderUrl: row.folder_url,
    notes: row.notes,
    status: row.status,
  }));
}

const MAX_PHOTO_BYTES = 8 * 1024 * 1024;

function stamp(now = new Date()): { id: string; day: string } {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).formatToParts(now);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return { id: `${get("year")}${get("month")}${get("day")}${get("hour")}${get("minute")}${get("second")}`, day: `${get("year")}-${get("month")}-${get("day")}` };
}

/**
 * Saves one uploaded photo: the file to Blob storage, the record to the
 * photos table. `base64Data` is what the pages already send (with or without
 * the "data:image/…;base64," start).
 */
export async function addPhoto(input: Record<string, unknown>): Promise<{ photoId: string; url: string }> {
  if (!process.env.BLOB_READ_WRITE_TOKEN) throw new Error("File storage is not set up here, so the photo cannot be saved.");
  const base64 = clean(input.base64Data).replace(/^data:[^;]+;base64,/, "");
  if (!base64) throw new Error("No photo was sent.");
  const bytes = Buffer.from(base64, "base64");
  if (bytes.length === 0) throw new Error("That photo could not be read.");
  if (bytes.length > MAX_PHOTO_BYTES) throw new Error("The photo must be 8MB or smaller.");
  const mimeType = clean(input.mimeType) || "image/jpeg";
  if (!/^image\//i.test(mimeType)) throw new Error("Only photos can be added here.");
  const fileName = clean(input.fileName) || "photo.jpg";
  const extension = /\.[a-z0-9]{2,5}$/i.test(fileName) ? fileName.slice(fileName.lastIndexOf(".")).toLowerCase() : ".jpg";
  const { id, day } = stamp();
  const blob = await put(`photos/app/${id}-${crypto.randomUUID().slice(0, 8)}${extension}`, bytes, { access: "public", contentType: mimeType, addRandomSuffix: false });

  const sql = getSql();
  const accountId = clean(input.accountId);
  const accountName = clean(input.accountName);
  let photoId = "";
  for (let attempt = 0; attempt < 5 && !photoId; attempt++) {
    const candidate = `PHOTO-${id}${attempt === 0 ? "" : `-${attempt + 1}`}`;
    const rows = (await sql`
      INSERT INTO photos (legacy_key, timestamp_raw, taken_on, photo_id, account_id_raw, account_name, account_ref, source_type, source_id, uploaded_by, user_role, file_name, blob_url, notes, status, sheet_row)
      SELECT ${"pg-" + candidate}, ${day}, ${day}::date, ${candidate}, ${accountId}, ${accountName},
             COALESCE((SELECT id FROM accounts WHERE ${accountId} <> '' AND id = ${accountId} LIMIT 1),
                      (SELECT CASE WHEN count(*) = 1 THEN min(id) END FROM accounts WHERE (to_jsonb(accounts)->>'deleted_at') IS NULL AND ${accountName} <> '' AND lower(btrim(account_name)) = lower(${accountName}))),
             ${clean(input.sourceType)}, ${clean(input.sourceId)}, ${clean(input.uploadedBy)}, ${clean(input.userRole)}, ${fileName.slice(0, 200)}, ${blob.url}, ${clean(input.notes).slice(0, 2000)}, 'Active',
             (SELECT COALESCE(max(sheet_row), 1) + 1 FROM photos)
      ON CONFLICT DO NOTHING
      RETURNING photo_id
    `) as { photo_id: string }[];
    if (rows.length > 0) photoId = rows[0].photo_id;
  }
  if (!photoId) throw new Error("The photo was stored but its record did not save. Try again.");
  return { photoId, url: blob.url };
}

/**
 * Copies old Drive photos into Blob storage, a few per call. The Drive file
 * is only read. A photo that cannot be read (deleted, not shared with the
 * app's Google account) is left as it is and tried again another time.
 */
export async function copyDrivePhotos(limit = 3): Promise<{ copied: number; left: number }> {
  if (!process.env.BLOB_READ_WRITE_TOKEN || !process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || !process.env.GOOGLE_PRIVATE_KEY) return { copied: 0, left: 0 };
  const sql = getSql();
  const rows = (await sql`
    SELECT id, drive_file_id, file_name FROM photos WHERE blob_url = '' AND btrim(drive_file_id) <> '' ORDER BY id LIMIT ${Math.max(1, Math.min(10, limit))}
  `) as { id: number; drive_file_id: string; file_name: string }[];
  if (rows.length === 0) return { copied: 0, left: 0 };
  const drive = google.drive({
    version: "v3",
    auth: new google.auth.GoogleAuth({
      credentials: { client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL, private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, "\n") },
      scopes: ["https://www.googleapis.com/auth/drive.readonly"],
    }),
  });
  let copied = 0;
  for (const row of rows) {
    try {
      const fileId = row.drive_file_id.trim();
      const meta = await drive.files.get({ fileId, fields: "mimeType, size", supportsAllDrives: true });
      const mimeType = meta.data.mimeType ?? "image/jpeg";
      if (!/^image\//i.test(mimeType) || Number(meta.data.size ?? 0) > 25 * 1024 * 1024) continue;
      const file = await drive.files.get({ fileId, alt: "media", supportsAllDrives: true }, { responseType: "arraybuffer" });
      const extension = /\.[a-z0-9]{2,5}$/i.test(row.file_name) ? row.file_name.slice(row.file_name.lastIndexOf(".")).toLowerCase() : `.${mimeType.split("/")[1] || "jpg"}`;
      const blob = await put(`photos/drive/${fileId}${extension}`, Buffer.from(file.data as ArrayBuffer), { access: "public", contentType: mimeType, addRandomSuffix: false, allowOverwrite: true });
      await sql`UPDATE photos SET blob_url = ${blob.url}, updated_at = now() WHERE id = ${row.id} AND blob_url = ''`;
      copied++;
    } catch (error) {
      console.error("[photos] Drive copy failed for one photo:", error instanceof Error ? error.message.replace(/[\w.-]+@[\w.-]+/g, "<email>").slice(0, 160) : "error");
    }
  }
  const left = ((await sql`SELECT count(*)::int AS n FROM photos WHERE blob_url = '' AND btrim(drive_file_id) <> ''`) as { n: number }[])[0].n;
  return { copied, left };
}
