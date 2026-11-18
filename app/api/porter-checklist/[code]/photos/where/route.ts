// Public, no-login (proxy.ts PUBLIC_PATHS covers "/api/porter-checklist"):
// CW Now "You seem to be at <Other Account>. Is this the right link?".
// POST { lat, lng } (in the body, so the location never sits in a web
// address or a log; it is not saved here) -> { otherAccount }: the name of
// another active account within 500 ft, only when this link's account is
// more than 1,000 ft away (lib/photoLocation.ts). Nothing else about any
// account. Gated by a live link code, rate-limited per code. The photos
// still go either way.

import { filesJson } from "@/lib/files";
import { NextRequest } from "next/server";
import { checkRateLimit } from "@/lib/siteLinkRateLimit";
import { crewLinkIsLive, resolveCrewLink } from "@/lib/crewLink";
import { FAR_FROM_LINK_FEET, NEAR_ACCOUNT_FEET, feetBetween, isGeoPoint } from "@/lib/photoLocation";
import { accountPlace, nearbyAccounts } from "@/lib/pg/nearby-accounts";

const nothing = () => filesJson({ success: true, otherAccount: null });

export async function POST(request: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  try {
    const { code } = await params;
    if (!(await checkRateLimit(`crewlink-where:${code}`, 20))) return nothing();
    const link = await resolveCrewLink(code);
    if (!link || !crewLinkIsLive(link.modules)) return filesJson({ success: false, error: "This link is not active." }, { status: 404 });
    const body = (await request.json().catch(() => ({}))) as { lat?: unknown; lng?: unknown };
    const lat = Number(body.lat);
    const lng = Number(body.lng);
    if (!isGeoPoint(lat, lng)) return nothing();
    const here = { lat, lng };
    const own = await accountPlace(link.template.accountId);
    // This account is not on the map, or the phone is near it: nothing to say.
    if (!own?.point || feetBetween(here, own.point) <= FAR_FROM_LINK_FEET) return nothing();
    const other = (await nearbyAccounts(here, NEAR_ACCOUNT_FEET)).find((entry) => entry.accountId !== link.template.accountId);
    return filesJson({ success: true, otherAccount: other ? other.accountName : null });
  } catch (error) {
    console.error("[crew-link photos where]", error instanceof Error ? error.message : error);
    return nothing();
  }
}
