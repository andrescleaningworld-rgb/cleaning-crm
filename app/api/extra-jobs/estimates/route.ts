// Upload of an approved estimate for an extra job (migration 061): a PDF, or
// a photo of a signed one; more than one for revisions. Stored in the same
// Blob storage as the after photos and Documents (a random file name nobody
// can guess), under extra-jobs/<job number>/estimates/. Staff only (proxy.ts
// default gate).
//
// The estimate has our prices: it is shown on the job's page, linked in the
// office's "ready to invoice" email, and nowhere else. Never on the sub's work
// order or in the sub portal. Always optional: nothing waits for it.

import { NextRequest, NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { getAdminIdentity } from "@/lib/adminSession";
import { addJobEstimate, estimatesReady, extraJobsReady, getExtraJob } from "@/lib/pg/extra-jobs";

/** Vercel takes up to 4.5 MB in one request; photos are made smaller on the phone first. */
const MAX_BYTES = 4 * 1024 * 1024;
const MAX_PER_JOB = 10;
const ALLOWED = /^(application\/pdf|image\/(jpeg|png|webp|heic|heif))$/i;
const BY_NAME: Record<string, string> = { pdf: "application/pdf", jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", heic: "image/heic", heif: "image/heif" };

const refuse = (error: string, status = 400) => NextResponse.json({ success: false, error }, { status });

export async function POST(request: NextRequest) {
  if (!process.env.BLOB_READ_WRITE_TOKEN) return refuse("File storage is not set up here, so the estimate cannot be uploaded.", 500);
  try {
    if (!(await extraJobsReady()) || !(await estimatesReady())) return refuse("Estimates are not set up in this database yet.", 409);
    const identity = await getAdminIdentity(request);
    if (!identity) return refuse("Log in first.", 401);

    const formData = await request.formData().catch(() => null);
    const job = await getExtraJob(String(formData?.get("jobId") ?? "").trim());
    const file = formData?.get("file");
    if (!job) return refuse("That extra job was not found.", 404);
    if (job.status === "cancelled") return refuse("This job was cancelled, so it takes no estimate.", 409);
    if (job.estimates.length >= MAX_PER_JOB) return refuse(`A job can have up to ${MAX_PER_JOB} estimate files.`);
    if (!(file instanceof File) || file.size === 0) return refuse("Pick a PDF or take a photo first.");
    const named = BY_NAME[(file.name.split(".").pop() ?? "").toLowerCase()] ?? "";
    const type = ALLOWED.test(file.type) ? file.type.toLowerCase() : named;
    if (!ALLOWED.test(type)) return refuse("Use a PDF or a photo.");
    if (file.size > MAX_BYTES) return refuse("That file is too big. Use a PDF under 4 MB, or take a photo.");

    const extension = type === "application/pdf" ? ".pdf" : type === "image/png" ? ".png" : type === "image/webp" ? ".webp" : /hei[cf]/.test(type) ? `.${type.split("/")[1]}` : ".jpg";
    const blob = await put(`extra-jobs/${job.jobNumber}/estimates/${crypto.randomUUID()}${extension}`, file, { access: "public", contentType: type, addRandomSuffix: false });
    await addJobEstimate(job.id, { url: blob.url, fileName: file.name || `estimate${extension}`, contentType: type }, String(identity.name ?? "").trim() || "Staff");
    return NextResponse.json({ success: true, job: await getExtraJob(job.id) });
  } catch (error) {
    console.error("[extra-jobs/estimates POST]", error instanceof Error ? error.message : error);
    return refuse("The estimate did not upload. Try again.", 500);
  }
}
