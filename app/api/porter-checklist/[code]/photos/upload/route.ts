// Public, no-login route (proxy.ts PUBLIC_PATHS covers "/api/porter-checklist"):
// CW Now "Send photos", files that go as they are, straight from the phone to
// file storage (Vercel Blob client upload), so they are not stopped by the
// 4.5 MB limit on a request: videos (up to ~1 minute / 100 MB) and photos the
// phone cannot make small (an iPhone HEIC photo on an Android phone). This
// route only hands out the short-lived upload permission, for a live CW Now
// link, for crew-uploads/<photo id>.<ext> only (lib/crewPhotos.ts). The
// phone then tells ../photos (uploadedUrl), which saves it.
//
// GET  -> { private }   the store the phone uploads to (lib/files.ts)
// POST    handleUpload (the @vercel/blob/client upload() call)

import { NextRequest, NextResponse } from "next/server";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { fileStorageOn, privateFilesOn, uploadToken } from "@/lib/files";
import { checkRateLimit } from "@/lib/siteLinkRateLimit";
import { crewLinkAccountOpen, crewLinkIsLive, resolveCrewLink } from "@/lib/crewLink";
import { CREW_PHOTO_UPLOAD_TYPES, CREW_RAW_PHOTO_MAX_BYTES, CREW_VIDEO_MAX_BYTES, CREW_VIDEO_UPLOAD_TYPES, isVideoExt, parseCrewUploadPath } from "@/lib/crewPhotos";

const UPLOADS_PER_MINUTE = 150;

export async function GET() {
  return NextResponse.json({ success: true, private: privateFilesOn() }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  try {
    const { code } = await params;
    if (!fileStorageOn()) return NextResponse.json({ error: "File storage is not set up here." }, { status: 503 });
    const body = (await request.json()) as HandleUploadBody;
    const result = await handleUpload({
      // The private store once it is connected (lib/files.ts).
      token: uploadToken(),
      body,
      request,
      onBeforeGenerateToken: async (pathname) => {
        if (!(await checkRateLimit(`crewlink-upload:${code}`, UPLOADS_PER_MINUTE))) throw new Error("Too many at once.");
        const link = await resolveCrewLink(code);
        // A live CW Now link, for an account that is not cancelled / paused / suspended / inactive.
        if (!link || !crewLinkIsLive(link.modules) || !crewLinkAccountOpen(link)) throw new Error("This link is not active.");
        // Only crew-uploads/<photo id>.<photo or mp4/mov ending>; anything else gets no permission.
        const path = parseCrewUploadPath(pathname);
        if (!path) throw new Error("Not a photo or video.");
        const video = isVideoExt(path.ext);
        return {
          // A photo's permission takes only photo types (40 MB); a video's only mp4 / mov (100 MB).
          allowedContentTypes: video ? CREW_VIDEO_UPLOAD_TYPES : CREW_PHOTO_UPLOAD_TYPES,
          maximumSizeInBytes: video ? CREW_VIDEO_MAX_BYTES : CREW_RAW_PHOTO_MAX_BYTES,
          // The permission lasts 30 minutes (enough for a 100 MB video on slow signal).
          validUntil: Date.now() + 30 * 60_000,
          // The same photo id sent again (bad signal) replaces the half-sent one.
          addRandomSuffix: false,
          allowOverwrite: true,
        };
      },
    });
    return NextResponse.json(result);
  } catch (error) {
    console.error("[crew-link photos upload]", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "The file did not upload." }, { status: 400 });
  }
}
