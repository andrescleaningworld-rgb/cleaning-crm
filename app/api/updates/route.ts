import { NextResponse } from "next/server";
import { fetchAppsScript, AppsScriptFetchError } from "@/lib/appsScriptFetch";

const SCRIPT_URL = process.env.GOOGLE_SCRIPT_URL;

// Apps Script latency has been measured spiking to ~14s on a single call;
// this must comfortably exceed the per-attempt timeout in fetchAppsScript
// (18s) plus its one retry plus backoff, or Vercel would kill the function
// before our own retry/error-handling logic gets a chance to run. Matches
// the budget used by /api/accounts and /api/subcontractor-portal for the
// same upstream.
export const maxDuration = 45;

export async function GET() {
  try {
    if (!SCRIPT_URL) {
      return NextResponse.json(
        {
          success: false,
          error: "Missing GOOGLE_SCRIPT_URL in .env.local",
        },
        { status: 500 }
      );
    }

    // Read-only action — safe to retry after a throw (timeout/network
    // failure).
    const response = await fetchAppsScript(
      `${SCRIPT_URL}?action=getAccountUpdates`,
      { method: "GET", cache: "no-store" },
      undefined,
      { retryOn5xx: true, retryOnThrow: true }
    );

    const text = await response.text();

    let data;

    try {
      data = JSON.parse(text);
    } catch {
      return NextResponse.json(
        {
          success: false,
          error:
            "Google Script did not return valid JSON while loading account updates.",
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
            "Failed to load account updates from Google Script.",
        },
        { status: 500 }
      );
    }

    const updates = data.accountUpdates || data.updates || [];

    return NextResponse.json({
      success: true,
      updates,
      accountUpdates: updates,
    });
  } catch (error) {
    if (error instanceof AppsScriptFetchError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.status }
      );
    }
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Unknown error loading account updates.",
      },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    if (!SCRIPT_URL) {
      return NextResponse.json(
        {
          success: false,
          error: "Missing GOOGLE_SCRIPT_URL in .env.local",
        },
        { status: 500 }
      );
    }

    const body = await request.json();

    // addAccountUpdate appends a new history row (and sends an email) — not
    // idempotent, so a thrown error (timeout/network failure) is not
    // retried here to avoid risking a duplicate entry/email. A 5xx means
    // the Apps Script explicitly rejected the request (safe to retry,
    // nothing was written).
    const response = await fetchAppsScript(
      SCRIPT_URL,
      {
        method: "POST",
        headers: {
          "Content-Type": "text/plain;charset=utf-8",
        },
        body: JSON.stringify({
          action: "addAccountUpdate",
          ...body,
        }),
        cache: "no-store",
      },
      undefined,
      { retryOn5xx: true, retryOnThrow: false }
    );

    const text = await response.text();

    let data;

    try {
      data = JSON.parse(text);
    } catch {
      return NextResponse.json(
        {
          success: false,
          error:
            "Google Script did not return valid JSON while saving account update.",
          rawResponse: text,
        },
        { status: 500 }
      );
    }

    if (!response.ok || data.success === false) {
      return NextResponse.json(
        {
          success: false,
          error: data.error || "Google Script failed.",
        },
        { status: 500 }
      );
    }

    return NextResponse.json(data);
  } catch (error) {
    if (error instanceof AppsScriptFetchError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.status }
      );
    }
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Unknown error saving account update.",
      },
      { status: 500 }
    );
  }
}