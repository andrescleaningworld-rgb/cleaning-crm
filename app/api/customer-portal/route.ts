import { NextResponse } from "next/server";
import { getCustomerByPhone, getMainAccountByName, fetchManagers } from "@/lib/googleSheets";

const SCRIPT_URL =
  process.env.GOOGLE_SCRIPT_URL || process.env.NEXT_PUBLIC_GOOGLE_SCRIPT_URL;

type ScriptResponse = {
  success?: boolean;
  message?: string;
  error?: string;
  account?: unknown;
  accounts?: unknown[];
  requests?: unknown[];
  complaints?: unknown[];
  history?: unknown[];
  id?: string;
  status?: string;
};

export async function POST(request: Request) {
  try {
    if (!SCRIPT_URL) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Missing GOOGLE_SCRIPT_URL or NEXT_PUBLIC_GOOGLE_SCRIPT_URL in .env.local",
        },
        { status: 500 }
      );
    }

    const body = await request.json();

    // Phone-based login lookup: check directly against the sheet instead of
    // forwarding to the Apps Script, which does an exact/formatted string
    // match and rejects our digits-only phone input.
    if (
      body.action === "getAccount" &&
      typeof body.phone === "string" &&
      body.phone.trim()
    ) {
      const customer = await getCustomerByPhone(body.phone);
      if (!customer) {
        return NextResponse.json(
          { success: false, error: "No account found with that phone number.", account: null, accounts: [] },
          { status: 404 }
        );
      }

      // Best-effort manager lookup — the customer-portal tab has no manager
      // field of its own, so cross-reference the main Accounts sheet by name,
      // then the Managers tab by name, for just the name + phone. Never lets
      // a lookup miss block the account response.
      let managerName = "";
      let managerPhone = "";
      try {
        const mainAccount = await getMainAccountByName(customer.accountName);
        managerName = mainAccount?.managerName?.trim() ?? "";

        if (managerName) {
          const managers = await fetchManagers();
          const normalizedManagerName = managerName.toLowerCase();
          const matchedManager = managers.find(
            (m) => m.name.trim().toLowerCase() === normalizedManagerName
          );
          managerPhone = matchedManager?.phone ?? "";
        }
      } catch {
        // Fail soft — manager info is a nice-to-have, not required for login.
      }

      const accountWithManager = { ...customer, managerName, managerPhone };

      return NextResponse.json({ success: true, account: accountWithManager, accounts: [accountWithManager] });
    }

    const customerId = body.customerId || body.email || "demo-customer";

    // Forward to script with customer context
    const scriptPayload = {
      ...body,
      customerId,
      action: body.action || "getCustomerData",
    };

    const response = await fetch(SCRIPT_URL, {
      method: "POST",
      headers: {
        "Content-Type": "text/plain;charset=utf-8",
      },
      body: JSON.stringify(scriptPayload),
      cache: "no-store",
    });

    const text = await response.text();

    let data: ScriptResponse;

    try {
      data = JSON.parse(text) as ScriptResponse;
    } catch {
      return NextResponse.json(
        {
          success: false,
          error: "Google Script did not return valid JSON for customer portal.",
          sentPayload: scriptPayload,
          rawResponse: text,
        },
        { status: 500 }
      );
    }

    if (!response.ok || data.success === false) {
      return NextResponse.json(
        {
          success: false,
          error:
            data.error ||
            data.message ||
            "Failed to complete customer portal request.",
          message: data.message || "",
          account: data.account || null,
          accounts: data.accounts || [],
          requests: data.requests || [],
          complaints: data.complaints || [],
          history: data.history || [],
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: data.message || "",
      account: data.account || null,
      accounts: data.accounts || [],
      requests: data.requests || [],
      complaints: data.complaints || [],
      history: data.history || [],
      id: data.id || "",
      status: data.status || "",
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Unknown error in customer portal.",
      },
      { status: 500 }
    );
  }
}

// Optional GET for simple fetches if needed
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const action = searchParams.get("action") || "getCustomerAccount";
  const customerId = searchParams.get("customerId") || "demo";

  try {
    if (!SCRIPT_URL) {
      return NextResponse.json(
        { success: false, error: "Missing GOOGLE_SCRIPT_URL" },
        { status: 500 }
      );
    }

    const response = await fetch(
      `${SCRIPT_URL}?action=${action}&customerId=${customerId}`,
      { method: "GET", cache: "no-store" }
    );

    const text = await response.text();
    const data = JSON.parse(text);

    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json(
      { success: false, error: "Failed customer GET" },
      { status: 500 }
    );
  }
}
