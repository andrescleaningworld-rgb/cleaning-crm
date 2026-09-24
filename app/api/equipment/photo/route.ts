// Admin-only (proxy.ts default admin gate). Uploads one equipment photo to
// Vercel Blob and returns its URL; the Add / Edit form then saves that URL in
// the item's existing PhotoUrl field through POST/PATCH /api/equipment. No
// Sheets access here.
import { NextRequest, NextResponse } from "next/server";
import { put } from "@vercel/blob";

const MAX_PHOTO_BYTES = 8 * 1024 * 1024;
const ALLOWED_PHOTO_TYPES = new Set(["image/jpeg", "image/png", "image/heic", "image/heif", "image/webp"]);

export async function POST(request: NextRequest) {
  try {
    if (!process.env.BLOB_READ_WRITE_TOKEN) {
      return NextResponse.json({ success: false, error: "Photo storage is not configured." }, { status: 500 });
    }
    const formData = await request.formData();
    const file = formData.get("photo");
    if (!(file instanceof File)) return NextResponse.json({ success: false, error: "No photo." }, { status: 400 });
    if (!ALLOWED_PHOTO_TYPES.has(file.type)) {
      return NextResponse.json({ success: false, error: "That file isn't a photo." }, { status: 400 });
    }
    if (file.size > MAX_PHOTO_BYTES) {
      return NextResponse.json({ success: false, error: "Photo must be 8MB or smaller." }, { status: 400 });
    }
    const extension = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : file.type.startsWith("image/hei") ? "heic" : "jpg";
    const blob = await put(`equipment-photos/${crypto.randomUUID()}.${extension}`, file, {
      access: "public",
      contentType: file.type,
      addRandomSuffix: false,
    });
    return NextResponse.json({ success: true, url: blob.url });
  } catch (err) {
    console.error("[equipment/photo POST]", err);
    return NextResponse.json({ success: false, error: "Photo upload failed." }, { status: 500 });
  }
}
