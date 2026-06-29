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

  let body: { issueType?: string; description?: string; incidentDate?: string; photos?: string[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const issueType = body.issueType?.trim() ?? "";
  const description = body.description?.trim() ?? "";

  if (!issueType || !description) {
    return NextResponse.json({ error: "Issue type and description are required." }, { status: 400 });
  }

  const today = new Date().toLocaleDateString("en-US");
  const photos = (body.photos ?? []).join(", ");

  try {
    await appendToSheet("portal-complaints", [
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

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[portal/complaints]", err);
    return NextResponse.json({ error: "Failed to submit. Please try again." }, { status: 500 });
  }
}
