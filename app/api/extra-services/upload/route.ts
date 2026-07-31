import { NextRequest, NextResponse } from "next/server";
import { put } from "@vercel/blob";

const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5MB
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

export async function POST(request: NextRequest) {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return NextResponse.json(
      { success: false, error: "Blob storage is not configured (missing BLOB_READ_WRITE_TOKEN)." },
      { status: 500 }
    );
  }

  try {
    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json(
        { success: false, error: "No image file provided." },
        { status: 400 }
      );
    }

    if (!ALLOWED_TYPES.has(file.type)) {
      return NextResponse.json(
        { success: false, error: "Only JPEG, PNG, WebP, or GIF images are allowed." },
        { status: 400 }
      );
    }

    if (file.size > MAX_FILE_SIZE_BYTES) {
      return NextResponse.json(
        { success: false, error: "Image must be 5MB or smaller." },
        { status: 400 }
      );
    }

    const extension = file.name.includes(".") ? file.name.slice(file.name.lastIndexOf(".")) : "";
    const filename = `extra-services/${crypto.randomUUID()}${extension}`;

    const blob = await put(filename, file, {
      access: "public",
      contentType: file.type,
      // Already unique via the UUID above — a random suffix would just make
      // the URL longer for no benefit.
      addRandomSuffix: false,
    });

    return NextResponse.json({ success: true, url: blob.url });
  } catch (err) {
    console.error("[extra-services/upload POST]", err);
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Failed to upload image." },
      { status: 500 }
    );
  }
}
