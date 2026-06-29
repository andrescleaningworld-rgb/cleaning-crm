import { NextRequest, NextResponse } from "next/server";
import { getIronSession } from "iron-session";
import { cookies } from "next/headers";
import { sessionOptions, type PortalSessionData } from "@/lib/portalSession";
import { appendToSheet } from "@/lib/googleSheets";
import { sendPortalNotification } from "@/lib/email";

export async function POST(request: NextRequest) {
  const session = await getIronSession<PortalSessionData>(await cookies(), sessionOptions());
  if (!session.accountId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { currentDate?: string; requestedDate?: string; reason?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const currentDate = body.currentDate?.trim() ?? "";
  const requestedDate = body.requestedDate?.trim() ?? "";

  if (!currentDate || !requestedDate) {
    return NextResponse.json({ error: "Current and requested dates are required." }, { status: 400 });
  }

  const today = new Date().toLocaleDateString("en-US");

  try {
    await appendToSheet("portal-date-changes", [
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

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[portal/date-changes]", err);
    return NextResponse.json({ error: "Failed to submit. Please try again." }, { status: 500 });
  }
}
