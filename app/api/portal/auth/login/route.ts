import { NextRequest, NextResponse } from "next/server";
import { getIronSession } from "iron-session";
import { newPortalOn, sessionOptions, type PortalSessionData } from "@/lib/portalSession";
import { verifyLogin } from "@/lib/pg/portal-auth";

// POST { email, password }: the new portal's login. Nothing typed here is
// logged. A wrong email and a wrong password get the same answer.
export async function POST(request: NextRequest) {
  if (!newPortalOn()) return NextResponse.json({ error: "Not available." }, { status: 404 });

  let body: { email?: unknown; password?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "wrong" }, { status: 401 });
  }

  try {
    const result = await verifyLogin(String(body.email ?? ""), typeof body.password === "string" ? body.password : "");
    if (!result.ok) {
      return NextResponse.json(
        result.reason === "locked" ? { error: "locked", minutesLeft: result.minutesLeft } : { error: "wrong" },
        { status: result.reason === "locked" ? 429 : 401 }
      );
    }

    const one = result.accounts.length === 1 ? result.accounts[0] : null;
    const response = NextResponse.json({ success: true, needsLocation: !one });
    const session = await getIronSession<PortalSessionData>(request, response, sessionOptions());
    session.email = result.email;
    session.accountId = one?.accountId;
    session.accountName = one?.accountName;
    session.portalCode = undefined;
    await session.save();
    return response;
  } catch (err) {
    console.error("[portal/auth/login]", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "server" }, { status: 500 });
  }
}
