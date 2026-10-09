// Upload of an after photo for an extra job. Stored in the same Blob storage
// the Documents page uses, under extra-jobs/. Staff only (proxy.ts default
// gate). The photo is saved on the job right away; marking the job Done
// needs at least one.

import { NextRequest, NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { getAdminIdentity } from "@/lib/adminSession";
import { addJobPhoto, extraJobsReady, getExtraJob } from "@/lib/pg/extra-jobs";

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;
const MAX_PHOTOS_PER_JOB = 12;
const ALLOWED = /^image\/(jpeg|png|webp|heic|heif)$/i;

const refuse = (error: string, status = 400) => NextResponse.json({ success: false, error }, { status });

export async function POST(request: NextRequest) {
  if (!process.env.BLOB_READ_WRITE_TOKEN) return refuse("File storage is not set up here, so the photo cannot be uploaded.", 500);
  try {
    if (!(await extraJobsReady())) return refuse("Extra Jobs is not set up in this database yet.", 409);
    const identity = await getAdminIdentity(request);
    if (!identity) return refuse("Log in first.", 401);

    const formData = await request.formData().catch(() => null);
    const jobId = String(formData?.get("jobId") ?? "").trim();
    const file = formData?.get("file");
    const job = await getExtraJob(jobId);
    if (!job) return refuse("That extra job was not found.", 404);
    if (job.status === "cancelled") return refuse("This job was cancelled, so it takes no photos.", 409);
    if (job.photos.length >= MAX_PHOTOS_PER_JOB) return refuse(`A job can have up to ${MAX_PHOTOS_PER_JOB} photos.`);
    if (!(file instanceof File)) return refuse("Choose a photo.");
    if (file.size > MAX_FILE_SIZE_BYTES) return refuse("The photo must be 10MB or smaller.");
    const byName = /\.(jpe?g|png|webp|heic|heif)$/i.test(file.name);
    if (!ALLOWED.test(file.type) && !byName) return refuse("Use a photo (JPG or PNG).");

    const extension = file.name.includes(".") ? file.name.slice(file.name.lastIndexOf(".")).toLowerCase() : ".jpg";
    const blob = await put(`extra-jobs/${job.jobNumber}/${crypto.randomUUID()}${extension}`, file, {
      access: "public",
      contentType: file.type || "application/octet-stream",
      addRandomSuffix: false,
    });
    await addJobPhoto(job.id, blob.url, file.name, String(identity.name ?? "").trim() || "Staff");
    return NextResponse.json({ success: true, job: await getExtraJob(job.id) });
  } catch (error) {
    console.error("[extra-jobs/photos POST]", error instanceof Error ? error.message : error);
    return refuse("The photo did not upload. Try again.", 500);
  }
}
