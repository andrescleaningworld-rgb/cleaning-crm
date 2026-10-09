// Upload of an accepted estimate (a photo or a PDF) for a new account.
// Stored in the same Blob storage the Documents page uses, under estimates/.
// Staff only (proxy.ts default gate). Returns the file's link; the caller
// then saves it on the account's handoff (POST /api/handoffs startAccount).

import { NextRequest, NextResponse } from "next/server";
import { put } from "@vercel/blob";

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;
const ALLOWED = /^(image\/(jpeg|png|webp|heic|heif)|application\/pdf)$/i;

const refuse = (error: string, status = 400) => NextResponse.json({ success: false, error }, { status });

export async function POST(request: NextRequest) {
  if (!process.env.BLOB_READ_WRITE_TOKEN) return refuse("File storage is not set up here, so the estimate cannot be uploaded.", 500);
  try {
    const formData = await request.formData().catch(() => null);
    const file = formData?.get("file");
    if (!(file instanceof File)) return refuse("Choose a photo or a PDF of the estimate.");
    if (file.size > MAX_FILE_SIZE_BYTES) return refuse("The file must be 10MB or smaller.");
    const byName = /\.(jpe?g|png|webp|heic|heif|pdf)$/i.test(file.name);
    if (!ALLOWED.test(file.type) && !byName) return refuse("Use a photo (JPG, PNG) or a PDF.");

    const extension = file.name.includes(".") ? file.name.slice(file.name.lastIndexOf(".")).toLowerCase() : "";
    const blob = await put(`estimates/${crypto.randomUUID()}${extension}`, file, {
      access: "public",
      contentType: file.type || "application/octet-stream",
      addRandomSuffix: false,
    });
    return NextResponse.json({ success: true, url: blob.url, name: file.name });
  } catch (error) {
    console.error("[handoffs/estimate POST]", error instanceof Error ? error.message : error);
    return refuse("The estimate did not upload. Try again.", 500);
  }
}
