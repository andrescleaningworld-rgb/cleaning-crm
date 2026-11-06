import { filesJson } from "@/lib/files";
import { NextRequest } from "next/server";
import { requirePortalAccount } from "@/lib/portalAuth";
import { appendPortalRequest } from "@/lib/data/customer-portal";
import { sendPortalNotification } from "@/lib/email";

export async function POST(request: NextRequest) {
  const session = await requirePortalAccount();
  if (!session) {
    return filesJson({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { currentDate?: string; requestedDate?: string; reason?: string };
  try {
    body = await request.json();
  } catch {
    return filesJson({ error: "Invalid request." }, { status: 400 });
  }

  const currentDate = body.currentDate?.trim() ?? "";
  const requestedDate = body.requestedDate?.trim() ?? "";

  if (!currentDate || !requestedDate) {
    return filesJson({ error: "Current and requested dates are required." }, { status: 400 });
  }

  const today = new Date().toLocaleDateString("en-US");

  try {
    await appendPortalRequest("portal-date-changes", [
      session.accountId,
      session.accountName ?? "",
      today,
      currentDate,
      requestedDate,
      body.reason?.trim() ?? "",
      "New",
      "",
    ]);

    await sendPortalNotification({
      subject: "Service Date Change Request",
      accountName: session.accountName ?? "",
      accountId: session.accountId,
      lines: [
        `Current Service Date: ${currentDate}`,
        `Requested New Date: ${requestedDate}`,
        `Reason: ${body.reason ?? "Not provided"}`,
      ],
    });

    return filesJson({ success: true });
  } catch (err) {
    console.error("[portal/date-changes]", err);
    return filesJson({ error: "Failed to submit. Please try again." }, { status: 500 });
  }
}
