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

export async function GET() {
  if (!GOOGLE_SCRIPT_URL) {
    return NextResponse.json(
      {
        success: false,
        message: "GOOGLE_SCRIPT_URL is missing.",
        issues: [],
        newCount: 0,
      },
      { status: 500 }
    );
  }

  let response: Response;
  try {
    // Read-only action — safe to retry after a throw (timeout/network
    // failure), unlike the write actions in POST below.
    response = await fetchAppsScript(
      `${GOOGLE_SCRIPT_URL}?action=getSubPortalIssues`,
      { cache: "no-store" },
      undefined,
      { retryOn5xx: true, retryOnThrow: true }
    );
  } catch (error) {
    if (error instanceof AppsScriptFetchError) {
      console.error("[notifications] Apps Script call failed:", error.message);
      return NextResponse.json(
        {
          success: false,
          message: error.message,
          issues: [],
          newCount: 0,
        },
        { status: error.status }
      );
    }
    console.error(
      "[notifications] unexpected error contacting Apps Script:",
      error instanceof Error ? error.message : error
    );
    return NextResponse.json(
      {
        success: false,
        message:
          error instanceof Error
            ? error.message
            : "Unknown error loading notifications.",
        issues: [],
        newCount: 0,
      },
      { status: 500 }
    );
  }

  const text = await response.text();

  try {
    const data = JSON.parse(text);

    return NextResponse.json(
      {
        success: Boolean(data.success),
        message: data.message || "",
        issues: Array.isArray(data.issues) ? data.issues : [],
        newCount: Number(data.newCount || 0),
      },
      {
        headers: {
          "Cache-Control": "public, max-age=15, stale-while-revalidate=30",
        },
      }
    );
  } catch {
    console.error(
      `[notifications] Apps Script did not return valid JSON (status=${response.status}):`,
      text.slice(0, 500)
    );
    return NextResponse.json(
      {
        success: false,
        message: "Google Script did not return valid JSON for notifications.",
        rawResponse: text,
        issues: [],
        newCount: 0,
      },
      { status: 500 }
    );
  }
}

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

  let body: { action?: string; issue?: unknown; [key: string]: unknown };
  try {
    body = await request.json();
  } catch (error) {
    console.error(
      "[notifications] request body was not valid JSON:",
      error instanceof Error ? error.message : error
    );
    return NextResponse.json(
      { success: false, message: "Request body was not valid JSON." },
      { status: 400 }
    );
  }

  const action = body.action || "updateSubPortalIssueStatus";

  let response: Response;
  try {
    response = await fetchAppsScript(
      GOOGLE_SCRIPT_URL,
      {
        method: "POST",
        headers: {
          "Content-Type": "text/plain;charset=utf-8",
        },
        body: JSON.stringify({
          action,
          issue: body.issue || body,
        }),
      },
      undefined,
      {
        retryOn5xx: true,
        // updateSubPortalIssueStatus is an update-by-id (status change on an
        // existing issue) — the only action this route's own caller
        // (app/notifications/page.tsx) ever sends, so safe to retry after a
        // throw. Any other caller-supplied action isn't confirmed idempotent.
        retryOnThrow: action === "updateSubPortalIssueStatus",
      }
    );
  } catch (error) {
    if (error instanceof AppsScriptFetchError) {
      console.error("[notifications] Apps Script update call failed:", error.message);
      return NextResponse.json(
        { success: false, message: error.message },
        { status: error.status }
      );
    }
    console.error(
      "[notifications] unexpected error updating notification:",
      error instanceof Error ? error.message : error
    );
    return NextResponse.json(
      {
        success: false,
        message:
          error instanceof Error
            ? error.message
            : "Unknown error updating notification.",
      },
      { status: 500 }
    );
  }

  const text = await response.text();

  try {
    const data = JSON.parse(text);

    return NextResponse.json({
      success: Boolean(data.success),
      message: data.message || "",
      issueId: data.issueId || "",
      rowNumber: data.rowNumber || "",
      status: data.status || "",
      data,
    });
  } catch {
    console.error(
      `[notifications] Apps Script did not return valid JSON on update (status=${response.status}):`,
      text.slice(0, 500)
    );
    return NextResponse.json(
      {
        success: false,
        message:
          "Google Script did not return valid JSON while updating notification.",
        rawResponse: text,
      },
      { status: 500 }
    );
  }
}
