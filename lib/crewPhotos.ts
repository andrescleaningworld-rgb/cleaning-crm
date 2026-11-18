// Crew photos (Crew Link "Send photos"): the words and rules the crew screen,
// the server and the customer portal share. Plain TS, safe in the browser.
// Server side: lib/pg/crew-photos.ts. Table: photo_index, kind "Crew"
// (migration 064).

/** The crew's optional one-tap tag. "" = no tag. */
export const CREW_PHOTO_TAGS = ["before", "after", "problem"] as const;
export type CrewPhotoTag = (typeof CREW_PHOTO_TAGS)[number] | "";
export const isCrewPhotoTag = (value: unknown): value is CrewPhotoTag => value === "" || CREW_PHOTO_TAGS.includes(value as (typeof CREW_PHOTO_TAGS)[number]);

/** A "problem" photo starts hidden from the customer until the office un-hides it. */
export const hiddenAtFirst = (tag: CrewPhotoTag) => tag === "problem";

/** The photo (long side, px) and its small copy, both JPEG at this quality. */
export const CREW_PHOTO_SIZE = 1600;
export const CREW_THUMB_SIZE = 400;
export const CREW_PHOTO_QUALITY = 0.8;

/** Most photos picked at once. */
export const CREW_PHOTO_MAX_BATCH = 60;

/** One crew photo (or short video) as the customer portal shows it. thumbUrl "" = a video with no still. */
export type PortalPhoto = { id: number; url: string; thumbUrl: string; takenAt: string; tag: CrewPhotoTag; video: boolean };

/* ---------- files that go straight from the phone to storage ---------- */

// A photo the phone cannot make small (an iPhone HEIC photo on an Android
// phone, a photo too big for the phone's memory) and every video go as they
// are, straight from the phone to file storage (Vercel Blob client upload:
// app/api/porter-checklist/[code]/photos/upload), not through the 4.5 MB
// request. Then the phone tells the server (photos route, uploadedUrl): a
// photo is turned into a JPEG there and saved like any other crew photo; a
// video is saved as it is (photo_index.is_image = false).

/** The folder the phone uploads into: crew-uploads/<the photo's id>.<ext>. */
export const CREW_UPLOAD_FOLDER = "crew-uploads";
/** Longest video, in seconds (a little room over one minute). */
export const CREW_VIDEO_MAX_SECONDS = 65;
export const CREW_VIDEO_MAX_BYTES = 100 * 1024 * 1024;
/** A photo sent as it is (not made small on the phone). */
export const CREW_RAW_PHOTO_MAX_BYTES = 40 * 1024 * 1024;

const PHOTO_TYPES: Record<string, string> = { heic: "image/heic", heif: "image/heif", jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", gif: "image/gif", avif: "image/avif" };
// Videos: mp4 and mov only (what Android and iPhone cameras record).
const VIDEO_TYPES: Record<string, string> = { mp4: "video/mp4", mov: "video/quicktime" };
/** What an upload permission allows: photo types for a photo's path, mp4 / mov for a video's. */
export const CREW_PHOTO_UPLOAD_TYPES = [...new Set(Object.values(PHOTO_TYPES))];
export const CREW_VIDEO_UPLOAD_TYPES = [...new Set(Object.values(VIDEO_TYPES))];

/** The upload's pathname for this photo id and extension. */
export const crewUploadPath = (clientId: string, ext: string) => `${CREW_UPLOAD_FOLDER}/${clientId}.${ext}`;
/** "crew-uploads/<id>.<ext>" -> its id and extension; null when it is not one. */
export function parseCrewUploadPath(pathname: string): { clientId: string; ext: string } | null {
  const m = new RegExp(`^${CREW_UPLOAD_FOLDER}/([A-Za-z0-9-]{8,64})\\.([a-z0-9]{2,5})$`).exec(pathname);
  if (!m || !(m[2] in PHOTO_TYPES || m[2] in VIDEO_TYPES)) return null;
  return { clientId: m[1], ext: m[2] };
}
export const isVideoExt = (ext: string) => ext in VIDEO_TYPES;
export const uploadContentType = (ext: string) => VIDEO_TYPES[ext] ?? PHOTO_TYPES[ext] ?? "application/octet-stream";

/** A picked file's extension for the upload (from its type, else its name); "" = not a photo or video. */
export function crewUploadExt(file: { name: string; type: string }): string {
  const type = file.type.toLowerCase();
  for (const [ext, each] of [...Object.entries(VIDEO_TYPES), ...Object.entries(PHOTO_TYPES)]) if (type && each === type) return ext === "jpeg" ? "jpg" : ext;
  const named = (/\.([a-z0-9]{2,5})$/i.exec(file.name)?.[1] ?? "").toLowerCase();
  if (named in PHOTO_TYPES || named in VIDEO_TYPES) return named === "jpeg" ? "jpg" : named;
  // Any other kind (webm / 3gp video, DNG raw photo…): not one we take.
  return "";
}

/** A picked file that is a video. */
export const isVideoFile = (file: { name: string; type: string }) => file.type.toLowerCase().startsWith("video/") || isVideoExt(crewUploadExt(file));

/** A saved file's address that is a video (also a signed "/api/files/…mp4?e=…" link). */
export const isVideoUrl = (url: string) => /\.(mp4|mov)(\?|#|$)/i.test(String(url ?? ""));
