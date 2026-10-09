import { NextRequest, NextResponse } from "next/server";
import { getIronSession } from "iron-session";
import { newPortalOn, sessionOptions, type PortalSessionData } from "@/lib/portalSession";
import { accountsForEmail, setPasswordWithToken } from "@/lib/pg/portal-auth";

// POST { token, password }: sets the password from a link and logs the
// customer in. The password is hashed here and never logged.
export async function POST(request: NextRequest) {
  if (!newPortalOn()) return NextResponse.json({ error: "Not available." }, { status: 404 });

  let body: { token?: unknown; password?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  try {
    const result = await setPasswordWithToken(String(body.token ?? ""), typeof body.password === "string" ? body.password : "");
    if (!result.ok) return NextResponse.json({ error: result.reason }, { status: result.reason === "short" ? 400 : 410 });

    const accounts = await accountsForEmail(result.email);
    const response = NextResponse.json({ success: true, needsLocation: accounts.length > 1 });
    const session = await getIronSession<PortalSessionData>(request, response, sessionOptions());
    session.email = result.email;
    session.accountId = accounts.length === 1 ? accounts[0].accountId : undefined;
    session.accountName = accounts.length === 1 ? accounts[0].accountName : undefined;
    session.portalCode = undefined;
    await session.save();
    return response;
  } catch (err) {
    console.error("[portal/auth/set-password]", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "server" }, { status: 500 });
  }
}
