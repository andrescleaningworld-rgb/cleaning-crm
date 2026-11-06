import { NextResponse } from "next/server";
import { fetchAppsScript, AppsScriptFetchError } from "@/lib/appsScriptFetch";
import { handoffsReady, startHandoff } from "@/lib/pg/handoffs";
import { isPostgres } from "@/lib/dataSource";
import { addAccountUpdate, listAccountUpdates } from "@/lib/pg/account-updates";

const SCRIPT_URL = process.env.GOOGLE_SCRIPT_URL;

// Apps Script latency has been measured spiking to ~14s on a single call;
// this must comfortably exceed the per-attempt timeout in fetchAppsScript
// (18s) plus its one retry plus backoff, or Vercel would kill the function
// before our own retry/error-handling logic gets a chance to run. Matches
// the budget used by /api/accounts and /api/subcontractor-portal for the
// same upstream.
export const maxDuration = 45;

type ScriptResponse = {
  success?: boolean;
  error?: string;
  message?: string;
  id?: string;
  accountUpdates?: unknown[];
};

type AccountUpdateRequestBody = {
  date?: string;
  accountName?: string;
  accountId?: string;
  updateType?: string;
  manager?: string;
  notes?: string;
  notifyEmail?: string;
};

function clean(value: unknown): string {
  return String(value ?? "").trim();
}

export async function GET() {
  try {
    // DATA_SOURCE_ACCOUNT_UPDATES=postgres: the same list, in the same shape,
    // without Apps Script.
    if (isPostgres("ACCOUNT_UPDATES")) {
      return NextResponse.json({ success: true, accountUpdates: await listAccountUpdates() }, { headers: { "Cache-Control": "no-store" } });
    }

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

    let data: ScriptResponse;

    try {
      data = JSON.parse(text) as ScriptResponse;
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
          error: data.error || "Failed to load account updates.",
          rawResponse: data,
        },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        success: true,
        accountUpdates: Array.isArray(data.accountUpdates)
          ? data.accountUpdates
          : [],
      },
      {
        headers: {
          "Cache-Control": "public, max-age=30, stale-while-revalidate=60",
        },
      }
    );
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
    // Account updates are saved in Postgres only (the notice email is sent
    // from here). The old Google Sheets save (Apps Script addAccountUpdate,
    // which sent its own email) was removed on Nov 6, 2026.
    if (!isPostgres("ACCOUNT_UPDATES")) {
      return NextResponse.json(
        { success: false, error: "Account updates can only be saved in the database (DATA_SOURCE_ACCOUNT_UPDATES=postgres). Saving to Google Sheets was removed." },
        { status: 503 }
      );
    }

    const body = (await request.json()) as AccountUpdateRequestBody;

    const payload = {
      action: "addAccountUpdate",
      date: clean(body.date),
      accountName: clean(body.accountName),
      accountId: clean(body.accountId),
      updateType: clean(body.updateType),
      manager: clean(body.manager),
      notes: clean(body.notes),
      notifyEmail: clean(body.notifyEmail),
    };

    if (!payload.accountName && !payload.notes) {
      return NextResponse.json({ success: false, error: "Nothing to save: the update has no account and no notes." }, { status: 400 });
    }
    const saved = await addAccountUpdate(payload);
    const data: ScriptResponse = { success: true, id: saved.id, message: "Account update saved successfully." };

    // The office's "To process" list. Best effort: a failure here never
    // fails the update itself (it is already saved above).
    let handoffId = "";
    try {
      if (await handoffsReady()) {
        handoffId = data.id || `u-${crypto.randomUUID()}`;
        await startHandoff({
          kind: "update",
          itemId: handoffId,
          title: payload.accountName || "Account update",
          accountId: payload.accountId,
          accountName: payload.accountName,
          manager: payload.manager,
          step: "to-process",
          data: { updateType: payload.updateType, notes: payload.notes, date: payload.date },
          createdBy: payload.manager,
        });
      }
    } catch (err) {
      console.error("[account-updates] handoff start failed:", err instanceof Error ? err.message : err);
    }

    return NextResponse.json({
      success: true,
      id: data.id || "",
      handoffId,
      message: data.message || "Account update saved successfully.",
      sentPayload: payload,
      scriptResponse: data,
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
            : "Unknown error saving account update.",
      },
      { status: 500 }
    );
  }
}