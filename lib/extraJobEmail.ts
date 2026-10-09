// The emails the office gets about an extra job: set up, done, cancelled. Sent through the same
// sender as complaints (lib/email.ts sendInternalNotification: the office
// addresses, the provider picked by EMAIL_PROVIDER, the dry-run switch).
// Server only.

import { sendInternalNotification, type EmailAttachment } from "@/lib/email";
import { SOURCE_LABEL, dayLabel, money, type ExtraJob } from "@/lib/extraJobs";

const MAX_PHOTOS = 3;
const MAX_PHOTO_BYTES = 6 * 1024 * 1024;

function facts(job: ExtraJob): string[] {
  return [
    `Job number: ${job.jobNumber}`,
    ...(job.woNumber ? [`WO / Estimate #: ${job.woNumber}`] : []),
    `Account: ${job.accountName}`,
    `Job: ${job.description}`,
    `Date: ${dayLabel(job.jobDate)}`,
    `Customer price: ${money(job.customerPrice)}`,
    `Sub: ${job.subName}`,
    `Sub pay: ${money(job.subPay)}`,
    `Manager: ${job.createdBy}`,
    `Sold by: ${job.soldBy}`,
    `Came in by: ${SOURCE_LABEL[job.source]}`,
  ];
}

/** "New extra job": sent when a manager sets one up. */
export async function sendExtraJobSetUp(job: ExtraJob, origin: string): Promise<boolean> {
  return sendInternalNotification(`New extra job: ${job.accountName} (${job.jobNumber})`, [
    "A manager set up a new extra job.",
    "",
    ...facts(job),
    "",
    `Open it: ${origin}/extra-jobs/${job.id}`,
  ]);
}

/** "Extra job cancelled": a short note, sent when a manager cancels one. */
export async function sendExtraJobCancelled(job: ExtraJob, origin: string): Promise<boolean> {
  return sendInternalNotification(`Extra job cancelled: ${job.accountName} (${job.jobNumber})`, [
    "This extra job was cancelled. Do not invoice it. Its Sale is cancelled too.",
    "",
    `Job number: ${job.jobNumber}`,
    ...(job.woNumber ? [`WO / Estimate #: ${job.woNumber}`] : []),
    `Account: ${job.accountName}`,
    `Job: ${job.description}`,
    `Date: ${dayLabel(job.jobDate)}`,
    `Cancelled by: ${job.cancelledBy}`,
    `Reason: ${job.cancelReason}`,
    "",
    `Open it: ${origin}/extra-jobs/${job.id}`,
  ]);
}

async function photoAttachments(job: ExtraJob): Promise<EmailAttachment[]> {
  const attachments: EmailAttachment[] = [];
  for (const [index, photo] of job.photos.slice(0, MAX_PHOTOS).entries()) {
    try {
      const response = await fetch(photo.url);
      if (!response.ok) continue;
      const content = Buffer.from(await response.arrayBuffer());
      if (content.length > MAX_PHOTO_BYTES) continue;
      const extension = /\.(jpe?g|png|webp|heic|heif)$/i.exec(photo.fileName || photo.url)?.[0].toLowerCase() ?? ".jpg";
      attachments.push({ filename: `${job.jobNumber}-after-${index + 1}${extension}`, content, contentType: response.headers.get("content-type") ?? undefined });
    } catch {
      // A photo that cannot be fetched is still linked in the email below.
    }
  }
  return attachments;
}

/** "Extra job done, ready to invoice": sent when the manager marks it Done. Carries the after photo. */
export async function sendExtraJobDone(job: ExtraJob, origin: string): Promise<boolean> {
  const attachments = await photoAttachments(job);
  return sendInternalNotification(
    `Extra job done, ready to invoice: ${job.accountName} (${job.jobNumber})`,
    [
      "This extra job is done. It is ready to invoice.",
      "",
      ...facts(job),
      `Marked done by: ${job.doneBy}`,
      ...(job.doneNote ? [`Note: ${job.doneNote}`] : []),
      "",
      `After photos (${job.photos.length}):`,
      ...job.photos.map((photo) => photo.url),
      "",
      `Office copy of the work order: ${origin}/extra-jobs/${job.id}/work-order?copy=office`,
      `Open it: ${origin}/extra-jobs/${job.id}`,
    ],
    attachments
  );
}
