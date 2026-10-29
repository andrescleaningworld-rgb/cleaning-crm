// Adding photos to the photo index by hand: files from the person's device
// (kept in Blob storage under photos/), or photos that already sit in Google
// Drive (indexed where they are; nothing is copied, moved or changed in
// Drive). Drive is only ever read here, with a read-only scope.
//
// "Crew" photos are the exception: the customer portal shows them, and a
// customer's browser cannot open a Drive file shared only with the app. So a
// Crew photo from Drive is COPIED into Blob storage (crew-photos/<account>/,
// a 2400px copy and a 400px small copy); the file in Drive is left as it is.
//
// For Drive, the app signs in as its service account, so it can see a file
// or folder only if that file or folder is shared with the service account's
// email (Viewer is enough) or set to "Anyone with the link".

import { google } from "googleapis";
import { put } from "@vercel/blob";
import sharp from "sharp";
import { getSql } from "@/lib/db";
import { PHOTO_KINDS, type PhotoKind } from "@/lib/pg/photo-index";

function readOnlyDrive() {
  return google.drive({
    version: "v3",
    auth: new google.auth.GoogleAuth({
      credentials: {
        client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
        private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
      },
      scopes: ["https://www.googleapis.com/auth/drive.readonly"],
    }),
  });
}

export const serviceAccountEmail = () => process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL ?? "";

export type PhotoDetails = {
  accountId: string;
  accountName: string;
  kind: PhotoKind;
  moment: "" | "before" | "after";
  /** YYYY-MM-DD the photos were taken; "" = today (device files) or the file's own date (Drive). */
  takenOn: string;
  addedBy: string;
};

export function cleanDetails(input: Record<string, unknown>, addedBy: string): PhotoDetails | string {
  const text = (value: unknown, max = 300) => String(value ?? "").trim().slice(0, max);
  const accountName = text(input.accountName);
  if (!accountName) return "Pick the account these photos belong to.";
  const kind = text(input.kind, 40);
  if (!(PHOTO_KINDS as readonly string[]).includes(kind)) return "Pick what the photos are of.";
  const moment = text(input.moment, 10);
  const takenOn = text(input.takenOn, 10);
  return {
    accountId: text(input.accountId, 200),
    accountName,
    kind: kind as PhotoKind,
    moment: moment === "before" || moment === "after" ? moment : "",
    takenOn: /^\d{4}-\d{2}-\d{2}$/.test(takenOn) ? takenOn : "",
    addedBy,
  };
}

/**
 * One photo into the index. Returns false when that photo was already there.
 * Crew photos also carry their before / after as the tag the portal shows.
 */
async function addRow(sourceKey: string, store: "blob" | "drive", url: string, details: PhotoDetails, takenAt: string | null, isImage = true, thumbUrl = ""): Promise<boolean> {
  const tag = details.kind === "Crew" ? details.moment : "";
  const rows = (await getSql().query(
    `INSERT INTO photo_index (source_key, store, url, account_id, account_name, kind, moment, linked_type, linked_id, linked_label, linked_href, taken_by, taken_at, is_image, thumb_url, tag)
     VALUES ($1, $2, $3, $4, $5, $6, $7, 'account', $4, 'Open the account', $8, $9, COALESCE($10::timestamptz, now()), $11, $12, $13)
     ON CONFLICT (source_key) DO NOTHING RETURNING id`,
    [sourceKey, store, url, details.accountId, details.accountName, details.kind, details.moment, details.accountId ? `/accounts/${details.accountId}` : "", details.addedBy, takenAt, isImage, thumbUrl, tag]
  )) as unknown[];
  return rows.length > 0;
}

const sourceKeyTaken = async (sourceKey: string) =>
  ((await getSql().query(`SELECT 1 FROM photo_index WHERE source_key = $1 LIMIT 1`, [sourceKey])) as unknown[]).length > 0;

/* ---------- Crew photos from Drive: copied into Blob ---------- */

const CREW_COPY = { fullSide: 2400, fullQuality: 85, thumbSide: 400, thumbQuality: 75 };

/** Photo types the copy can read. iPhone HEIC is not one of them (it must be saved as JPEG first). */
export const COPYABLE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif", "image/tiff"];

/** A Drive photo that cannot be copied (wrong type, unreadable): trying again will not help. */
export class DriveCopyError extends Error {}

/**
 * Copies one Drive photo into Blob storage: a 2400px JPEG (turned the right
 * way up) and a 400px small copy. Read-only on Drive. The Blob names come
 * from the Drive file id, so copying the same file again replaces the same
 * two files instead of making new ones.
 */
export async function copyDrivePhotoToBlob(fileId: string, accountId: string): Promise<{ url: string; thumbUrl: string }> {
  if (!process.env.BLOB_READ_WRITE_TOKEN) throw new Error("File storage is not set up here.");
  const { full, thumb } = await makeCrewCopies(fileId);
  const base = `crew-photos/${encodeURIComponent(accountId || "no-account")}/drive-${fileId}`;
  const options = { access: "public", contentType: "image/jpeg", addRandomSuffix: false, allowOverwrite: true } as const;
  const [fullBlob, thumbBlob] = await Promise.all([put(`${base}.jpg`, full, options), put(`${base}-thumb.jpg`, thumb, options)]);
  return { url: fullBlob.url, thumbUrl: thumbBlob.url };
}

/** A Drive file's type and size, or null when the app cannot see it. Read-only. */
export async function driveFileInfo(fileId: string): Promise<{ mimeType: string; bytes: number } | null> {
  try {
    const { data } = await readOnlyDrive().files.get({ fileId, fields: "mimeType, size", supportsAllDrives: true });
    return { mimeType: String(data.mimeType ?? ""), bytes: Number(data.size ?? 0) };
  } catch {
    return null;
  }
}

/** The two JPEG copies of a Drive photo, made in memory (nothing is saved). */
export async function makeCrewCopies(fileId: string): Promise<{ full: Buffer; thumb: Buffer; originalBytes: number }> {
  const drive = readOnlyDrive();
  const { data: meta } = await drive.files.get({ fileId, fields: "mimeType", supportsAllDrives: true });
  if (!COPYABLE_TYPES.includes(String(meta.mimeType ?? "").toLowerCase())) throw new DriveCopyError(`This kind of file (${meta.mimeType || "unknown"}) cannot be copied. Save it as JPEG first.`);
  const { data } = await drive.files.get({ fileId, alt: "media", supportsAllDrives: true }, { responseType: "arraybuffer" });
  const original = Buffer.from(data as ArrayBuffer);
  let full: Buffer;
  let thumb: Buffer;
  try {
    full = await sharp(original).rotate().resize({ width: CREW_COPY.fullSide, height: CREW_COPY.fullSide, fit: "inside", withoutEnlargement: true }).jpeg({ quality: CREW_COPY.fullQuality }).toBuffer();
    thumb = await sharp(original).rotate().resize({ width: CREW_COPY.thumbSide, height: CREW_COPY.thumbSide, fit: "cover" }).jpeg({ quality: CREW_COPY.thumbQuality }).toBuffer();
  } catch {
    throw new DriveCopyError("This photo could not be read.");
  }
  return { full, thumb, originalBytes: original.length };
}

/** Crew Drive photos copied per "Add from Google Drive": each copy takes a few seconds. Run again for the rest. */
const MAX_CREW_COPIES = 60;

// Noon on the chosen day, so the photo lands on that day in any US time zone.
const noonOf = (day: string) => (day ? `${day}T12:00:00-05:00` : null);

/** A file the person just uploaded (already in Blob storage at `url`). */
export async function addUploadedPhoto(url: string, details: PhotoDetails): Promise<void> {
  await addRow(`manual:${crypto.randomUUID()}`, "blob", url, details, noonOf(details.takenOn));
}

/* ---------- Google Drive ---------- */

type DriveRef = { kind: "file" | "folder"; id: string };

/** Reads the links a person pasted (one per line, or separated by spaces / commas). */
export function parseDriveLinks(text: string): { refs: DriveRef[]; unknown: string[] } {
  const refs: DriveRef[] = [];
  const unknown: string[] = [];
  const seen = new Set<string>();
  for (const part of text.split(/[\s,]+/).map((piece) => piece.trim()).filter(Boolean)) {
    const folder = part.match(/\/folders\/([A-Za-z0-9_-]{10,})/)?.[1];
    const file = part.match(/\/d\/([A-Za-z0-9_-]{10,})/)?.[1] ?? part.match(/[?&]id=([A-Za-z0-9_-]{10,})/)?.[1];
    const ref: DriveRef | null = folder ? { kind: "folder", id: folder } : file ? { kind: "file", id: file } : null;
    if (!ref) {
      if (/^https?:/i.test(part)) unknown.push(part.slice(0, 80));
      continue;
    }
    if (!seen.has(ref.id)) {
      seen.add(ref.id);
      refs.push(ref);
    }
  }
  return { refs, unknown };
}

export type DriveImportResult = { added: number; already: number; notPhotos: number; problems: string[] };

// Google answers "accessNotConfigured" when the Google Drive API is not
// turned on in the Google Cloud project of the app's Google account. Then
// the app cannot look inside Drive at all (no folders, no checking a file).
function driveIsOff(error: unknown): boolean {
  const e = error as { errors?: { reason?: string }[]; response?: { data?: { error?: { errors?: { reason?: string }[] } } }; message?: string };
  const reason = e?.errors?.[0]?.reason ?? e?.response?.data?.error?.errors?.[0]?.reason ?? "";
  return reason === "accessNotConfigured" || /has not been used in project|is disabled/i.test(String(e?.message ?? ""));
}

const DRIVE_OFF_FOLDER =
  "The app cannot look inside Google Drive folders yet: the Google Drive API is not turned on for the app's Google account. Until it is, paste the links of the photos themselves (each photo set to \"Anyone with the link\").";

const MAX_PER_FOLDER = 300;

/**
 * Indexes the Drive photos behind the pasted links: single files, and every
 * picture directly inside a folder. Read-only on Drive.
 */
export async function importFromDrive(text: string, details: PhotoDetails): Promise<DriveImportResult> {
  const { refs, unknown } = parseDriveLinks(text);
  const result: DriveImportResult = { added: 0, already: 0, notPhotos: 0, problems: unknown.map((link) => `Not a Google Drive link: ${link}`) };
  if (refs.length === 0) {
    if (result.problems.length === 0) result.problems.push("Paste a Google Drive link to a photo or to a folder of photos.");
    return result;
  }
  const drive = readOnlyDrive();
  const share = `Share it with ${serviceAccountEmail() || "the app's Google account"} (Viewer), or set it to "Anyone with the link", then try again.`;

  const crew = details.kind === "Crew";
  let copies = 0;
  let copyLimitHit = false;
  const addFile = async (file: { id?: string | null; mimeType?: string | null; createdTime?: string | null; imageMediaMetadata?: { time?: string | null } | null }) => {
    if (!file.id) return;
    if (!String(file.mimeType ?? "").startsWith("image/")) {
      result.notPhotos++;
      return;
    }
    // The day typed on the form wins; else the file's own date.
    const takenAt = noonOf(details.takenOn) ?? file.createdTime ?? null;
    const sourceKey = `drive-import:${file.id}`;
    if (!crew) {
      const added = await addRow(sourceKey, "drive", `https://drive.google.com/file/d/${file.id}/view`, details, takenAt);
      if (added) result.added++;
      else result.already++;
      return;
    }
    // Crew: copied into Blob, so the customer can open it. Checked first, so
    // a photo already here is never copied again.
    if (await sourceKeyTaken(sourceKey)) {
      result.already++;
      return;
    }
    if (copies >= MAX_CREW_COPIES) {
      copyLimitHit = true;
      return;
    }
    copies++;
    try {
      const copy = await copyDrivePhotoToBlob(file.id, details.accountId);
      const added = await addRow(sourceKey, "blob", copy.url, details, takenAt, true, copy.thumbUrl);
      if (added) result.added++;
      else result.already++;
    } catch (error) {
      result.problems.push(error instanceof DriveCopyError ? `${file.id}: ${error.message}` : `${file.id}: could not be copied. Try again.`);
    }
  };

  let unchecked = false;
  for (const ref of refs) {
    try {
      if (ref.kind === "file") {
        const { data } = await drive.files.get({ fileId: ref.id, fields: "id, mimeType, createdTime", supportsAllDrives: true });
        await addFile(data);
      } else {
        let pageToken: string | undefined;
        let count = 0;
        do {
          const { data } = await drive.files.list({
            q: `'${ref.id}' in parents and trashed = false`,
            fields: "nextPageToken, files(id, mimeType, createdTime)",
            pageSize: 100,
            pageToken,
            supportsAllDrives: true,
            includeItemsFromAllDrives: true,
          });
          for (const file of data.files ?? []) {
            if (count >= MAX_PER_FOLDER) break;
            count++;
            await addFile(file);
          }
          pageToken = count >= MAX_PER_FOLDER ? undefined : (data.nextPageToken ?? undefined);
        } while (pageToken);
        if (count === 0) result.problems.push(`That folder looks empty, or the app cannot see inside it. ${share}`);
        if (count >= MAX_PER_FOLDER) result.problems.push(`Only the first ${MAX_PER_FOLDER} files of a folder are taken at a time. Run it again for the rest.`);
      }
    } catch (error) {
      if (driveIsOff(error)) {
        if (crew) {
          // A Crew photo must be copied, and the app cannot read Drive at all.
          const text = "Crew photos are copied from Drive into the app, and the app cannot read Google Drive yet (the Google Drive API is not turned on). Upload them from this device instead.";
          if (!result.problems.includes(text)) result.problems.push(text);
        } else if (ref.kind === "file") {
          // The app cannot check the file, so it is listed as given. Its picture
          // shows as long as the file is set to "Anyone with the link" in Drive.
          const added = await addRow(`drive-link:${ref.id}`, "drive", `https://drive.google.com/file/d/${ref.id}/view`, details, noonOf(details.takenOn));
          if (added) result.added++;
          else result.already++;
          unchecked = true;
        } else if (!result.problems.includes(DRIVE_OFF_FOLDER)) {
          result.problems.push(DRIVE_OFF_FOLDER);
        }
      } else {
        result.problems.push(`The app cannot open that ${ref.kind}. ${share}`);
      }
    }
  }
  if (copyLimitHit) result.problems.push(`${MAX_CREW_COPIES} photos were copied this time. Tap "Add from Google Drive" again with the same link for the rest (photos already copied are skipped).`);
  if (unchecked) result.problems.push("These were added without the app being able to look at them. If a photo shows blank, open it in Drive, tap Share and set \"Anyone with the link\".");
  return result;
}

/** A short-lived picture link for a Drive file the app indexed (for the grid and full screen). "" when it cannot be read. */
export async function driveThumbnail(fileId: string, size: number): Promise<string> {
  try {
    const { data } = await readOnlyDrive().files.get({ fileId, fields: "thumbnailLink", supportsAllDrives: true });
    const link = data.thumbnailLink ?? "";
    return link ? link.replace(/=s\d+$/, `=s${size}`) : "";
  } catch {
    return "";
  }
}
