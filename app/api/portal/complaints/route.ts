import { filesJson, storedFileUrl, storedPathname } from "@/lib/files";
import { NextRequest } from "next/server";
import { requirePortalAccount } from "@/lib/portalAuth";
import { savePortalComplaint } from "@/lib/pg/customer-portal";
import { sendPortalNotification } from "@/lib/email";
import { SERVICE_EMAIL } from "@/lib/portalContacts";

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
  const ny = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", year: "numeric", month: "numeric", day: "numeric" })
      .formatToParts(new Date())
      .map((part) => [part.type, part.value])
  );
  const today = `${ny.month}/${ny.day}/${ny.year}`;
  const todayIso = `${ny.year}-${ny.month.padStart(2, "0")}-${ny.day.padStart(2, "0")}`;
  // Only photos this customer uploaded here (/api/portal/upload puts them
  // under portal/<this account>/), never a link typed in from somewhere else.
  const folder = `/portal/${session.accountId.replace(/[^A-Za-z0-9_-]/g, "_")}/`;
  const photos = (Array.isArray(body.photos) ? body.photos : [])
    .map((url) => {
      // A private upload comes back as its signed app address (lib/files.ts): kept without the signature.
      const pathname = storedPathname(String(url));
      if (pathname !== null) return pathname.startsWith(folder.slice(1)) ? storedFileUrl(pathname) : "";
      try {
        const parsed = new URL(String(url));
        return parsed.protocol === "https:" && parsed.hostname.endsWith(".public.blob.vercel-storage.com") && parsed.pathname.startsWith(folder) ? String(url) : "";
      } catch {
        return "";
      }
    })
    .filter(Boolean)
    .slice(0, 6)
    .join(", ");

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

  return filesJson({ success: true });
}
