import { NextRequest, NextResponse } from "next/server";
import { listPortalSubmissions, updateSubmissionStatus } from "@/lib/googleSheets";
import type { PortalSubmission } from "@/lib/googleSheets";

export async function GET() {
  try {
    const submissions = await listPortalSubmissions();
    return NextResponse.json(submissions);
  } catch (err) {
    console.error("[staff/portal-submissions GET]", err);
    return NextResponse.json({ error: "Failed to load submissions" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json() as {
      tab?: PortalSubmission["tab"];
      sheetRow?: number;
      status?: string;
      notes?: string;
    };

    const { tab, sheetRow, status, notes } = body;
    if (!tab || !sheetRow || !status) {
      return NextResponse.json({ error: "Missing fields" }, { status: 400 });
    }

    await updateSubmissionStatus(tab, sheetRow, status, notes ?? "");
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[staff/portal-submissions PATCH]", err);
    return NextResponse.json({ error: "Failed to update" }, { status: 500 });
  }
}
