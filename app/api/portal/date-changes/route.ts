import { filesJson } from "@/lib/files";
import { NextRequest } from "next/server";
import { requirePortalAccount } from "@/lib/portalAuth";
import { appendPortalRequest } from "@/lib/data/customer-portal";
import { sendPortalNotification } from "@/lib/email";
import { newYorkToday } from "@/lib/portalPhotos";

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

  // Today in New York (the server runs on UTC, which is already tomorrow in the evening).
  const { mdy: today, iso: todayIso } = newYorkToday();
  // The new day cannot be in the past (YYYY-MM-DD from the date box compares as text).
  if (/^\d{4}-\d{2}-\d{2}$/.test(requestedDate) && requestedDate < todayIso) {
    return filesJson({ error: "The new day must be today or later." }, { status: 400 });
  }

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
