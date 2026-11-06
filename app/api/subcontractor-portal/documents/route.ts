// The sub portal's "Documents" box: files the office shared with this sub
// ("Share with sub" on), for the sub's own accounts only. View / download
// only. Identity comes from the sub_session cookie, never from the page.

import { filesJson } from "@/lib/files";
import { NextRequest } from "next/server";
import { getIronSession } from "iron-session";
import { subSessionOptions, type SubSessionData } from "@/lib/subSession";
import { listSharedForSub } from "@/lib/pg/account-documents";

export async function GET(request: NextRequest) {
  try {
    const session = await getIronSession<SubSessionData>(request, filesJson({}), subSessionOptions());
    const email = session.subcontractorEmail?.trim() ?? "";
    if (!email) return filesJson({ success: false, error: "Not logged in." }, { status: 401 });
    return filesJson({ success: true, documents: await listSharedForSub(email) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("[subcontractor-portal/documents GET]", error instanceof Error ? error.message : error);
    return filesJson({ success: false, error: "Your documents did not load." }, { status: 500 });
  }
}
