import { NextRequest, NextResponse } from "next/server";
import { requirePortalAccount } from "@/lib/portalAuth";
import { appendPortalRequest } from "@/lib/data/customer-portal";
import { sendPortalNotification } from "@/lib/email";

export async function POST(request: NextRequest) {
  const session = await requirePortalAccount();
  if (!session) {
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
