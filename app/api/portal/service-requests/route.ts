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

  let body: { serviceRequested?: string; details?: string; preferredDate?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const serviceRequested = body.serviceRequested?.trim() ?? "";
  const details = body.details?.trim() ?? "";

  if (!serviceRequested) {
    return NextResponse.json({ error: "Service type is required." }, { status: 400 });
  }

  const today = new Date().toLocaleDateString("en-US");

  try {
    await appendToSheet("portal-service-requests", [
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
      subject: "New Service Request",
      accountName: session.accountName ?? "",
      accountId: session.accountId,
      lines: [
        `Service Requested: ${serviceRequested}`,
        `Details: ${details || "None"}`,
        `Preferred Date: ${body.preferredDate ?? "Not provided"}`,
      ],
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[portal/service-requests]", err);
    return NextResponse.json({ error: "Failed to submit. Please try again." }, { status: 500 });
  }
}
