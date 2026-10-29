// Public, no-login route (proxy.ts PUBLIC_PATHS already covers
// "/api/porter-checklist"): Crew Link "Send photos". One photo per request,
// already made small on the phone (lib/crewPhotos.ts), sent from the phone's
// waiting list (app/porter/[code]/photo-queue.ts), so a photo the phone
// sends again after a lost answer is saved once. Gated by the link's code
// (any live Crew Link may send photos) and rate-limited per code.
//
// POST multipart { clientId, name, tag, takenAt, full, thumb? }
//   200 { success, id, already }   saved (or it was already here)
//   4xx { success: false, error }  this photo will never go: the phone drops it
//   5xx                            try again later

import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/siteLinkRateLimit";
import { cleanReporterName, crewLinkIsLive, resolveCrewLink } from "@/lib/crewLink";
import { isCrewPhotoTag } from "@/lib/crewPhotos";
import { addCrewPhoto, crewPhotosReady, CrewPhotoError } from "@/lib/pg/crew-photos";

export const maxDuration = 60;

// 20 photos picked at once go one after another: room for a few batches a minute.
const PHOTOS_PER_MINUTE = 150;

const refuse = (error: string, status: number) => NextResponse.json({ success: false, error }, { status });

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
    });
    return NextResponse.json({ success: true, ...saved });
  } catch (error) {
    if (error instanceof CrewPhotoError) return refuse(error.message, 400);
    console.error("[crew-link photos POST]", error instanceof Error ? error.message : error);
    return refuse("The photo did not save. It will try again.", 500);
  }
}
