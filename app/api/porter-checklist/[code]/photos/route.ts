// Public, no-login route (proxy.ts PUBLIC_PATHS already covers
// "/api/porter-checklist"): Crew Link "Send photos". One photo per request,
// already made small on the phone (lib/crewPhotos.ts), sent from the phone's
// waiting list (app/porter/[code]/photo-queue.ts), so a photo the phone
// sends again after a lost answer is saved once. Gated by the link's code
// (any live Crew Link may send photos) and rate-limited per code.
//
// POST multipart { clientId, name, tag, takenAt, full, thumb?, lat?, lng?, accuracy? }
//   lat / lng / accuracy: where the phone was when the photo was added (only
//   if the crew allowed it): the server stamps the photo and checks it was
//   taken on site (lib/pg/crew-photos.ts).
//   200 { success, id, already }   saved (or it was already here)
//   4xx { success: false, error }  this photo will never go: the phone drops it
//   5xx                            try again later
//
// "You seem to be at <Other Account>": ./where (POST, so the location never
// sits in a web address or a log).

import { filesJson } from "@/lib/files";
import { NextRequest } from "next/server";
import { checkRateLimit } from "@/lib/siteLinkRateLimit";
import { cleanReporterName, crewLinkIsLive, resolveCrewLink } from "@/lib/crewLink";
import { isCrewPhotoTag } from "@/lib/crewPhotos";
import { addCrewPhoto, crewPhotosReady, CrewPhotoError } from "@/lib/pg/crew-photos";
import { isGeoPoint, type PhoneLocation } from "@/lib/photoLocation";

export const maxDuration = 60;

// 20 photos picked at once go one after another: room for a few batches a minute.
const PHOTOS_PER_MINUTE = 150;

const refuse = (error: string, status: number) => filesJson({ success: false, error }, { status });

/** The phone's location sent with a photo; null when missing or not believable. */
function locationOf(form: FormData): PhoneLocation | null {
  const lat = Number(form.get("lat"));
  const lng = Number(form.get("lng"));
  const accuracy = Number(form.get("accuracy"));
  if (form.get("lat") === null || form.get("lng") === null || !isGeoPoint(lat, lng)) return null;
  return { lat, lng, accuracyM: Number.isFinite(accuracy) && accuracy >= 0 ? Math.min(accuracy, 100_000) : 9999 };
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  try {
    const { code } = await params;
    if (!(await checkRateLimit(`crewlink-photos:${code}`, PHOTOS_PER_MINUTE))) return refuse("Too many photos at once. They will go in a minute.", 503);
    if (!(await crewPhotosReady())) return refuse("Photos are not turned on yet.", 503);
    const link = await resolveCrewLink(code);
    if (!link || !crewLinkIsLive(link.modules)) return refuse("This link is not active.", 404);

    const form = await request.formData().catch(() => null);
    if (!form) return refuse("No photo.", 400);
    const clientId = String(form.get("clientId") ?? "").trim();
    if (!/^[A-Za-z0-9-]{8,64}$/.test(clientId)) return refuse("No photo id.", 400);
    const name = cleanReporterName(form.get("name"));
    if (!name) return refuse("Please enter your name.", 400);
    const tag = String(form.get("tag") ?? "");
    const full = form.get("full");
    const thumb = form.get("thumb");
    if (!(full instanceof File)) return refuse("No photo.", 400);

    const saved = await addCrewPhoto({
      accountId: link.template.accountId,
      accountName: link.template.accountName,
      clientId,
      name,
      tag: isCrewPhotoTag(tag) ? tag : "",
      takenAt: String(form.get("takenAt") ?? ""),
      full,
      thumb: thumb instanceof File ? thumb : null,
      caption: String(form.get("caption") ?? ""),
      location: locationOf(form),
    });
    return filesJson({ success: true, ...saved });
  } catch (error) {
    if (error instanceof CrewPhotoError) return refuse(error.message, 400);
    console.error("[crew-link photos POST]", error instanceof Error ? error.message : error);
    return refuse("The photo did not save. It will try again.", 500);
  }
}
