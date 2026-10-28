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

/** One crew photo as the customer portal shows it. */
export type PortalPhoto = { id: number; url: string; thumbUrl: string; takenAt: string; tag: CrewPhotoTag };
