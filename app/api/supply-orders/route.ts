import { NextRequest, NextResponse } from "next/server";
import { fetchAppsScript, AppsScriptFetchError } from "@/lib/appsScriptFetch";

const SCRIPT_URL =
  process.env.GOOGLE_SCRIPT_URL || process.env.NEXT_PUBLIC_GOOGLE_SCRIPT_URL;

// Apps Script latency has been measured spiking to ~14s on a single call;
// this must comfortably exceed the per-attempt timeout in fetchAppsScript
// (18s) plus its one retry plus backoff, or Vercel would kill the function
// before our own retry/error-handling logic gets a chance to run. Matches
// the budget used by /api/accounts and /api/subcontractor-portal for the
// same upstream.
export const maxDuration = 45;

type SupplyOrder = {
  rowNumber?: number;
  timestamp?: string;
  orderId?: string;
  orderGroupId?: string;
  requestedBy?: string;
  userRole?: string;
  subcontractor?: string;
  subcontractorEmail?: string;
  accountName?: string;
  accountId?: string;
  supplyItem?: string;
  itemName?: string;
  category?: string;
  description?: string;
  itemDescription?: string;
  quantity?: string;
  unit?: string;
  deliveryMode?: string;
  status?: string;
  notes?: string;
  emailStatus?: string;
  emailSentTo?: string;
  lastUpdated?: string;
};

type ScriptResponse = {
  success?: boolean;
  error?: string;
  message?: string;
  count?: number;
  data?: SupplyOrder[];
  supplyOrders?: SupplyOrder[];
  orders?: SupplyOrder[];
};

type SupplyOrderPostBody = {
  action?: string;
  rowNumber?: number;
  orderId?: string;
  id?: string;
  status?: string;
  orderStatus?: string;

  requestedBy?: string;
  userRole?: string;
  subcontractor?: string;
  subcontractorEmail?: string;
  accountName?: string;
  accountId?: string;
  supplyItem?: string;
  itemName?: string;
  category?: string;
  description?: string;
  itemDescription?: string;
  quantity?: string;
  unit?: string;
  deliveryMode?: string;
  notes?: string;

  orders?: SupplyOrder[];
  items?: SupplyOrder[];

  [key: string]:
    | string
    | number
    | boolean
    | null
    | undefined
    | SupplyOrder[];
};

function getScriptUrl() {
  if (!SCRIPT_URL) {
    throw new Error(
      "Missing GOOGLE_SCRIPT_URL or NEXT_PUBLIC_GOOGLE_SCRIPT_URL in .env.local"
    );
  }

  return SCRIPT_URL;
}

function getOrdersFromResponse(data: ScriptResponse): SupplyOrder[] {
  if (Array.isArray(data.supplyOrders)) return data.supplyOrders;
  if (Array.isArray(data.orders)) return data.orders;
  if (Array.isArray(data.data)) return data.data;

  return [];
}

async function readScriptJson(response: Response) {
  const text = await response.text();

  try {
    return {
      data: JSON.parse(text),
      rawText: text,
      isJson: true,
    };
  } catch {
    return {
      data: null,
      rawText: text,
      isJson: false,
    };
  }
}

export async function GET() {
  try {
    const scriptUrl = getScriptUrl();
    const url = `${scriptUrl}?action=getSupplyOrders`;

    let response: Response;
    try {
      // Read-only action — safe to retry after a throw (timeout/network
      // failure), unlike createSupplyOrder in POST below.
      response = await fetchAppsScript(
        url,
        { method: "GET", cache: "no-store" },
        undefined,
        { retryOn5xx: true, retryOnThrow: true }
      );
    } catch (error) {
      if (error instanceof AppsScriptFetchError) {
        console.error("[supply-orders] Apps Script call failed:", error.message);
        return NextResponse.json(
          {
            success: false,
            error: error.message,
            supplyOrders: [],
            orders: [],
          },
          { status: error.status }
        );
      }
      throw error;
    }

    const parsed = await readScriptJson(response);

    if (!parsed.isJson) {
      console.error(
        `[supply-orders] Apps Script did not return valid JSON (status=${response.status}):`,
        parsed.rawText.slice(0, 500)
      );
      return NextResponse.json(
        {
          success: false,
          error: "Google Script did not return valid JSON for supply orders.",
          rawResponse: parsed.rawText,
          supplyOrders: [],
          orders: [],
        },
        { status: 500 }
      );
    }

    const data = parsed.data as ScriptResponse;

    if (!response.ok || data.success === false) {
      console.error(
        `[supply-orders] Apps Script returned a failure (status=${response.status}):`,
        data.error || data.message || data
      );
      return NextResponse.json(
        {
          success: false,
          error: data.error || data.message || "Failed to load supply orders.",
          supplyOrders: [],
          orders: [],
        },
        { status: 500 }
      );
    }

    const supplyOrders = getOrdersFromResponse(data);

    return NextResponse.json(
      {
        success: true,
        count: supplyOrders.length,
        supplyOrders,
        orders: supplyOrders,
      },
      {
        headers: {
          "Cache-Control": "public, max-age=30, stale-while-revalidate=60",
        },
      }
    );
  } catch (error) {
    console.error(
      "[supply-orders] unexpected error loading supply orders:",
      error instanceof Error ? error.message : error
    );
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Unknown supply orders API error.",
        supplyOrders: [],
        orders: [],
      },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const scriptUrl = getScriptUrl();
    const body = (await request.json()) as SupplyOrderPostBody;

    /*
      Important:
      - Admin status dropdown sends action: updateSupplyOrderStatus
      - Subcontractor new supply order should send action: createSupplyOrder
      - If no action is passed, we assume it is a new supply order, not a status update.
    */
    const action = body.action || "createSupplyOrder";

    let response: Response;
    try {
      response = await fetchAppsScript(
        scriptUrl,
        {
          method: "POST",
          headers: {
            "Content-Type": "text/plain;charset=utf-8",
          },
          body: JSON.stringify({
            ...body,
            action,
          }),
          cache: "no-store",
        },
        undefined,
        {
          retryOn5xx: true,
          // updateSupplyOrderStatus is an update-by-id (status change on an
          // existing order) — safe to retry after a throw, same reasoning
          // app/api/accounts/route.ts applies to updateAccount. Any other
          // action (createSupplyOrder appends a new row) isn't confirmed
          // idempotent, so it isn't retried.
          retryOnThrow: action === "updateSupplyOrderStatus",
        }
      );
    } catch (error) {
      if (error instanceof AppsScriptFetchError) {
        console.error(
          `[supply-orders] Apps Script ${action} call failed:`,
          error.message
        );
        return NextResponse.json(
          { success: false, error: error.message },
          { status: error.status }
        );
      }
      throw error;
    }

    const parsed = await readScriptJson(response);

    if (!parsed.isJson) {
      console.error(
        `[supply-orders] Apps Script did not return valid JSON for ${action} (status=${response.status}):`,
        parsed.rawText.slice(0, 500)
      );
      return NextResponse.json(
        {
          success: false,
          error:
            action === "updateSupplyOrderStatus"
              ? "Google Script did not return valid JSON while updating supply order."
              : "Google Script did not return valid JSON while creating supply order.",
          rawResponse: parsed.rawText,
        },
        { status: 500 }
      );
    }

    const data = parsed.data;

    if (!response.ok || data.success === false) {
      console.error(
        `[supply-orders] Apps Script rejected ${action} (status=${response.status}):`,
        data.error || data.message || data
      );
      return NextResponse.json(
        {
          success: false,
          error:
            data.error ||
            data.message ||
            (action === "updateSupplyOrderStatus"
              ? "Failed to update supply order."
              : "Failed to create supply order."),
          rawResponse: parsed.rawText,
        },
        { status: 500 }
      );
    }

    return NextResponse.json(data, {
      status: 200,
    });
  } catch (error) {
    console.error(
      "[supply-orders] unexpected error in POST:",
      error instanceof Error ? error.message : error
    );
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Unknown supply order API error.",
      },
      { status: 500 }
    );
  }
}