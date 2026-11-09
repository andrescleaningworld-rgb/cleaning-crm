// GET /api/complaints/<id>: one complaint for the Complaint Detail page, with
// its photos and its edit history (lib/pg/complaint-detail.ts). Staff only.
// Saving still goes through POST /api/complaints (action "editComplaint"),
// which writes each change to the activity log the history is read from.

import { NextRequest, NextResponse } from "next/server";
import { getAdminIdentity } from "@/lib/adminSession";
import { getComplaintDetail } from "@/lib/pg/complaint-detail";

const noStore = { headers: { "Cache-Control": "no-store" } };

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    if (!(await getAdminIdentity(request))) return NextResponse.json({ success: false, error: "Log in first." }, { status: 401, ...noStore });
    const { id } = await context.params;
    const detail = await getComplaintDetail(decodeURIComponent(id));
    if (!detail) return NextResponse.json({ success: false, error: "Complaint not found." }, { status: 404, ...noStore });
    return NextResponse.json({ success: true, ...detail }, noStore);
  } catch (error) {
    console.error("[complaints/:id GET]", error instanceof Error ? error.message : error);
    return NextResponse.json({ success: false, error: "The complaint did not load." }, { status: 500, ...noStore });
  }
}
