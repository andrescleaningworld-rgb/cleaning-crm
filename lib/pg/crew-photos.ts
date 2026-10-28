// Crew photos on the server (rules and words in lib/crewPhotos.ts). Server
// only. They are kept like every other photo: the files in Blob storage
// (crew-photos/<account>/), one row each in photo_index with kind "Crew", the
// crew member's name, the time, the optional tag and a ~400px copy
// (migrations 063 and 064). They show on the account's Photos page, and in
// the customer portal's Photos unless hidden.

import { put } from "@vercel/blob";
import { getSql } from "@/lib/db";
import { hiddenAtFirst, type CrewPhotoTag, type PortalPhoto } from "@/lib/crewPhotos";

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
}): Promise<{ id: number; already: boolean }> {
  const sourceKey = `crew:${input.clientId}`;
  const sql = getSql();
  const existing = await typed<{ id: number | string }[]>(sql`SELECT id FROM photo_index WHERE source_key = ${sourceKey} LIMIT 1`);
  if (existing[0]) return { id: Number(existing[0].id), already: true };
  if (!/^image\//i.test(input.full.type)) throw new CrewPhotoError("That is not a photo.");
  if (input.full.size > MAX_BYTES || (input.thumb && input.thumb.size > MAX_BYTES)) throw new CrewPhotoError("That photo is too big.");

  const folder = `crew-photos/${encodeURIComponent(input.accountId)}`;
  const file = crypto.randomUUID();
  const full = await put(`${folder}/${file}.jpg`, input.full, { access: "public", contentType: input.full.type || "image/jpeg", addRandomSuffix: false });
  const thumb = input.thumb ? await put(`${folder}/${file}-thumb.jpg`, input.thumb, { access: "public", contentType: input.thumb.type || "image/jpeg", addRandomSuffix: false }) : null;
  const moment = input.tag === "before" || input.tag === "after" ? input.tag : "";
  const rows = await typed<{ id: number | string }[]>(sql`
    INSERT INTO photo_index (source_key, store, url, account_id, account_name, kind, moment, linked_type, linked_id, linked_label, linked_href,
                             taken_by, taken_at, is_image, caption, thumb_url, tag, hidden_from_customer)
    VALUES (${sourceKey}, 'blob', ${full.url}, ${input.accountId}, ${input.accountName}, 'Crew', ${moment}, 'account', ${input.accountId}, 'Open the account',
            ${`/accounts/${input.accountId}`}, ${input.name}, ${photoMoment(input.takenAt)}, true, '', ${thumb?.url ?? ""}, ${input.tag}, ${hiddenAtFirst(input.tag)})
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
  if (rows.length === 0) throw new Error("This account has no Crew Link yet.");
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
