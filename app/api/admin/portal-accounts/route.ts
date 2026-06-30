import { NextRequest, NextResponse } from "next/server";
import {
  getMergedPortalAccounts,
  enablePortalAccount,
  updatePortalAccountFields,
} from "@/lib/googleSheets";

export async function GET() {
  try {
    const accounts = await getMergedPortalAccounts();
    return NextResponse.json(accounts);
  } catch (err) {
    console.error("[portal-accounts GET]", err);
    return NextResponse.json({ error: "Failed to load accounts" }, { status: 500 });
  }
}

// Enable portal access for an account not yet in the portal tab
export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as { accountName?: string; phone?: string; accountId?: string };
    const accountName = body.accountName?.trim();
    if (!accountName) return NextResponse.json({ error: "Account name required" }, { status: 400 });

    const portalCode = await enablePortalAccount(
      accountName,
      body.phone?.trim() ?? "",
      body.accountId?.trim() ?? "",
    );
    return NextResponse.json({ success: true, portalCode });
  } catch (err) {
    console.error("[portal-accounts POST]", err);
    return NextResponse.json({ error: "Failed to enable account" }, { status: 500 });
  }
}

// Update portal fields for an account already in the portal tab
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json() as {
      sheetRow?: number;
      action?: "toggleAccess" | "generateCode" | "updateFields";
      currentAccess?: string;
      fields?: {
        phone?: string;
        nextScheduledService?: string;
        estimatedMonthlyTotal?: string;
      };
    };

    const { sheetRow, action } = body;
    if (!sheetRow || !action) return NextResponse.json({ error: "Missing fields" }, { status: 400 });

    if (action === "toggleAccess") {
      const newAccess = body.currentAccess?.toUpperCase() === "YES" ? "NO" : "YES";
      await updatePortalAccountFields(sheetRow, { portalAccess: newAccess });
      return NextResponse.json({ success: true, portalAccess: newAccess });
    }

    if (action === "generateCode") {
      const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
      const code = "CW-" + Array.from({ length: 5 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
      await updatePortalAccountFields(sheetRow, { portalCode: code });
      return NextResponse.json({ success: true, portalCode: code });
    }

    if (action === "updateFields") {
      await updatePortalAccountFields(sheetRow, body.fields ?? {});
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    console.error("[portal-accounts PATCH]", err);
    return NextResponse.json({ error: "Failed to update account" }, { status: 500 });
  }
}
