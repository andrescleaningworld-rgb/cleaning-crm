// The sub portal's "Documents" box: files the office shared with this sub
// ("Share with sub" on), for the sub's own accounts only. View / download
// only. Identity comes from the sub_session cookie, never from the page.

import { NextRequest, NextResponse } from "next/server";
import { getIronSession } from "iron-session";
import { subSessionOptions, type SubSessionData } from "@/lib/subSession";
import { listSharedForSub } from "@/lib/pg/account-documents";

export async function GET(request: NextRequest) {
  try {
    const session = await getIronSession<SubSessionData>(request, NextResponse.json({}), subSessionOptions());
    const email = session.subcontractorEmail?.trim() ?? "";
    if (!email) return NextResponse.json({ success: false, error: "Not logged in." }, { status: 401 });
    return NextResponse.json({ success: true, documents: await listSharedForSub(email) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("[subcontractor-portal/documents GET]", error instanceof Error ? error.message : error);
    return NextResponse.json({ success: false, error: "Your documents did not load." }, { status: 500 });
  }
}
