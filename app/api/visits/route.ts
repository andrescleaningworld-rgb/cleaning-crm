import { NextResponse } from "next/server";
import { fetchAppsScript, AppsScriptFetchError } from "@/lib/appsScriptFetch";
import { addVisit, getVisitsAppsScriptShape, visitsOnPostgres } from "@/lib/data/visits";

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
  visits?: unknown[];
  data?: unknown[];
};

type VisitRequestBody = {
  accountId?: string;
  accountName?: string;
  date?: string;
  visitType?: string;
  manager?: string;
  completedBy?: string;
  subcontractor?: string;
  condition?: string;
  followUpNeeded?: string;
  followUpDate?: string;
  notes?: string;
};

function clean(value: unknown): string {
  return String(value ?? "").trim();
}

const LIST_HEADERS = { "Cache-Control": "public, max-age=30, stale-while-revalidate=60" };

export async function GET() {
  try {
    // DATA_SOURCE_VISITS=postgres: the same list, in the same shape, without
    // Apps Script.
    if (visitsOnPostgres()) {
      return NextResponse.json({ success: true, visits: await getVisitsAppsScriptShape() }, { headers: LIST_HEADERS });
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

    let response: Response;
    try {
      // Read-only action — safe to retry after a throw (timeout/network
      // failure), unlike addVisit in POST below.
      response = await fetchAppsScript(
        `${SCRIPT_URL}?action=getVisits`,
        { method: "GET", cache: "no-store" },
        undefined,
        { retryOn5xx: true, retryOnThrow: true }
      );
    } catch (error) {
      if (error instanceof AppsScriptFetchError) {
        console.error("[visits] Apps Script call failed:", error.message);
        return NextResponse.json(
          { success: false, error: error.message },
          { status: error.status }
        );
      }
      throw error;
    }

    const text = await response.text();

    let data: ScriptResponse;

    try {
      data = JSON.parse(text) as ScriptResponse;
    } catch {
      console.error(
        `[visits] Apps Script did not return valid JSON (status=${response.status}):`,
        text.slice(0, 500)
      );
      return NextResponse.json(
        {
          success: false,
          error: "Google Script did not return valid JSON while loading visits.",
          rawResponse: text,
        },
        { status: 500 }
      );
    }

    if (!response.ok || data.success === false) {
      console.error(
        `[visits] Apps Script returned a failure (status=${response.status}):`,
        data.error || data
      );
      return NextResponse.json(
        {
          success: false,
          error: data.error || "Failed to load visits from Google Script.",
          rawResponse: data,
        },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        success: true,
        visits: Array.isArray(data.visits)
          ? data.visits
          : Array.isArray(data.data)
            ? data.data
            : [],
      },
      { headers: LIST_HEADERS }
    );
  } catch (error) {
    console.error(
      "[visits] unexpected error loading visits:",
      error instanceof Error ? error.message : error
    );
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Unknown error loading visits.",
      },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    if (!visitsOnPostgres() && !SCRIPT_URL) {
      return NextResponse.json(
        {
          success: false,
          error: "Missing GOOGLE_SCRIPT_URL in .env.local",
        },
        { status: 500 }
      );
    }

    const body = (await request.json()) as VisitRequestBody;

    const payload = {
      action: "addVisit",

      accountId: clean(body.accountId),
      accountName: clean(body.accountName),

      date: clean(body.date),
      visitDate: clean(body.date),

      visitType: clean(body.visitType),

      manager: clean(body.manager),
      completedBy: clean(body.manager || body.completedBy),

      subcontractor: clean(body.subcontractor),

      condition: clean(body.condition),
      conditionScore: clean(body.condition),

      followUpNeeded: clean(body.followUpNeeded),
      followUpDate: clean(body.followUpDate),

      notes: clean(body.notes),
    };

    console.log("Saving visit payload:", payload);

    // DATA_SOURCE_VISITS=postgres: saved directly, same answer shape.
    if (visitsOnPostgres()) {
      const saved = await addVisit({
        accountName: payload.accountName,
        visitDate: payload.visitDate,
        visitType: payload.visitType,
        completedBy: payload.completedBy,
        condition: payload.conditionScore,
        followUpNeeded: payload.followUpNeeded,
        followUpDate: payload.followUpDate,
        notes: payload.notes,
      });
      return NextResponse.json({
        success: true,
        id: saved.id,
        message: "Visit saved successfully.",
        sentPayload: payload,
        scriptResponse: { success: true, id: saved.id },
      });
    }

    if (!SCRIPT_URL) throw new Error("Missing GOOGLE_SCRIPT_URL in .env.local");

    let response: Response;
    try {
      response = await fetchAppsScript(
        SCRIPT_URL,
        {
          method: "POST",
          headers: {
            "Content-Type": "text/plain;charset=utf-8",
          },
          body: JSON.stringify(payload),
          cache: "no-store",
        },
        undefined,
        {
          retryOn5xx: true,
          // addVisit's Apps Script handler isn't in this repo to confirm it
          // upserts rather than appending a row — same reasoning
          // app/api/accounts/route.ts uses to withhold retryOnThrow from
          // addAccount. A blind retry on an ambiguous timeout risks a
          // duplicate visit row.
          retryOnThrow: false,
        }
      );
    } catch (error) {
      if (error instanceof AppsScriptFetchError) {
        console.error(
          "[visits] Apps Script addVisit call failed:",
          error.message,
          "payload:",
          payload
        );
        return NextResponse.json(
          { success: false, error: error.message, sentPayload: payload },
          { status: error.status }
        );
      }
      throw error;
    }

    const text = await response.text();

    let data: ScriptResponse;

    try {
      data = JSON.parse(text) as ScriptResponse;
    } catch {
      console.error(
        `[visits] Apps Script did not return valid JSON on save (status=${response.status}):`,
        text.slice(0, 500)
      );
      return NextResponse.json(
        {
          success: false,
          error: "Google Script did not return valid JSON while saving visit.",
          sentPayload: payload,
          rawResponse: text,
        },
        { status: 500 }
      );
    }

    if (!response.ok || data.success === false) {
      console.error(
        `[visits] Apps Script rejected addVisit (status=${response.status}):`,
        data.error || data
      );
      return NextResponse.json(
        {
          success: false,
          error: data.error || "Failed to save visit to Google Script.",
          sentPayload: payload,
          rawResponse: data,
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      id: data.id || "",
      message: data.message || "Visit saved successfully.",
      sentPayload: payload,
      scriptResponse: data,
    });
  } catch (error) {
    console.error(
      "[visits] unexpected error saving visit:",
      error instanceof Error ? error.message : error
    );
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Unknown error saving visit.",
      },
      { status: 500 }
    );
  }
}