// POST /api/portal/complaints/add { key, note, photos }: the customer adds
// notes / photos to their own open portal complaint instead of sending a new
// one (lib/pg/complaint-changes.ts). No new complaint, so no new score hit
// and no new sub notice; the office gets a short "Complaint update" email.

import { filesJson } from "@/lib/files";
import { NextRequest } from "next/server";
import { requirePortalAccount } from "@/lib/portalAuth";
import { addToPortalComplaint } from "@/lib/pg/complaint-changes";
import { customerPhotoLinks } from "@/lib/portalPhotos";
import { sendPortalNotification } from "@/lib/email";
import { SERVICE_EMAIL } from "@/lib/portalContacts";

export async function POST(request: NextRequest) {
  const session = await requirePortalAccount();
  if (!session) return filesJson({ error: "Unauthorized" }, { status: 401 });

  let body: { key?: string; note?: string; photos?: string[] };
  try {
    body = await request.json();
  } catch {
    return filesJson({ error: "Invalid request." }, { status: 400 });
  }

  const key = String(body.key ?? "").trim();
  const note = String(body.note ?? "").trim();
  const photos = customerPhotoLinks(session.accountId, body.photos);
  if (!key) return filesJson({ error: "Which complaint?" }, { status: 400 });
  if (!note && photos.length === 0) return filesJson({ error: "Add a note or a photo." }, { status: 400 });

  let saved: { complaintId: string; accountName: string };
  try {
    saved = await addToPortalComplaint({ accountId: session.accountId, key, note, photos });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error(`[portal/complaints/add] NOT SAVED for account ${session.accountId}:`, message);
    const mine = message === "This complaint is closed or is not yours." || message === "Complaint not found.";
    return filesJson({ error: mine ? "This problem is already closed. Please send a new one." : "Failed to submit. Please try again." }, { status: mine ? 409 : 500 });
  }

  // Only after the save. Never throws.
  await sendPortalNotification({
    to: [SERVICE_EMAIL],
    subject: "Complaint update",
    accountName: session.accountName ?? saved.accountName,
    accountId: session.accountId,
    lines: [`The customer added to complaint ${saved.complaintId}.`, note ? `Note: ${note}` : "", photos.length ? `Photos: ${photos.join(", ")}` : ""].filter(Boolean),
  });

  return filesJson({ success: true });
}
