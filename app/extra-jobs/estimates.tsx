"use client";

// The approved estimate on an extra job (migration 061): upload and show.
// A PDF, or a photo of a signed estimate; more than one for revisions.
// Office only: it has our prices, so it is never on the sub's work order or
// in the sub portal. Always optional: nothing waits for it.

import { friendlyDate } from "@/app/ui";
import { isPdfEstimate, type ExtraJob, type ExtraJobEstimate } from "@/lib/extraJobs";
import { resizeImageForUpload } from "@/lib/imageResize";
import styles from "./extra-jobs.module.css";

/** What the file picker takes: PDFs and photos (a phone can take one right away). */
export const ESTIMATE_ACCEPT = "application/pdf,image/*";

/** A photo is made smaller first (Vercel takes up to 4.5 MB in one request). A PDF goes as it is. */
async function prepare(file: File): Promise<File> {
  if (!file.type.startsWith("image/")) return file;
  const { blob, wasResized } = await resizeImageForUpload(file);
  return wasResized ? new File([blob], file.name.replace(/\.\w+$/, "") + ".jpg", { type: blob.type || "image/jpeg" }) : file;
}

/** Uploads one estimate file to the job. Gives back the job as it is now; throws a plain sentence when it did not upload. */
export async function uploadEstimate(jobId: string, file: File): Promise<ExtraJob> {
  const form = new FormData();
  form.set("jobId", jobId);
  form.set("file", await prepare(file));
  const response = await fetch("/api/extra-jobs/estimates", { method: "POST", body: form });
  const body = (await response.json().catch(() => ({}))) as { success?: boolean; error?: string; job?: ExtraJob };
  if (!response.ok || body.success !== true || !body.job) throw new Error(body.error ?? "The estimate did not upload. Try again.");
  return body.job;
}

/** Each estimate: a picture (or PDF), its name, View, and who added it when. */
export function EstimateList({ estimates }: { estimates: ExtraJobEstimate[] }) {
  return (
    <ul className={styles.estimates}>
      {estimates.map((estimate, index) => {
        const pdf = isPdfEstimate(estimate);
        return (
          <li key={estimate.id} className={styles.estimate}>
            <a className={styles.estimateThumb} href={estimate.url} target="_blank" rel="noreferrer" aria-label={`View estimate ${index + 1}`}>
              {pdf ? (
                <span className={styles.estimatePdf}>PDF</span>
              ) : (
                // Blob photos are shown as they are; next/image is not set up for that host.
                // eslint-disable-next-line @next/next/no-img-element
                <img src={estimate.url} alt={`Estimate ${index + 1}`} loading="lazy" />
              )}
            </a>
            <span className={styles.estimateText}>
              <span className={styles.estimateName}>{estimate.fileName || `Estimate ${index + 1}`}</span>
              <span className="ui-muted">
                Added by {estimate.uploadedBy || "Staff"}, {friendlyDate(estimate.uploadedAt)}
              </span>
            </span>
            <a className="ui-btn ui-btn-second" href={estimate.url} target="_blank" rel="noreferrer">
              View
            </a>
          </li>
        );
      })}
    </ul>
  );
}
