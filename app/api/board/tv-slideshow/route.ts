// Settings -> Pin Board -> TV slideshow (owner only): how long the board sits
// idle before the slideshow, the Google Drive folder and its switch, and
// "Sync now". See lib/pg/tv-slideshow.ts.

import { NextRequest, NextResponse } from "next/server";
import { getAdminIdentity } from "@/lib/adminSession";
import { SLIDES_PER_SHOW_RANGE, SLIDE_SECONDS_RANGE, folderIdFrom, getTvSlideshowSettings, saveTvSlideshowSettings, syncDriveSlides, tvSlideshowReady } from "@/lib/pg/tv-slideshow";

export const maxDuration = 300;

const noStore = { headers: { "Cache-Control": "no-store" } };
const refuse = (error: string, status = 400) => NextResponse.json({ success: false, error }, { status, ...noStore });

async function owner(request: NextRequest) {
  const identity = await getAdminIdentity(request);
  return identity?.role === "owner" ? identity : null;
}

export async function GET(request: NextRequest) {
  if (!(await owner(request))) return refuse("Only the owner can change the TV slideshow.", 403);
  try {
    const ready = await tvSlideshowReady();
    return NextResponse.json({ success: true, ready, settings: await getTvSlideshowSettings(), serviceAccount: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL ?? "" }, noStore);
  } catch (error) {
    console.error("[tv-slideshow GET]", error instanceof Error ? error.message : error);
    return refuse("The TV slideshow settings did not load.", 500);
  }
}

export async function POST(request: NextRequest) {
  const identity = await owner(request);
  if (!identity) return refuse("Only the owner can change the TV slideshow.", 403);
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return refuse("Invalid JSON");
  }
  try {
    if (!(await tvSlideshowReady())) return refuse("This database is not ready for the TV slideshow settings yet.", 409);
    const by = String(identity.name ?? "").trim() || "Owner";

    if (body.action === "save") {
      const idle = Math.round(Number(body.idleMinutes));
      if (!Number.isFinite(idle) || idle < 1 || idle > 60) return refuse("Minutes must be a number from 1 to 60.");
      const folderId = folderIdFrom(String(body.driveFolder ?? ""));
      if (!folderId) return refuse("Paste the Google Drive folder link, or its ID.");
      // Seconds per picture and pictures per round: saved when sent (an older page does not send them).
      const timing = body.slideSeconds !== undefined && body.slidesPerShow !== undefined;
      const seconds = Math.round(Number(body.slideSeconds));
      const perShow = Math.round(Number(body.slidesPerShow));
      if (timing && (!Number.isFinite(seconds) || seconds < SLIDE_SECONDS_RANGE.min || seconds > SLIDE_SECONDS_RANGE.max)) {
        return refuse(`Seconds per picture must be a number from ${SLIDE_SECONDS_RANGE.min} to ${SLIDE_SECONDS_RANGE.max}.`);
      }
      if (timing && (!Number.isFinite(perShow) || perShow < SLIDES_PER_SHOW_RANGE.min || perShow > SLIDES_PER_SHOW_RANGE.max)) {
        return refuse(`Pictures per round must be a number from ${SLIDES_PER_SHOW_RANGE.min} to ${SLIDES_PER_SHOW_RANGE.max}.`);
      }
      const settings = await saveTvSlideshowSettings(
        { idleMinutes: idle, driveFolderId: folderId, driveEnabled: body.driveEnabled === true, ...(timing ? { slideSeconds: seconds, slidesPerShow: perShow } : {}) },
        by
      );
      return NextResponse.json({ success: true, settings }, noStore);
    }

    if (body.action === "syncNow") {
      const result = await syncDriveSlides(240_000);
      return NextResponse.json({ success: true, result, settings: await getTvSlideshowSettings() }, noStore);
    }

    return refuse("Unknown action.");
  } catch (error) {
    console.error("[tv-slideshow POST]", error instanceof Error ? error.message : error);
    return refuse("That did not save. Try again.", 500);
  }
}
