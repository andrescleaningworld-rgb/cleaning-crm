import { filesJson } from "@/lib/files";
import { after, NextRequest } from "next/server";
import { logCustomerActivity } from "@/lib/activityLog";
import { getIronSession } from "iron-session";
import { sessionOptions, type PortalSessionData } from "@/lib/portalSession";

// POST: ends the portal session on this device.
export async function POST(request: NextRequest) {
  const response = filesJson({ success: true });
  const session = await getIronSession<PortalSessionData>(request, response, sessionOptions());
  // Activity Log -> Customers (the location they were in).
  if (session.email && session.accountId) {
    const who = { accountId: session.accountId, accountName: session.accountName ?? "", email: session.email };
    after(() => logCustomerActivity({ ...who, action: "logout", detail: "Logged out of the customer portal" }));
  }
  session.destroy();
  return response;
}
