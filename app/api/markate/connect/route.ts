// "Connect Markate" (Settings -> Markate): owner only. Makes a one-time state
// value, keeps it in a short-lived cookie, and sends the browser to Markate's
// login. Markate sends it back to /api/markate/oauth/callback, which checks it.

import { randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getAdminIdentity } from "@/lib/adminSession";
import { MARKATE_REDIRECT_URI, authorizeUrl, markateConfigured } from "@/lib/markate";
import { markateReady } from "@/lib/pg/markate";

// Same name in oauth/callback/route.ts.
const STATE_COOKIE = "cw_markate_state";

const back = (request: NextRequest, error: string) => NextResponse.redirect(new URL(`/settings/markate?error=${encodeURIComponent(error)}`, request.url));

export async function GET(request: NextRequest) {
  const identity = await getAdminIdentity(request);
  if (identity?.role !== "owner") return back(request, "Only the owner can connect Markate.");
  if (!(await markateReady())) return back(request, "Markate is not turned on here yet.");
  if (!markateConfigured()) return back(request, "Markate is not set up here (the app keys are missing).");
  // Markate only sends people back to the main app address, where the state cookie must be.
  if (new URL(request.url).origin !== new URL(MARKATE_REDIRECT_URI).origin) {
    return back(request, `Connect Markate from ${new URL(MARKATE_REDIRECT_URI).origin}/settings/markate. Markate only sends people back there.`);
  }
  const state = randomBytes(24).toString("base64url");
  const response = NextResponse.redirect(authorizeUrl(state));
  response.cookies.set(STATE_COOKIE, state, { httpOnly: true, secure: true, sameSite: "lax", path: "/api/markate", maxAge: 600 });
  return response;
}
