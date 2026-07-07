import { NextRequest, NextResponse } from "next/server";
import { getOrFetch } from "@/lib/serverCache";

const SCRIPT_URL = process.env.GOOGLE_SCRIPT_URL;

const ALLOWED_GET_ACTIONS = new Set([
  "getAccounts",
  "accounts",
  "getAllAccounts",
  "allAccounts",
  "getMapAccounts",
  "mapAccounts",
]);

class AccountsFetchError extends Error {
  status: number;
  details: Record<string, unknown>;
  constructor(message: string, status: number, details: Record<string, unknown> = {}) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

// Fetches the raw (unfiltered) account list for a given action from the
// shared Apps Script backend. Wrapped in getOrFetch below so every distinct
// action is only fetched from Apps Script once per 60s, no matter how many
// different "q" searches hit this route in that window.
async function fetchAccountsForAction(action: string): Promise<unknown[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 9000);

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

    let data: { success?: boolean; error?: string; message?: string; accounts?: unknown[]; data?: unknown[] };
    try {
      data = JSON.parse(text);
    } catch {
      throw new AccountsFetchError(
        "Google Script did not return valid JSON while loading accounts.",
        500,
        { rawResponse: text, requestedAction: action }
      );
    }

    if (!response.ok || data.success === false) {
      throw new AccountsFetchError(
        data.error || data.message || "Failed to load accounts from Google Script.",
        500,
        { googleScriptResponse: data, googleScriptStatus: response.status, requestedAction: action }
      );
    }

    return (data.accounts ?? data.data ?? []) as unknown[];
  } catch (err) {
    if (err instanceof AccountsFetchError) throw err;
    const isTimeout = err instanceof Error && err.name === "AbortError";
    throw new AccountsFetchError(
      isTimeout
        ? "Request timed out, please retry."
        : err instanceof Error
          ? err.message
          : "Unknown error loading accounts.",
      isTimeout ? 504 : 500,
      { requestedAction: action }
    );
  } finally {
    clearTimeout(timeout);
  }
}

export async function GET(request: NextRequest) {
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

    let accounts: unknown[];
    try {
      accounts = await getOrFetch(`accounts:${action}`, () => fetchAccountsForAction(action));
    } catch (err) {
      if (err instanceof AccountsFetchError) {
        return NextResponse.json(
          { success: false, error: err.message, ...err.details },
          { status: err.status }
        );
      }
      return NextResponse.json(
        { success: false, error: err instanceof Error ? err.message : "Unknown error loading accounts." },
        { status: 500 }
      );
    }

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