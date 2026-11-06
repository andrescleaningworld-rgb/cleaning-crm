// Public, no-login route (proxy.ts PUBLIC_PATHS covers "/api/porter-checklist"):
// the documents the office shared with the sub ("Share with sub" on) for this
// Crew Link's own account. View / download only. Gated by the link's
// porter_code, rate-limited per code like the other Crew Link routes.

import { NextRequest, NextResponse } from "next/server";
import { resolveCrewLink, crewLinkIsLive } from "@/lib/crewLink";
import { checkRateLimit } from "@/lib/siteLinkRateLimit";
import { listSharedForAccount } from "@/lib/pg/account-documents";

type Context = { params: Promise<{ code: string }> };

export async function GET(_request: NextRequest, { params }: Context) {
  try {
    const { code } = await params;
    if (!(await checkRateLimit(`crewlink-docs-get:${code}`))) {
      return NextResponse.json({ success: false, error: "Too many requests. Please wait a minute and try again." }, { status: 429 });
    }
    const link = await resolveCrewLink(code);
    if (!link || !crewLinkIsLive(link.modules)) return NextResponse.json({ success: false, error: "Not available." }, { status: 404 });
    // Only what a crew needs: the name, the type and the file.
    const documents = (await listSharedForAccount(link.template.accountId)).map(({ id, name, docType, fileUrl, fileSize }) => ({ id, name, docType, fileUrl, fileSize }));
    return NextResponse.json({ success: true, documents }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("[crew-link documents GET]", error);
    return NextResponse.json({ success: false, error: "Something went wrong." }, { status: 500 });
  }
}
