// Crew photos on the server (rules and words in lib/crewPhotos.ts). Server
// only. They are kept like every other photo: the files in Blob storage
// (crew-photos/<account>/), one row each in photo_index with kind "Crew", the
// crew member's name, the time, the optional tag and a ~400px copy
// (migrations 063 and 064). They show on the account's Photos page, and in
// the customer portal's Photos unless hidden.
//
// Time stamp and on-site check (migration 082): each photo is stamped at the
// bottom (date + time on the server, New York; account name and address;
// lib/photoStamp.tsx) and the unstamped original is kept too (original_url).
// The phone's location from when the photo was added (if the crew allowed
// it) is saved with its distance from the account's map point and a check:
// on_site / off_site / no_location / no_site (lib/photoLocation.ts). An
// off_site photo starts hidden from the customer until the office shows it.
// The customer portal only ever gets the stamped photo, never the check.

import { put } from "@/lib/files";
import { getSql } from "@/lib/db";
import { hiddenAtFirst, CREW_THUMB_SIZE, type CrewPhotoTag, type PortalPhoto } from "@/lib/crewPhotos";
import { siteCheckOf, type PhoneLocation } from "@/lib/photoLocation";
import { stampPhoto } from "@/lib/photoStamp";
import { accountPlace } from "@/lib/pg/nearby-accounts";

const clean = (value: unknown) => String(value ?? "").trim();
const typed = async <T,>(query: PromiseLike<unknown>): Promise<T> => (await query) as T;

let readyCache = false;

/** Crew photos can be saved here: file storage, and migration 064 is in. */
export async function crewPhotosReady(): Promise<boolean> {
  if (!process.env.BLOB_READ_WRITE_TOKEN) return false;
  if (readyCache) return true;
  try {
    const rows = await typed<{ ok: boolean }[]>(getSql()`
      SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'photo_index' AND column_name = 'hidden_from_customer') AS ok
    `);
    readyCache = rows[0]?.ok === true;
  } catch {
    readyCache = false;
  }
  return readyCache;
}

let stampCache = false;

/** Migration 082 is in: the stamp, the original and the on-site check can be saved. */
async function stampReady(): Promise<boolean> {
  if (stampCache) return true;
  try {
    const rows = await typed<{ ok: boolean }[]>(getSql()`
      SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'photo_index' AND column_name = 'site_check') AS ok
    `);
    stampCache = rows[0]?.ok === true;
  } catch {
    stampCache = false;
  }
  return stampCache;
}

const MAX_BYTES = 8 * 1024 * 1024;

/** A sane moment for the photo: the phone's time when it is believable (the last 30 days, not ahead), else now. */
function photoMoment(value: string): string {
  const time = new Date(value).getTime();
  const now = Date.now();
  if (!Number.isFinite(time) || time > now + 5 * 60_000 || time < now - 30 * 86_400_000) return new Date(now).toISOString();
  return new Date(Math.min(time, now)).toISOString();
}

/**
 * One photo from the crew. `clientId` is made on the phone, so a photo sent
 * again after a lost answer (bad signal) is saved once: the second time it
 * only says "already here".
 */
export async function addCrewPhoto(input: {
  accountId: string;
  accountName: string;
  clientId: string;
  name: string;
  tag: CrewPhotoTag;
  takenAt: string;
  full: File;
  thumb: File | null;
  /** Route rows: the row it was taken on ("Warehouse office"). */
  caption?: string;
  /** Where the phone was when the photo was added; null = not allowed / not found. */
  location?: PhoneLocation | null;
}): Promise<{ id: number; already: boolean }> {
  const sourceKey = `crew:${input.clientId}`;
  const sql = getSql();
  const existing = await typed<{ id: number | string }[]>(sql`SELECT id FROM photo_index WHERE source_key = ${sourceKey} LIMIT 1`);
  if (existing[0]) return { id: Number(existing[0].id), already: true };
  if (!/^image\//i.test(input.full.type)) throw new CrewPhotoError("That is not a photo.");
  if (input.full.size > MAX_BYTES || (input.thumb && input.thumb.size > MAX_BYTES)) throw new CrewPhotoError("That photo is too big.");

  const folder = `crew-photos/${encodeURIComponent(input.accountId)}`;
  const file = crypto.randomUUID();

  if (await stampReady()) return addStampedCrewPhoto(input, sourceKey, folder, file);

  const full = await put(`${folder}/${file}.jpg`, input.full, { access: "public", contentType: input.full.type || "image/jpeg", addRandomSuffix: false });
  const thumb = input.thumb ? await put(`${folder}/${file}-thumb.jpg`, input.thumb, { access: "public", contentType: input.thumb.type || "image/jpeg", addRandomSuffix: false }) : null;
  const moment = input.tag === "before" || input.tag === "after" ? input.tag : "";
  const rows = await typed<{ id: number | string }[]>(sql`
    INSERT INTO photo_index (source_key, store, url, account_id, account_name, kind, moment, linked_type, linked_id, linked_label, linked_href,
                             taken_by, taken_at, is_image, caption, thumb_url, tag, hidden_from_customer)
    VALUES (${sourceKey}, 'blob', ${full.url}, ${input.accountId}, ${input.accountName}, 'Crew', ${moment}, 'account', ${input.accountId}, 'Open the account',
            ${`/accounts/${input.accountId}`}, ${input.name}, ${photoMoment(input.takenAt)}, true, ${clean(input.caption).slice(0, 200)}, ${thumb?.url ?? ""}, ${input.tag}, ${hiddenAtFirst(input.tag)})
    ON CONFLICT (source_key) DO NOTHING
    RETURNING id
  `);
  if (!rows[0]) {
    // The same photo arrived twice at the same moment: the first one is kept.
    const again = await typed<{ id: number | string }[]>(sql`SELECT id FROM photo_index WHERE source_key = ${sourceKey} LIMIT 1`);
    return { id: Number(again[0]?.id ?? 0), already: true };
  }
  return { id: Number(rows[0].id), already: false };
}

/**
 * addCrewPhoto once migration 082 is in: the stamped copy is the photo
 * (url, and its small copy), the phone's file is kept as original_url, and
 * the on-site check is saved. When the stamp cannot be made, the photo goes
 * in as it came (still with its check).
 */
async function addStampedCrewPhoto(input: Parameters<typeof addCrewPhoto>[0], sourceKey: string, folder: string, file: string): Promise<{ id: number; already: boolean }> {
  const sql = getSql();
  const uploadedAt = new Date();
  const moment = input.tag === "before" || input.tag === "after" ? input.tag : "";
  const place = await accountPlace(input.accountId).catch(() => null);
  const location = input.location ?? null;
  const { check, distanceFt } = siteCheckOf(location, place?.point ?? null);
  const original = Buffer.from(await input.full.arrayBuffer());
  const stamped = await stampPhoto(original, { at: uploadedAt, accountName: place?.name || input.accountName, address: place?.address ?? "" }, CREW_THUMB_SIZE);

  const kept = await put(`${folder}/${file}-original.jpg`, input.full, { access: "public", contentType: input.full.type || "image/jpeg", addRandomSuffix: false });
  const full = stamped ? await put(`${folder}/${file}.jpg`, stamped.full, { access: "public", contentType: "image/jpeg", addRandomSuffix: false }) : kept;
  const thumb = stamped
    ? await put(`${folder}/${file}-thumb.jpg`, stamped.thumb, { access: "public", contentType: "image/jpeg", addRandomSuffix: false })
    : input.thumb
      ? await put(`${folder}/${file}-thumb.jpg`, input.thumb, { access: "public", contentType: input.thumb.type || "image/jpeg", addRandomSuffix: false })
      : null;
  // Off site: not in the customer portal until the office has looked (Photos -> Show it).
  const hidden = hiddenAtFirst(input.tag) || check === "off_site";
  const distanceM = distanceFt == null ? null : distanceFt / 3.28084;

  const rows = await typed<{ id: number | string }[]>(sql`
    INSERT INTO photo_index (source_key, store, url, account_id, account_name, kind, moment, linked_type, linked_id, linked_label, linked_href,
                             taken_by, taken_at, is_image, caption, thumb_url, tag, hidden_from_customer,
                             original_url, uploaded_at, geo_lat, geo_lng, geo_accuracy_m, site_distance_m, site_check)
    VALUES (${sourceKey}, 'blob', ${full.url}, ${input.accountId}, ${input.accountName}, 'Crew', ${moment}, 'account', ${input.accountId}, 'Open the account',
            ${`/accounts/${input.accountId}`}, ${input.name}, ${photoMoment(input.takenAt)}, true, ${clean(input.caption).slice(0, 200)}, ${thumb?.url ?? ""}, ${input.tag}, ${hidden},
            ${kept.url}, ${uploadedAt.toISOString()}, ${location?.lat ?? null}, ${location?.lng ?? null}, ${location ? Math.round(location.accuracyM) : null}, ${distanceM}, ${check})
    ON CONFLICT (source_key) DO NOTHING
    RETURNING id
  `);
  if (!rows[0]) {
    const again = await typed<{ id: number | string }[]>(sql`SELECT id FROM photo_index WHERE source_key = ${sourceKey} LIMIT 1`);
    return { id: Number(again[0]?.id ?? 0), already: true };
  }
  return { id: Number(rows[0].id), already: false };
}

/** A problem with the photo itself: sending it again will not help. */
export class CrewPhotoError extends Error {}

/* ---------- the customer portal ---------- */

/** "Show crew photos to customer" for this account (on unless turned off; on before migration 064). */
export async function photosShownToCustomer(accountId: string): Promise<boolean> {
  try {
    const rows = await typed<{ shown: string | null }[]>(getSql()`
      SELECT to_jsonb(t) ->> 'show_photos_to_customer' AS shown FROM checklist_templates t WHERE account_id = ${accountId} LIMIT 1
    `);
    return rows[0]?.shown !== "false";
  } catch {
    return true;
  }
}

export async function setPhotosShownToCustomer(accountId: string, on: boolean): Promise<void> {
  const rows = await typed<unknown[]>(getSql()`UPDATE checklist_templates SET show_photos_to_customer = ${on}, updated_at = now() WHERE account_id = ${accountId} RETURNING account_id`);
  if (rows.length === 0) throw new Error("This account has no CW Now link yet.");
}

/**
 * The crew photos this customer may see: their own account only, newest
 * first, never a hidden one, and none when the account's setting is off.
 */
export async function listPortalPhotos(accountId: string, limit = 240): Promise<PortalPhoto[]> {
  const id = clean(accountId);
  if (!id || !(await crewPhotosReady()) || !(await photosShownToCustomer(id))) return [];
  const rows = await typed<{ id: number | string; url: string; thumb_url: string; taken_at: string | Date; tag: string }[]>(getSql()`
    SELECT id, url, thumb_url, taken_at, tag FROM photo_index
    WHERE kind = 'Crew' AND account_id = ${id} AND NOT hidden_from_customer AND store = 'blob'
    ORDER BY taken_at DESC, id DESC
    LIMIT ${Math.min(500, Math.max(1, limit))}
  `);
  return rows.map((row) => ({
    id: Number(row.id),
    url: row.url,
    thumbUrl: clean(row.thumb_url) || row.url,
    takenAt: new Date(row.taken_at).toISOString(),
    tag: row.tag === "before" || row.tag === "after" || row.tag === "problem" ? row.tag : "",
  }));
}

/** Staff: hide one crew photo from the customer, or show it again. */
export async function setPhotoHiddenFromCustomer(photoId: number, hidden: boolean): Promise<boolean> {
  const rows = await typed<unknown[]>(getSql()`UPDATE photo_index SET hidden_from_customer = ${hidden} WHERE id = ${photoId} AND kind = 'Crew' RETURNING id`);
  return rows.length > 0;
}

/* ---------- Photos -> Import photos (staff) ---------- */

// Old crew photos (sent on WhatsApp, kept in a Google Drive folder) put into
// an account as "Crew" photos, so the customer portal shows them under the
// day they were taken. Each file is known by its own fingerprint (SHA-256 of
// the original file, worked out in the browser): the same file imported
// again for the same account is skipped, so an import can be run again.

const importKey = (accountId: string, hash: string) => `import:${accountId}:${hash}`;

/** Which of these fingerprints this account already has. */
export async function importedAlready(accountId: string, hashes: string[]): Promise<Set<string>> {
  const clean = [...new Set(hashes.filter((hash) => /^[0-9a-f]{64}$/.test(hash)))];
  if (clean.length === 0) return new Set();
  const keys = clean.map((hash) => importKey(accountId, hash));
  const rows = await typed<{ source_key: string }[]>(getSql()`SELECT source_key FROM photo_index WHERE source_key = ANY(${keys})`);
  const prefix = importKey(accountId, "");
  return new Set(rows.map((row) => row.source_key.slice(prefix.length)));
}

/** A believable "taken" moment: from 2000 up to tomorrow. Anything else is refused. */
function importMoment(value: string): string {
  const time = new Date(value).getTime();
  if (!Number.isFinite(time) || time < Date.UTC(2000, 0, 1) || time > Date.now() + 86_400_000) throw new CrewPhotoError("The photo's date is not a real date.");
  return new Date(time).toISOString();
}

export async function addImportedPhoto(input: { accountId: string; accountName: string; hash: string; takenAt: string; full: File; thumb: File | null; by: string }): Promise<{ id: number; already: boolean }> {
  if (!/^[0-9a-f]{64}$/.test(input.hash)) throw new CrewPhotoError("The photo has no fingerprint.");
  const sourceKey = importKey(input.accountId, input.hash);
  const sql = getSql();
  const existing = await typed<{ id: number | string }[]>(sql`SELECT id FROM photo_index WHERE source_key = ${sourceKey} LIMIT 1`);
  if (existing[0]) return { id: Number(existing[0].id), already: true };
  if (!/^image\//i.test(input.full.type)) throw new CrewPhotoError("That is not a photo.");
  if (input.full.size > MAX_BYTES || (input.thumb && input.thumb.size > MAX_BYTES)) throw new CrewPhotoError("That photo is too big.");
  const takenAt = importMoment(input.takenAt);

  const folder = `crew-photos/${encodeURIComponent(input.accountId)}`;
  const file = `import-${input.hash.slice(0, 24)}`;
  const full = await put(`${folder}/${file}.jpg`, input.full, { access: "public", contentType: input.full.type || "image/jpeg", addRandomSuffix: true });
  const thumb = input.thumb ? await put(`${folder}/${file}-thumb.jpg`, input.thumb, { access: "public", contentType: input.thumb.type || "image/jpeg", addRandomSuffix: true }) : null;
  const rows = await typed<{ id: number | string }[]>(sql`
    INSERT INTO photo_index (source_key, store, url, account_id, account_name, kind, moment, linked_type, linked_id, linked_label, linked_href,
                             taken_by, taken_at, is_image, caption, thumb_url, tag, hidden_from_customer)
    VALUES (${sourceKey}, 'blob', ${full.url}, ${input.accountId}, ${input.accountName}, 'Crew', '', 'account', ${input.accountId}, 'Open the account',
            ${`/accounts/${input.accountId}`}, ${`Imported by ${input.by}`.slice(0, 120)}, ${takenAt}, true, '', ${thumb?.url ?? ""}, '', false)
    ON CONFLICT (source_key) DO NOTHING
    RETURNING id
  `);
  if (!rows[0]) return { id: 0, already: true };
  return { id: Number(rows[0].id), already: false };
}
