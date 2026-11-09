// Proof of fix: a complaint is marked resolved only with at least one "after"
// photo, or (staff only) "No photo needed" and why. The proof is a 'fixed'
// event on the complaint (complaint_events, migration 075). Before 075 there
// is nowhere to keep it, so nothing is required (closing works as before).
// Server only.

import { getSql } from "@/lib/db";
import { addComplaintEvent, complaintEventsReady, listComplaintEvents } from "@/lib/pg/complaint-events";

/** True when this status means "resolved" (Closed, Resolved, Resolved by Sub), not Merged. */
export const isResolvedStatus = (status: unknown) => /^(closed|resolved)/i.test(String(status ?? "").trim());

/** True when proof is needed and there is none yet for this complaint. */
export async function needsFixProof(rowId: number): Promise<boolean> {
  if (!(await complaintEventsReady())) return false;
  const rows = (await getSql().query(`SELECT 1 FROM complaint_events WHERE complaint_id = $1 AND kind = 'fixed' LIMIT 1`, [rowId])) as unknown[];
  return rows.length === 0;
}

/** Writes the proof: the after photos, or the reason no photo was needed. */
export async function recordFix(input: { rowId: number; photos: string[]; noPhotoReason?: string; by: string }): Promise<void> {
  if (input.photos.length > 0) {
    await addComplaintEvent({ complaintId: input.rowId, kind: "fixed", channel: "photo", detail: `${input.photos.length} after photo${input.photos.length === 1 ? "" : "s"}.`, photos: input.photos, by: input.by });
  } else if (input.noPhotoReason) {
    await addComplaintEvent({ complaintId: input.rowId, kind: "fixed", channel: "no_photo", detail: `No photo needed: ${input.noPhotoReason}`, by: input.by });
  }
}

/** The after photos of a complaint, newest first (every 'fixed' event's photos). */
export async function afterPhotos(rowId: number): Promise<string[]> {
  const events = await listComplaintEvents(rowId, ["fixed"]).catch(() => []);
  return [...new Set(events.flatMap((event) => event.photos))];
}
