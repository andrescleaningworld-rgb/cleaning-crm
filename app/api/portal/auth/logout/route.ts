import { NextRequest, NextResponse } from "next/server";
import { getIronSession } from "iron-session";
import { sessionOptions, type PortalSessionData } from "@/lib/portalSession";

// POST: ends the portal session on this device.
export async function POST(request: NextRequest) {
  const response = NextResponse.json({ success: true });
  const session = await getIronSession<PortalSessionData>(request, response, sessionOptions());
  session.destroy();
  return response;
}
