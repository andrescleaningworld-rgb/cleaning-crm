// Public, no-login route (added to proxy.ts PUBLIC_PATHS) — the entire
// read surface for the /s/[token] page. SECURITY-CRITICAL: this response
// must never include account_id, sub_id, account name, address, contacts,
// key/alarm info, billing, or any other-account data. Only link.label,
// the allowed supply items, and this link's own recent submissions ever
// leave this route. See lib/siteLinkDb.ts's file comment for the same rule
// applied to every "public"-facing query function.
import { NextRequest, NextResponse } from "next/server";
import {
  getActiveSiteLinkByToken,
  listSupplyItemsForLink,
  listPublicRecentForLink,
} from "@/lib/siteLinkDb";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;
    const link = await getActiveSiteLinkByToken(token);

    if (!link) {
      // Deliberately identical shape/status for "token doesn't exist" and
      // "token exists but is revoked" — no way to distinguish the two from
      // the response, so a guessed token reveals nothing.
      return NextResponse.json({ success: true, active: false });
    }

    const [items, recent] = await Promise.all([
      listSupplyItemsForLink(link.id),
      listPublicRecentForLink(link.id, 10),
    ]);

    return NextResponse.json({
      success: true,
      active: true,
      label: link.label,
      items: items.map((i) => ({ id: i.id, name: i.name, unit: i.unit })),
      recent,
    });
  } catch (error) {
    console.error("[site-link GET]", error);
    return NextResponse.json(
      { success: false, error: "Something went wrong loading this link." },
      { status: 500 }
    );
  }
}
