import { filesJson, storedFileUrl, storedPathname } from "@/lib/files";
import { NextRequest } from "next/server";
import { requirePortalAccount } from "@/lib/portalAuth";
import { appendPortalRequest } from "@/lib/data/customer-portal";
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

  const today = new Date().toLocaleDateString("en-US");
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

  try {
    await appendPortalRequest("portal-complaints", [
      session.accountId,
      session.accountName ?? "",
      today,
      issueType,
      description,
      body.incidentDate?.trim() ?? "",
      "New",
      "",
      photos,
    ]);

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
      ],
    });

    return filesJson({ success: true });
  } catch (err) {
    console.error("[portal/complaints]", err);
    return filesJson({ error: "Failed to submit. Please try again." }, { status: 500 });
  }
}
