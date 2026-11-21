// A CW Now to-do's files: straight from the office's browser to the PRIVATE
// file store (Vercel Blob client upload), so big files are not stopped by the
// 4.5 MB request limit. Staff only. Refuses when the private store is not
// connected: a task's files never go to the public store.

import { NextRequest, NextResponse } from "next/server";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { getAdminIdentity } from "@/lib/adminSession";
import { TASK_FILE_EXTENSIONS, TASK_FILE_MAX_BYTES, TASK_FILE_TYPES, TASK_OFFICE_FOLDER, TASK_VIDEO_EXTENSIONS, TASK_VIDEO_MAX_BYTES } from "@/lib/cwNowTasks";
import { privateFilesOn, uploadToken } from "@/lib/files";

export async function POST(request: NextRequest) {
  try {
    if (!privateFilesOn()) return NextResponse.json({ error: "Private file storage is not connected yet." }, { status: 503 });
    if (!(await getAdminIdentity(request))) return NextResponse.json({ error: "Staff only." }, { status: 401 });
    const body = (await request.json()) as HandleUploadBody;
    const result = await handleUpload({
      token: uploadToken(),
      body,
      request,
      onBeforeGenerateToken: async (pathname) => {
        if (!pathname.startsWith(`${TASK_OFFICE_FOLDER}/`) || !TASK_FILE_EXTENSIONS.test(pathname)) throw new Error("That kind of file cannot be attached.");
        return {
          allowedContentTypes: TASK_FILE_TYPES,
          maximumSizeInBytes: TASK_VIDEO_EXTENSIONS.test(pathname) ? TASK_VIDEO_MAX_BYTES : TASK_FILE_MAX_BYTES,
          addRandomSuffix: true,
        };
      },
    });
    return NextResponse.json(result);
  } catch (error) {
    console.error("[cw-now-tasks/upload]", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "The file did not upload." }, { status: 400 });
  }
}
