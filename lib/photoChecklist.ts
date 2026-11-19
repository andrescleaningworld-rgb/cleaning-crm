// CW Now "Photo Checklist" crew screen: the rules the phone
// (app/porter/[code]/CrewPhotoChecklist.tsx), the server
// (lib/pg/photo-checklist.ts) and the office (CW Now card, Work Report PDF)
// share. Plain TS, safe in the browser.
//
// An account's CW Now link opens either the Classic screen (as before) or the
// Photo Checklist (checklist_templates.crew_screen, migration 085). On the
// Photo Checklist each checklist item is a big tile: a photo of it checks it
// off. Items the office marked "Photo required: No" (noPhoto on the item) are
// checked with one tap. The account's checklist tabs are the per-person
// routines: a person's own link (?tab=) opens on theirs.
//
// One visit = one shift on one phone. Its id is made on the phone ("pc-" +
// a random id) and is the checklist's client_id once Finish is tapped
// (migration 066), so a Finish sent twice is kept once and the Work Report
// can find every photo of the visit, also the ones added after Finish.

import type { ChecklistItemDef } from "@/lib/checklistTemplate";

export type CrewScreen = "classic" | "photo";
export const isCrewScreen = (value: unknown): value is CrewScreen => value === "classic" || value === "photo";

/** A Photo Checklist visit id ("pc-<uuid>"); fits the checklist/photo id rule (8-64 letters, digits, dashes). */
export const VISIT_ID_PREFIX = "pc-";
export const isVisitId = (value: unknown): value is string => typeof value === "string" && /^pc-[A-Za-z0-9-]{8,60}$/.test(value);

/** The "+ Extra Photo" button's photos (not on the list). */
export const EXTRA_ITEM_KEY = "extra";
export const isItemKey = (value: unknown): value is string => typeof value === "string" && value.length > 0 && value.length <= 200;

/** Photo required (the default on the Photo Checklist), unless the office set "Photo required: No". */
export const photoRequired = (item: Pick<ChecklistItemDef, "noPhoto">) => item.noPhoto !== true;

/**
 * Where a photo's time comes from:
 *   camera       taken in the app (the camera's time)
 *   exif         picked from the gallery: the time saved inside the photo
 *   added_later  picked from the gallery with no time inside: the moment it was added
 */
export type PhotoTimeSource = "camera" | "exif" | "added_later";
export const isPhotoTimeSource = (value: unknown): value is PhotoTimeSource => value === "camera" || value === "exif" || value === "added_later";

/** A gallery photo taken more than this long before it was added is flagged. */
export const EARLY_PHOTO_MS = 24 * 60 * 60 * 1000;
/** A little room before "the visit started" (the phone's first tap) before a photo counts as earlier. */
const START_GRACE_MS = 10 * 60 * 1000;

/**
 * What the report and the office say about a photo's time:
 *   early        a gallery photo taken before the visit started, or more than a day before it was added
 *   added_later  a gallery photo with no time inside: the time shown is when it was added
 *   null         nothing to say
 */
export function photoTimeFlag(photo: { takenAt: string; timeSource: string | null; addedAt: string | null }, visitStartedAt: string | null): "early" | "added_later" | null {
  if (photo.timeSource === "added_later") return "added_later";
  if (photo.timeSource !== "exif") return null;
  const taken = new Date(photo.takenAt).getTime();
  if (!Number.isFinite(taken)) return null;
  const started = visitStartedAt ? new Date(visitStartedAt).getTime() : NaN;
  if (Number.isFinite(started) && taken < started - START_GRACE_MS) return "early";
  const added = photo.addedAt ? new Date(photo.addedAt).getTime() : NaN;
  if (Number.isFinite(added) && taken < added - EARLY_PHOTO_MS) return "early";
  return null;
}

/** "Nov 17, 2026 · 7:42 PM" in New York (the stamp, the report). */
export function stampTimeText(at: Date | string): string {
  const date = typeof at === "string" ? new Date(at) : at;
  const day = date.toLocaleDateString("en-US", { timeZone: "America/New_York", month: "short", day: "numeric", year: "numeric" });
  const time = date.toLocaleTimeString("en-US", { timeZone: "America/New_York", hour: "numeric", minute: "2-digit" });
  return `${day} · ${time}`;
}

/** The lines burned onto a Photo Checklist photo: time and date, the place, the item and who took it. */
export function photoStampLines(input: { at: string; timeSource: PhotoTimeSource; placeName: string; itemLabel: string; personName: string }): string[] {
  const time = stampTimeText(input.at) + (input.timeSource === "added_later" ? " (added later)" : "");
  const third = [input.itemLabel.trim(), input.personName.trim()].filter(Boolean).join(" · ");
  return [time, input.placeName.trim(), third].filter(Boolean);
}
