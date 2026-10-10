// Photos -> "Add photos". Staff only (not on any public list in proxy.ts, and
// the staff session is checked here too).
//   multipart form: photos from the person's device -> Blob storage (photos/)
//                   and into the photo index
//   JSON { links }: photos already in Google Drive -> indexed where they are
//                   (read-only on Drive; nothing is copied or moved)

import { NextRequest, NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { getAdminIdentity } from "@/lib/adminSession";
import { addUploadedPhoto, cleanDetails, importFromDrive, serviceAccountEmail } from "@/lib/photoImport";
import { photosReady } from "@/lib/pg/photo-index";

export const maxDuration = 60;

const MAX_BYTES = 10 * 1024 * 1024;
const MAX_FILES = 20;
const refuse = (error: string, status = 400) => NextResponse.json({ success: false, error }, { status });

export async function GET(request: NextRequest) {
  if (!(await getAdminIdentity(request))) return refuse("Staff only.", 401);
  // The address to share a Drive folder with, shown on the form.
  return NextResponse.json({ success: true, shareWith: serviceAccountEmail() });
}

export async function POST(request: NextRequest) {
  try {
    const identity = await getAdminIdentity(request);
    if (!identity) return refuse("Staff only.", 401);
    if (!(await photosReady())) return refuse("Photos is not turned on here.", 409);
    const by = identity.name ?? "";

    if ((request.headers.get("content-type") ?? "").includes("application/json")) {
      const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
      const details = cleanDetails(body, by);
      if (typeof details === "string") return refuse(details);
      const result = await importFromDrive(String(body.links ?? ""), details);
      return NextResponse.json({ success: true, ...result });
    }

    if (!process.env.BLOB_READ_WRITE_TOKEN) return refuse("File storage is not set up here, so photos cannot be uploaded.", 500);
    const form = await request.formData().catch(() => null);
    if (!form) return refuse("No photos.");
    const details = cleanDetails(Object.fromEntries([...form.entries()].filter(([, value]) => typeof value === "string")), by);
    if (typeof details === "string") return refuse(details);
    const files = form.getAll("file").filter((entry): entry is File => entry instanceof File);
    if (files.length === 0) return refuse("Choose at least one photo.");
    if (files.length > MAX_FILES) return refuse(`Add up to ${MAX_FILES} photos at a time.`);

    let added = 0;
    const problems: string[] = [];
    for (const file of files) {
      if (!/^image\//i.test(file.type)) {
        problems.push(`${file.name}: not a photo.`);
        continue;
      }
      if (file.size > MAX_BYTES) {
        problems.push(`${file.name}: bigger than 10MB.`);
        continue;
      }
      const extension = file.name.includes(".") ? file.name.slice(file.name.lastIndexOf(".")).toLowerCase() : ".jpg";
      const blob = await put(`photos/${crypto.randomUUID()}${extension}`, file, { access: "public", contentType: file.type || "image/jpeg", addRandomSuffix: false });
      await addUploadedPhoto(blob.url, details);
      added++;
    }
    return NextResponse.json({ success: true, added, already: 0, notPhotos: 0, problems });
  } catch (error) {
    console.error("[photo-index/add POST]", error instanceof Error ? error.message : error);
    return refuse("The photos were not added. Try again.", 500);
  }
}
