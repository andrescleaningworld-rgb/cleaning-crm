// Public, no-login route: the short-lived permission for the sub to add a
// photo to this one task. PRIVATE store only, this task's folder only, photo
// types only. The page then saves it with POST ../ { action: "photo" }.

import { NextRequest, NextResponse } from "next/server";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { privateStoreOn, privateUploadToken } from "@/lib/files";
import { checkRateLimit } from "@/lib/siteLinkRateLimit";
import { CREW_PHOTO_UPLOAD_TYPES, CREW_RAW_PHOTO_MAX_BYTES } from "@/lib/crewPhotos";
import { isTaskToken } from "@/lib/cwNowTasks";
import { cwNowTasksReady, taskUploadFolder } from "@/lib/pg/cw-now-tasks";

const UPLOADS_PER_MINUTE = 30;
const PHOTO_PATH = /\.(jpe?g|png|webp|heic|heif)$/i;

export async function POST(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params;
    if (!isTaskToken(token) || !privateStoreOn() || !(await cwNowTasksReady())) return NextResponse.json({ error: "Not available." }, { status: 404 });
    const body = (await request.json()) as HandleUploadBody;
    const result = await handleUpload({
      token: privateUploadToken(),
      body,
      request,
      onBeforeGenerateToken: async (pathname) => {
        if (!(await checkRateLimit(`cwnow-task-upload:${token}`, UPLOADS_PER_MINUTE))) throw new Error("Too many at once.");
        const folder = await taskUploadFolder(token);
        if (!folder || !pathname.startsWith(`${folder}/`) || pathname.includes("..") || !PHOTO_PATH.test(pathname)) throw new Error("Not a photo for this task.");
        return { allowedContentTypes: CREW_PHOTO_UPLOAD_TYPES, maximumSizeInBytes: CREW_RAW_PHOTO_MAX_BYTES, addRandomSuffix: true };
      },
    });
    return NextResponse.json(result);
  } catch (error) {
    console.error("[cw-now task upload]", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "The photo did not upload." }, { status: 400 });
  }
}
