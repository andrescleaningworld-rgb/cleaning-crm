import { NextRequest, NextResponse } from "next/server";

const SCRIPT_URL = process.env.GOOGLE_SCRIPT_URL;

const ALLOWED_GET_ACTIONS = new Set([
  "getAccounts",
  "accounts",
  "getAllAccounts",
  "allAccounts",
  "getMapAccounts",
  "mapAccounts",
]);

export async function GET(request: NextRequest) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 9000);

  try {
    if (!SCRIPT_URL) {
      return NextResponse.json(
        { success: false, error: "Missing GOOGLE_SCRIPT_URL in .env.local" },
        { status: 500 }
      );
    }

    const { searchParams } = new URL(request.url);
    const requestedAction = searchParams.get("action") || "getAllAccounts";
    const action = ALLOWED_GET_ACTIONS.has(requestedAction)
      ? requestedAction
      : "getAllAccounts";
    const q = searchParams.get("q")?.toLowerCase().trim() ?? "";

    let data: { success?: boolean; error?: string; message?: string; accounts?: unknown[]; data?: unknown[] };

    try {
      const response = await fetch(
        `${SCRIPT_URL}?action=${encodeURIComponent(action)}`,
        {
          method: "GET",
          cache: "no-store",
          signal: controller.signal,
        }
      );
      const text = await response.text();
      try {
        data = JSON.parse(text);
      } catch {
        return NextResponse.json(
          {
            success: false,
            error: "Google Script did not return valid JSON while loading accounts.",
            rawResponse: text,
            requestedAction: action,
          },
          { status: 500 }
        );
      }
      if (!response.ok || data.success === false) {
        return NextResponse.json(
          {
            success: false,
            error: data.error || data.message || "Failed to load accounts from Google Script.",
            googleScriptResponse: data,
            googleScriptStatus: response.status,
            requestedAction: action,
          },
          { status: 500 }
        );
      }
    } catch (err) {
      const isTimeout = err instanceof Error && err.name === "AbortError";
      return NextResponse.json(
        {
          success: false,
          error: isTimeout
            ? "Request timed out, please retry."
            : err instanceof Error
              ? err.message
              : "Unknown error loading accounts.",
          requestedAction: action,
        },
        { status: isTimeout ? 504 : 500 }
      );
    } finally {
      clearTimeout(timeout);
    }

    let accounts: unknown[] = (data.accounts ?? data.data ?? []) as unknown[];

    if (q) {
      accounts = accounts.filter((account) => {
        return Object.values(account as Record<string, unknown>).some((value) =>
          String(value ?? "").toLowerCase().includes(q)
        );
      });
    }

    return NextResponse.json(
      {
        success: true,
        action,
        accounts,
      },
      {
        headers: {
          "Cache-Control": "public, max-age=60, stale-while-revalidate=120",
        },
      }
    );
  } catch (error) {
    clearTimeout(timeout);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Unknown error loading accounts." },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    if (!SCRIPT_URL) {
      return NextResponse.json(
        { success: false, error: "Missing GOOGLE_SCRIPT_URL in .env.local" },
        { status: 500 }
      );
    }

    const body = await request.json();
    const action = String(body.action || "").trim();

    // === NEW: Handle Send New Account Packet ===
    if (action === "sendNewAccountPacket") {
      const response = await fetch(SCRIPT_URL, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify(body),
      });

      const text = await response.text();

      let data;
      try {
        data = JSON.parse(text);
      } catch {
        return NextResponse.json(
          { success: false, error: "Invalid response from Google Script for packet" },
          { status: 500 }
        );
      }

      return NextResponse.json(data);
    }

    // Handle other account actions (add / update)
    const accountPayload = body.account || body;

    // Sending a packet must NEVER create a new row in the sheet.
    // Call the Apps Script via GET so doGet() runs (not doPost which writes rows).
    if (body.action === "sendNewAccountPacket") {
      const params = new URLSearchParams({
        action: "sendNewAccountPacket",
        accountId:              String(body.accountId              ?? ""),
        accountName:            String(body.accountName            ?? ""),
        address:                String(body.address                ?? ""),
        startDate:              String(body.startDate              ?? ""),
        cleaningSchedule:       String(body.cleaningSchedule       ?? ""),
        subcontractor:          String(body.subcontractor          ?? ""),
        subcontractorEmail:     String(body.subcontractorEmail     ?? ""),
        monthlySubcontractorPay:String(body.monthlySubcontractorPay?? ""),
        hasKey:                 String(body.hasKey                 ?? ""),
        alarmInfo:              String(body.alarmInfo              ?? ""),
        scope:                  String(body.scope                  ?? ""),
        notes:                  String(body.notes                  ?? ""),
        manager:                String(body.manager                ?? ""),
      });

      const response = await fetch(`${SCRIPT_URL}?${params.toString()}`, {
        method: "GET",
        cache: "no-store",
      });

      const text = await response.text();
      let data: Record<string, unknown> = { success: true };
      try { data = JSON.parse(text); } catch { /* Apps Script may return plain text */ }

      if (data.success === false) {
        return NextResponse.json(
          { success: false, error: String(data.error ?? "Apps Script returned failure.") },
          { status: 500 }
        );
      }

      return NextResponse.json({
        success: true,
        message: String(data.message ?? "New account packet sent successfully."),
      });
    }

    // All other actions (addAccount, updateAccount, etc.) go through doPost as before.
    const response = await fetch(SCRIPT_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({
        action: action === "updateAccount" || action === "editAccount" ? "updateAccount" : "addAccount",
        account: accountPayload,
      }),
      cache: "no-store",
    });

    const text = await response.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      return NextResponse.json(
        {
          success: false,
          error: "Google Script did not return valid JSON while saving account.",
          rawResponse: text,
        },
        { status: 500 }
      );
    }

    if (!response.ok || data.success === false) {
      return NextResponse.json(
        {
          success: false,
          error: data.error || data.message || "Failed to save account.",
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: data.message || "Account saved successfully.",
      account: data.account || null,
      accountId: data.accountId || data.id || null,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error saving account.",
      },
      { status: 500 }
    );
  }
}