import { NextRequest, NextResponse } from "next/server";
import { fetchAppsScript, AppsScriptFetchError } from "@/lib/appsScriptFetch";
import { getSubPortalIssuesShape, subPortalOnPostgres, updateSubPortalIssueStatus } from "@/lib/data/sub-portal";
import { getOrFetch } from "@/lib/serverCache";

const GOOGLE_SCRIPT_URL = process.env.GOOGLE_SCRIPT_URL;

// CWHeader polls this from every open admin tab every 60s (see
// app/components/CWHeader.tsx), uncached, straight through to the shared
// Apps Script backend — by far the single highest-volume caller of that
// backend (338 timeout errors over 7 days vs. 28-85 for pages people
// actually navigate to, per production runtime-error data). A short TTL
// well under the poll interval keeps the badge reasonably fresh while
// collapsing concurrent/duplicate polls (multiple tabs, multiple admins)
// into far fewer real upstream calls, reducing load on a backend that's
// already timing out regularly on its own.
const NOTIFICATIONS_CACHE_TTL_MS = 30_000;

// Apps Script latency has been measured spiking to ~14s on a single call;
// this must comfortably exceed the per-attempt timeout in fetchAppsScript
// (18s) plus its one retry plus backoff, or Vercel would kill the function
// before our own retry/error-handling logic gets a chance to run. Matches
// the budget used by /api/accounts and /api/subcontractor-portal for the
// same upstream.
export const maxDuration = 45;

type NotificationsPayload = {
  success: boolean;
  message: string;
  issues: unknown[];
  newCount: number;
};

async function fetchNotificationsFromAppsScript(): Promise<NotificationsPayload> {
  // DATA_SOURCE_SUB_PORTAL=postgres: the same answer, without Apps Script.
  if (subPortalOnPostgres()) {
    const { issues, newCount, message } = await getSubPortalIssuesShape();
    return { success: true, message, issues, newCount };
  }

  // Read-only action — safe to retry after a throw (timeout/network
  // failure), unlike the write actions in POST below.
  const response = await fetchAppsScript(
    `${GOOGLE_SCRIPT_URL}?action=getSubPortalIssues`,
    { cache: "no-store" },
    undefined,
    { retryOn5xx: true, retryOnThrow: true }
  );

  const text = await response.text();
  let data: { success?: boolean; message?: string; issues?: unknown[]; newCount?: number };
  try {
    data = JSON.parse(text);
  } catch {
    console.error(
      `[notifications] Apps Script did not return valid JSON (status=${response.status}):`,
      text.slice(0, 500)
    );
    throw new Error("Google Script did not return valid JSON for notifications.");
  }

  return {
    success: Boolean(data.success),
    message: data.message || "",
    issues: Array.isArray(data.issues) ? data.issues : [],
    newCount: Number(data.newCount || 0),
  };
}

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

  try {
    const payload = await getOrFetch(
      "notifications:getSubPortalIssues",
      fetchNotificationsFromAppsScript,
      NOTIFICATIONS_CACHE_TTL_MS
    );

    return NextResponse.json(payload, {
      headers: {
        "Cache-Control": "public, max-age=15, stale-while-revalidate=30",
      },
    });
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
}

export async function POST(request: NextRequest) {
  // Saved in Postgres only. The old Google Sheets save (Apps Script
  // updateSubPortalIssueStatus) was removed on Nov 6, 2026.
  if (!subPortalOnPostgres()) {
    return NextResponse.json(
      { success: false, message: "Issues can only be saved in the database (DATA_SOURCE_SUB_PORTAL=postgres). Saving to Google Sheets was removed." },
      { status: 503 }
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

  {
    if (action !== "updateSubPortalIssueStatus") {
      return NextResponse.json({ success: false, message: `Unknown notifications action: ${action}` }, { status: 400 });
    }
    try {
      const sent = (body.issue || body) as Record<string, unknown>;
      const updated = await updateSubPortalIssueStatus(sent);
      return NextResponse.json({
        success: true,
        message: "Issue updated.",
        issueId: updated.issueId,
        rowNumber: sent.rowNumber || "",
        status: updated.status,
        data: { success: true, ...updated },
      });
    } catch (error) {
      return NextResponse.json(
        { success: false, message: error instanceof Error ? error.message : "Unknown error updating notification." },
        { status: 500 }
      );
    }
  }
}
