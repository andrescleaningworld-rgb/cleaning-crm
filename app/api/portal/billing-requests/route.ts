import { filesJson } from "@/lib/files";
import { NextRequest } from "next/server";
import { requirePortalAccount } from "@/lib/portalAuth";
import { appendPortalRequest } from "@/lib/data/customer-portal";
import { sendPortalNotification } from "@/lib/email";
import { newYorkToday } from "@/lib/portalPhotos";
import { BILLING_EMAIL } from "@/lib/portalContacts";

export async function POST(request: NextRequest) {
  const session = await requirePortalAccount();
  if (!session) {
    return filesJson({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { requestType?: string; details?: string };
  try {
    body = await request.json();
  } catch {
    return filesJson({ error: "Invalid request." }, { status: 400 });
  }

  const requestType = body.requestType?.trim() ?? "";
  const details = body.details?.trim() ?? "";

  if (!requestType) {
    return filesJson({ error: "Request type is required." }, { status: 400 });
  }

  // Today in New York (the server runs on UTC, which is already tomorrow in the evening).
  const today = newYorkToday().mdy;

  try {
    await appendPortalRequest("portal-billing-requests", [
      session.accountId,
      session.accountName ?? "",
      today,
      requestType,
      details,
      "New",
      "",
    ]);

    await sendPortalNotification({
      // A billing question goes to the billing address only.
      to: [BILLING_EMAIL],
      subject: "Billing Information Request",
      accountName: session.accountName ?? "",
      accountId: session.accountId,
      lines: [
        `Request Type: ${requestType}`,
        `Details: ${details || "None"}`,
      ],
    });

    return filesJson({ success: true });
  } catch (err) {
    console.error("[portal/billing-requests]", err);
    return filesJson({ error: "Failed to submit. Please try again." }, { status: 500 });
  }
}
