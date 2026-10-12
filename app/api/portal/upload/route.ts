// A photo a customer adds to "Report a problem". Stored in the same Blob
// storage the staff photo pages use, under portal/<account>/. The account
// comes from the login, never from the browser.

import { NextRequest, NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { requirePortalAccount } from "@/lib/portalAuth";

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;
const ALLOWED = /^image\/(jpeg|png|webp|heic|heif)$/i;

export async function POST(request: NextRequest) {
  const session = await requirePortalAccount();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return NextResponse.json({ error: "File storage is not set up here." }, { status: 500 });
  }

  const formData = await request.formData().catch(() => null);
  const file = formData?.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file provided." }, { status: 400 });
  }
  if (file.size > MAX_FILE_SIZE_BYTES) {
    return NextResponse.json({ error: "The photo must be 10MB or smaller." }, { status: 400 });
  }
  const byName = /\.(jpe?g|png|webp|heic|heif)$/i.test(file.name);
  if (!ALLOWED.test(file.type) && !byName) {
    return NextResponse.json({ error: "Use a photo (JPG or PNG)." }, { status: 400 });
  }

  try {
    const extension = byName ? file.name.slice(file.name.lastIndexOf(".")).toLowerCase() : ".jpg";
    const folder = session.accountId.replace(/[^A-Za-z0-9_-]/g, "_");
    const blob = await put(`portal/${folder}/${crypto.randomUUID()}${extension}`, file, {
      access: "public",
      contentType: file.type || "application/octet-stream",
      addRandomSuffix: false,
    });
    return NextResponse.json({ success: true, url: blob.url });
  } catch (err) {
    console.error("[portal/upload]", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Upload failed. Please try again." }, { status: 500 });
  }
}
