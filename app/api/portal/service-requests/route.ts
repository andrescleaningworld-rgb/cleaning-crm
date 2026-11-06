import { filesJson } from "@/lib/files";
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

  let body: { serviceRequested?: string; details?: string; preferredDate?: string };
  try {
    body = await request.json();
  } catch {
    return filesJson({ error: "Invalid request." }, { status: 400 });
  }

  const serviceRequested = body.serviceRequested?.trim() ?? "";
  const details = body.details?.trim() ?? "";

  if (!serviceRequested) {
    return filesJson({ error: "Service type is required." }, { status: 400 });
  }

  const today = new Date().toLocaleDateString("en-US");

  try {
    await appendPortalRequest("portal-service-requests", [
      session.accountId,
      session.accountName ?? "",
      today,
      serviceRequested,
      details,
      body.preferredDate?.trim() ?? "",
      "New",
      "",
    ]);

    await sendPortalNotification({
      // "Request extra cleaning" goes to the service address only.
      to: [SERVICE_EMAIL],
      subject: "New Service Request",
      accountName: session.accountName ?? "",
      accountId: session.accountId,
      lines: [
        `Service Requested: ${serviceRequested}`,
        `Details: ${details || "None"}`,
        `Preferred Date: ${body.preferredDate ?? "Not provided"}`,
      ],
    });

    return filesJson({ success: true });
  } catch (err) {
    console.error("[portal/service-requests]", err);
    return filesJson({ error: "Failed to submit. Please try again." }, { status: 500 });
  }
}
