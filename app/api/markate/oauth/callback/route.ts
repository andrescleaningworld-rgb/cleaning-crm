// Markate sends the browser back here after the login (the redirect URL
// Markate has on file). Owner only (the owner started it from Settings ->
// Markate, so their login cookie comes along). Checks the state value against
// the cookie /api/markate/connect set, trades the code for tokens and saves
// them encrypted. Never logs a code or a token.

import { NextRequest, NextResponse } from "next/server";
import { getAdminIdentity } from "@/lib/adminSession";
import { exchangeCode } from "@/lib/markate";
import { markateReady, saveConnection } from "@/lib/pg/markate";

const STATE_COOKIE = "cw_markate_state";

function back(request: NextRequest, query: string): NextResponse {
  const response = NextResponse.redirect(new URL(`/settings/markate?${query}`, request.url));
  response.cookies.set(STATE_COOKIE, "", { httpOnly: true, secure: true, sameSite: "lax", path: "/api/markate", maxAge: 0 });
  return response;
}

const fail = (request: NextRequest, error: string) => back(request, `error=${encodeURIComponent(error)}`);

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  if (params.get("error")) return fail(request, params.get("error") === "access_denied" ? "Markate was not connected (Deny was tapped)." : "Markate did not connect. Try again.");

  const identity = await getAdminIdentity(request);
  if (identity?.role !== "owner") return fail(request, "Only the owner can connect Markate.");
  if (!(await markateReady())) return fail(request, "Markate is not turned on here yet.");

  const state = params.get("state") ?? "";
  const expected = request.cookies.get(STATE_COOKIE)?.value ?? "";
  if (!state || !expected || state !== expected) return fail(request, "That Markate login did not start here, or took too long. Tap Connect Markate again.");

  const code = params.get("code") ?? "";
  if (!code) return fail(request, "Markate did not send a login code. Try again.");

  try {
    const tokens = await exchangeCode(code);
    await saveConnection(tokens, String(identity.name ?? "").trim() || "Owner");
    return back(request, "connected=1");
  } catch (error) {
    console.error("[markate callback]", error instanceof Error ? error.message : "failed");
    return fail(request, "Markate did not connect. Try again.");
  }
}
