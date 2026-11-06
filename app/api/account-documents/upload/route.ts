// Account documents: the file itself goes straight from the browser to file
// storage (Vercel Blob client upload), so big floor plans and contracts are
// not stopped by the 4.5 MB limit on a request. This route only hands out the
// short-lived upload permission, to staff, for the account-documents folder,
// for PDF / Word / Excel / images up to 25 MB. The account page then saves the
// document with POST /api/account-documents.

import { NextRequest, NextResponse } from "next/server";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { getAdminIdentity } from "@/lib/adminSession";
import { DOC_CONTENT_TYPES, DOC_EXTENSIONS, DOC_FOLDER, DOC_MAX_BYTES } from "@/lib/accountDocuments";

export async function POST(request: NextRequest) {
  try {
    if (!process.env.BLOB_READ_WRITE_TOKEN) return NextResponse.json({ error: "File storage is not set up here." }, { status: 500 });
    if (!(await getAdminIdentity(request))) return NextResponse.json({ error: "Staff only." }, { status: 401 });
    const body = (await request.json()) as HandleUploadBody;
    const result = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname) => {
        if (!pathname.startsWith(`${DOC_FOLDER}/`) || !DOC_EXTENSIONS.test(pathname)) throw new Error("Use a PDF, Word, Excel or image file.");
        return { allowedContentTypes: DOC_CONTENT_TYPES, maximumSizeInBytes: DOC_MAX_BYTES, addRandomSuffix: true };
      },
    });
    return NextResponse.json(result);
  } catch (error) {
    console.error("[account-documents/upload]", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "The file did not upload." }, { status: 400 });
  }
}
