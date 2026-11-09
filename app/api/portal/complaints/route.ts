import { filesJson } from "@/lib/files";
import { customerPhotoLinks, newYorkToday } from "@/lib/portalPhotos";
import { after, NextRequest } from "next/server";
import { requirePortalAccount } from "@/lib/portalAuth";
import { savePortalComplaint } from "@/lib/pg/customer-portal";
import { sendPortalNotification } from "@/lib/email";
import { SERVICE_EMAIL } from "@/lib/portalContacts";
import { notifySubOfComplaint } from "@/lib/complaintSubNotice";
import { sendCustomerReceivedEmail } from "@/lib/complaintCustomerEmail";
import { complaintRowId } from "@/lib/pg/complaint-events";

export async function POST(request: NextRequest) {
  const session = await requirePortalAccount();
  if (!session) {
    return filesJson({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { issueType?: string; description?: string; incidentDate?: string; photos?: string[] };
  try {
    body = await request.json();
  } catch {
    return filesJson({ error: "Invalid request." }, { status: 400 });
  }

  const issueType = body.issueType?.trim() ?? "";
  const description = body.description?.trim() ?? "";

  if (!issueType || !description) {
    return filesJson({ error: "Issue type and description are required." }, { status: 400 });
  }

  // Today in New York (the server runs on UTC, which is already tomorrow in the evening).
  const { mdy: today, iso: todayIso } = newYorkToday();
  // Only photos this customer uploaded here (lib/portalPhotos.ts).
  const photos = customerPhotoLinks(session.accountId, body.photos).join(", ");

  // 1. Save first: the inbox row AND a real complaint, together (both or
  //    neither). If this fails the customer sees an error, it is logged, and
  //    no email goes out.
  let complaintId: string;
  try {
    complaintId = await savePortalComplaint({
      accountId: session.accountId,
      accountName: session.accountName ?? "",
      submittedDate: today,
      complaintDate: todayIso,
      issueType,
      description,
      incidentDate: body.incidentDate?.trim() ?? "",
      photos,
    });
  } catch (err) {
    console.error(`[portal/complaints] NOT SAVED for account ${session.accountId} (${session.accountName ?? ""}):`, err instanceof Error ? err.message : err);
    return filesJson({ error: "Failed to submit. Please try again." }, { status: 500 });
  }

  // 2. Only now the email. sendPortalNotification never throws: a notice that
  //    does not go out is logged, and the complaint is already saved.
  await sendPortalNotification({
    // "Report a problem" goes to the service address only.
    to: [SERVICE_EMAIL],
    subject: "New Complaint",
    accountName: session.accountName ?? "",
    accountId: session.accountId,
    lines: [
      `Issue Type: ${issueType}`,
      `Description: ${description}`,
      `Date of Incident: ${body.incidentDate ?? "Not provided"}`,
      `Photos: ${photos || "None"}`,
      `Complaint ID: ${complaintId}`,
    ],
  });

  // 3. The account's sub: email + text, after the answer is sent. A failed
  //    notice is written on the complaint; the complaint stays saved.
  const origin = new URL(request.url).origin;
  after(() =>
    notifySubOfComplaint({ key: complaintId, origin, by: "System" }).catch((error) =>
      console.error("[portal/complaints] sub notice:", error instanceof Error ? error.message : error)
    )
  );
  // 4. The customer: "We got it, we're on it" with the complaint number
  //    (only while Settings -> "Customer complaint updates" is on).
  after(async () => {
    try {
      const rowId = await complaintRowId(complaintId);
      if (rowId !== null) await sendCustomerReceivedEmail(rowId, origin);
    } catch (error) {
      console.error("[portal/complaints] customer email:", error instanceof Error ? error.message : error);
    }
  });

  return filesJson({ success: true });
}
