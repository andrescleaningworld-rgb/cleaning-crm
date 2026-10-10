// Adding photos to the photo index by hand: files from the person's device
// (kept in Blob storage under photos/), or photos that already sit in Google
// Drive (indexed where they are; nothing is copied, moved or changed in
// Drive). Drive is only ever read here, with a read-only scope.
//
// For Drive, the app signs in as its service account, so it can see a file
// or folder only if that file or folder is shared with the service account's
// email (Viewer is enough) or set to "Anyone with the link".

import { google } from "googleapis";
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

/** One photo into the index. Returns false when that photo was already there. */
async function addRow(sourceKey: string, store: "blob" | "drive", url: string, details: PhotoDetails, takenAt: string | null, isImage = true): Promise<boolean> {
  const rows = (await getSql().query(
    `INSERT INTO photo_index (source_key, store, url, account_id, account_name, kind, moment, linked_type, linked_id, linked_label, linked_href, taken_by, taken_at, is_image)
     VALUES ($1, $2, $3, $4, $5, $6, $7, 'account', $4, 'Open the account', $8, $9, COALESCE($10::timestamptz, now()), $11)
     ON CONFLICT (source_key) DO NOTHING RETURNING id`,
    [sourceKey, store, url, details.accountId, details.accountName, details.kind, details.moment, details.accountId ? `/accounts/${details.accountId}` : "", details.addedBy, takenAt, isImage]
  )) as unknown[];
  return rows.length > 0;
}

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

  const addFile = async (file: { id?: string | null; mimeType?: string | null; createdTime?: string | null; imageMediaMetadata?: { time?: string | null } | null }) => {
    if (!file.id) return;
    if (!String(file.mimeType ?? "").startsWith("image/")) {
      result.notPhotos++;
      return;
    }
    // The day typed on the form wins; else the file's own date.
    const takenAt = noonOf(details.takenOn) ?? file.createdTime ?? null;
    const added = await addRow(`drive-import:${file.id}`, "drive", `https://drive.google.com/file/d/${file.id}/view`, details, takenAt);
    if (added) result.added++;
    else result.already++;
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
        if (ref.kind === "file") {
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
