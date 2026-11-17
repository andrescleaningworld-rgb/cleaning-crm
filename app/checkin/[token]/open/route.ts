// The "Viewed" picture in the check-in email: /checkin/<token>/open, a 1x1
// see-through GIF. When the customer's mail app loads it, the check-in gets
// its first-opened time and one more open (migration 080). Approximate: some
// mail apps block pictures, some load them by themselves.
//
// Public (proxy.ts: /checkin). Always answers the same picture, good link or
// not, so it tells nothing to anyone. Only a good, signed link counts
// (lib/checkinLink.ts), at most 20 times a minute per link. Never cached, so
// each open reaches us.

import { NextRequest } from "next/server";
import { readCheckinToken } from "@/lib/checkinLink";
import { checkRateLimit } from "@/lib/siteLinkRateLimit";
import { recordCheckinOpen } from "@/lib/pg/customer-checkin";

type RouteContext = { params: Promise<{ token: string }> };

const GIF = Buffer.from("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7", "base64");

function pixel(): Response {
  return new Response(new Uint8Array(GIF), {
    headers: {
      "Content-Type": "image/gif",
      "Content-Length": String(GIF.length),
      "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
      "X-Robots-Tag": "noindex, nofollow",
      "Referrer-Policy": "no-referrer",
    },
  });
}

export async function GET(_request: NextRequest, context: RouteContext) {
  try {
    const id = readCheckinToken((await context.params).token);
    if (id && id > 0 && (await checkRateLimit(`checkin-open:${id}`, 20))) await recordCheckinOpen(id);
  } catch (error) {
    console.error("[checkin open]", error instanceof Error ? error.message : error);
  }
  return pixel();
}
