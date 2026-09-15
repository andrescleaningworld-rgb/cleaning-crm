import { NextRequest, NextResponse } from "next/server";
import { fetchAppsScript, AppsScriptFetchError } from "@/lib/appsScriptFetch";

const GOOGLE_SCRIPT_URL = process.env.GOOGLE_SCRIPT_URL;

// Apps Script latency has been measured spiking to ~14s on a single call;
// this must comfortably exceed the per-attempt timeout in fetchAppsScript
// (18s) plus its one retry plus backoff, or Vercel would kill the function
// before our own retry/error-handling logic gets a chance to run. Matches
// the budget used by /api/accounts and /api/subcontractor-portal for the
// same upstream.
export const maxDuration = 45;

export async function POST(request: NextRequest) {
  if (!GOOGLE_SCRIPT_URL) {
    return NextResponse.json(
      {
        success: false,
        message: "GOOGLE_SCRIPT_URL is missing.",
      },
      { status: 500 }
    );
  }

  try {
    const body = await request.json();

    // submitSubPortalIssue appends a new row — not idempotent, so a thrown
    // error (timeout/network failure) is not retried here to avoid risking
    // a duplicate issue submission. A 5xx means the Apps Script explicitly
    // rejected the request (safe to retry, nothing was written).
    const response = await fetchAppsScript(
      GOOGLE_SCRIPT_URL,
      {
        method: "POST",
        headers: {
          "Content-Type": "text/plain;charset=utf-8",
        },
        body: JSON.stringify({
          action: "submitSubPortalIssue",
          issue: body,
        }),
      },
      undefined,
      { retryOn5xx: true, retryOnThrow: false }
    );

    const text = await response.text();

    try {
      const data = JSON.parse(text);

      return NextResponse.json({
        success: Boolean(data.success),
        message: data.message || "",
        issueId: data.issueId || "",
        data,
      });
    } catch {
      return NextResponse.json(
        {
          success: false,
          message:
            "Google Script did not return valid JSON while submitting issue.",
          rawResponse: text,
        },
        { status: 500 }
      );
    }
  } catch (error) {
    if (error instanceof AppsScriptFetchError) {
      return NextResponse.json(
        { success: false, message: error.message },
        { status: error.status }
      );
    }
    return NextResponse.json(
      {
        success: false,
        message:
          error instanceof Error
            ? error.message
            : "Unknown error submitting issue.",
      },
      { status: 500 }
    );
  }
}