import { NextRequest, NextResponse } from "next/server";
import { getIronSession } from "iron-session";
import { sessionOptions, type PortalSessionData } from "@/lib/portalSession";
import { getCustomerByPortalCode, getCustomerByPhone, normalizePhone } from "@/lib/googleSheets";

const INVALID = NextResponse.json({ error: "Invalid credentials" }, { status: 401 });

export async function POST(request: NextRequest) {
  let body: { phone?: unknown; portalCode?: unknown };
  try {
    body = await request.json();
  } catch {
    return INVALID;
  }

  const phone      = typeof body.phone      === "string" ? body.phone.trim()      : "";
  const portalCode = typeof body.portalCode === "string" ? body.portalCode.trim() : "";

  console.log("[portal/login] incoming →", { phone, portalCode });

  if (!phone || !portalCode) {
    console.log("[portal/login] missing phone or portalCode");
    return INVALID;
  }

  if (normalizePhone(phone).length !== 10) {
    return NextResponse.json({ error: "Please enter a valid 10-digit phone number" }, { status: 400 });
  }

  try {
    const [byPhone, byCode] = await Promise.all([
      getCustomerByPhone(phone),
      getCustomerByPortalCode(portalCode),
    ]);

    console.log("[portal/login] getCustomerByPhone →", byPhone
      ? { accountId: byPhone.accountId, accountName: byPhone.accountName, portalAccess: byPhone.portalAccess }
      : null);

    console.log("[portal/login] getCustomerByPortalCode →", byCode
      ? { accountId: byCode.accountId, accountName: byCode.accountName, portalAccess: byCode.portalAccess }
      : null);

    const phoneId = byPhone?.accountId ?? byPhone?.accountName ?? null;
    const codeId  = byCode?.accountId  ?? byCode?.accountName  ?? null;
    const match   = phoneId !== null && codeId !== null && phoneId === codeId;

    console.log("[portal/login] accountId match →", { phoneId, codeId, match });

    if (!match || !byCode || byCode.portalAccess?.toUpperCase() !== "YES") {
      console.log("[portal/login] REJECTED — match:", match,
        "| portalAccess:", byCode?.portalAccess);
      return INVALID;
    }

    const response = NextResponse.json({
      success: true,
      accountName: byCode.accountName,
    });

    const session = await getIronSession<PortalSessionData>(request, response, sessionOptions());
    session.accountId   = byCode.accountId;
    session.accountName = byCode.accountName;
    session.portalCode  = byCode.portalCode;
    await session.save();

    console.log("[portal/login] SUCCESS — session saved for", byCode.accountName);
    return response;
  } catch (err) {
    console.error("[portal/login] server error →", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
