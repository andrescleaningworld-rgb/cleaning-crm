// Public, no-login route (proxy.ts PUBLIC_PATHS) — the pre-login read
// surface for the /team-hub/[token] page. SECURITY-CRITICAL, same rule as
// the archived Site Supply Link's equivalent route: this response must
// never include account_id, sub_id, account name/address/contacts, or any
// other-account data. Only the site's own Team Hub label, the crew's name,
// and its active workers' first names (for the login picker) ever leave
// this route.
import { NextRequest, NextResponse } from "next/server";
import { getActiveTeamHubCrewByToken, listActiveTeamHubWorkerNames } from "@/lib/teamHubDb";
import { checkRateLimit } from "@/lib/siteLinkRateLimit";

export async function GET(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params;

    const allowed = await checkRateLimit(`teamhub-get:${token}`);
    if (!allowed) {
      return NextResponse.json({ success: false, error: "Too many requests. Please wait a minute and try again." }, { status: 429 });
    }

    const found = await getActiveTeamHubCrewByToken(token);

    if (!found) {
      // Deliberately identical shape/status for "token doesn't exist",
      // "crew revoked", and "site deactivated" — no way to distinguish the
      // three from the response, so a guessed token reveals nothing.
      return NextResponse.json({ success: true, active: false });
    }

    const workers = await listActiveTeamHubWorkerNames(found.crew.id);

    return NextResponse.json({
      success: true,
      active: true,
      siteLabel: found.site.label,
      crewName: found.crew.name,
      workers,
    });
  } catch (error) {
    console.error("[team-hub token GET]", error);
    return NextResponse.json({ success: false, error: "Something went wrong loading this link." }, { status: 500 });
  }
}
