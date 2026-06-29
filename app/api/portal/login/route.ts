import { NextRequest, NextResponse } from "next/server";
import { getIronSession } from "iron-session";
import { sessionOptions, type PortalSessionData } from "@/lib/portalSession";
import { getCustomerByPortalCode } from "@/lib/googleSheets";

const INVALID = NextResponse.json({ error: "Invalid portal code" }, { status: 401 });

export async function POST(request: NextRequest) {
  let body: { portalCode?: unknown };
  try {
    body = await request.json();
  } catch {
    return INVALID;
  }

  const portalCode = typeof body.portalCode === "string" ? body.portalCode.trim() : "";
  if (!portalCode) return INVALID;

  try {
    const customer = await getCustomerByPortalCode(portalCode);

    if (!customer || customer.portalAccess?.toUpperCase() !== "YES") {
      return INVALID;
    }

    const response = NextResponse.json({
      success: true,
      accountName: customer.accountName,
    });

    const session = await getIronSession<PortalSessionData>(request, response, sessionOptions());
    session.accountId = customer.accountId;
    session.accountName = customer.accountName;
    session.portalCode = customer.portalCode;
    await session.save();

    return response;
  } catch (err) {
    console.error("[portal/login]", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
