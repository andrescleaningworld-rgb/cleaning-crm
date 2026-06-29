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

  let body: { requestType?: string; details?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const requestType = body.requestType?.trim() ?? "";
  const details = body.details?.trim() ?? "";

  if (!requestType) {
    return NextResponse.json({ error: "Request type is required." }, { status: 400 });
  }

  const today = new Date().toLocaleDateString("en-US");

  try {
    await appendToSheet("portal-billing-requests", [
      session.accountId,
      session.accountName ?? "",
      today,
      requestType,
      details,
      "New",
      "",
    ]);

    await sendPortalNotification({
      subject: "Billing Information Request",
      accountName: session.accountName ?? "",
      accountId: session.accountId,
      lines: [
        `Request Type: ${requestType}`,
        `Details: ${details || "None"}`,
      ],
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[portal/billing-requests]", err);
    return NextResponse.json({ error: "Failed to submit. Please try again." }, { status: 500 });
  }
}
