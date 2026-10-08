import { NextRequest, NextResponse } from "next/server";
import { getIronSession } from "iron-session";
import { newPortalOn, sessionOptions, type PortalSessionData } from "@/lib/portalSession";
import { accountsForEmail } from "@/lib/pg/portal-auth";

// POST { accountId }: "Which location?". Only a location the logged-in
// email really opens can be picked.
export async function POST(request: NextRequest) {
  if (!newPortalOn()) return NextResponse.json({ error: "Not available." }, { status: 404 });

  let body: { accountId?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const response = NextResponse.json({ success: true });
  const session = await getIronSession<PortalSessionData>(request, response, sessionOptions());
  if (!session.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const picked = (await accountsForEmail(session.email)).find((a) => a.accountId === String(body.accountId ?? ""));
  if (!picked) return NextResponse.json({ error: "Not your location." }, { status: 403 });

  session.accountId = picked.accountId;
  session.accountName = picked.accountName;
  await session.save();
  return response;
}
