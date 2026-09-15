import { NextRequest, NextResponse } from "next/server";
import { fetchAppsScript, AppsScriptFetchError } from "@/lib/appsScriptFetch";

const GOOGLE_SCRIPT_URL =
  process.env.GOOGLE_SCRIPT_URL || process.env.NEXT_PUBLIC_GOOGLE_SCRIPT_URL;

// Apps Script latency has been measured spiking to ~14s on a single call;
// this must comfortably exceed the per-attempt timeout in fetchAppsScript
// (18s) plus its one retry plus backoff, or Vercel would kill the function
// before our own retry/error-handling logic gets a chance to run. Matches
// the budget used by /api/accounts and /api/subcontractor-portal for the
// same upstream.
export const maxDuration = 45;

type SupplyItem = {
  rowNumber?: number;
  itemId?: string;
  id?: string;
  itemName?: string;
  supplyItem?: string;
  name?: string;
  description?: string;
  itemDescription?: string;
  category?: string;
  unit?: string;
  currentStock?: string | number;
  minimumStock?: string | number;
  status?: string;
  notes?: string;
  [key: string]: unknown;
};

type ScriptSupplyResponse = {
  success?: boolean;
  error?: string;
  message?: string;
  count?: number;
  data?: SupplyItem[];
  supplies?: SupplyItem[];
  supplyItems?: SupplyItem[];
  items?: SupplyItem[];
  categories?: string[];
};

type SupplyPostBody = {
  action?: string;
  [key: string]: string | number | boolean | null | undefined;
};

function getScriptUrl() {
  if (!GOOGLE_SCRIPT_URL) {
    throw new Error("Missing GOOGLE_SCRIPT_URL environment variable.");
  }

  return GOOGLE_SCRIPT_URL;
}

function cleanText(value: unknown): string {
  return String(value ?? "").trim();
}

function normalizeSupplyItem(item: SupplyItem): SupplyItem {
  const itemName =
    cleanText(item.itemName) ||
    cleanText(item.supplyItem) ||
    cleanText(item.name) ||
    cleanText(item["Item Name"]) ||
    cleanText(item["Supply Item"]) ||
    cleanText(item["Name"]);

  const description =
    cleanText(item.description) ||
    cleanText(item.itemDescription) ||
    cleanText(item["Description"]) ||
    cleanText(item["Item Description"]);

  const category =
    cleanText(item.category) ||
    cleanText(item["Category"]);

  const unit =
    cleanText(item.unit) ||
    cleanText(item["Unit"]);

  const status =
    cleanText(item.status) ||
    cleanText(item["Status"]) ||
    "Active";

  return {
    ...item,
    itemName,
    supplyItem: itemName,
    name: itemName,
    description,
    itemDescription: description,
    category,
    unit,
    status,
  };
}

function getSupplyItemsFromResponse(data: ScriptSupplyResponse): SupplyItem[] {
  if (Array.isArray(data.supplies)) return data.supplies;
  if (Array.isArray(data.supplyItems)) return data.supplyItems;
  if (Array.isArray(data.items)) return data.items;
  if (Array.isArray(data.data)) return data.data;

  return [];
}

function getCategories(items: SupplyItem[], data: ScriptSupplyResponse) {
  const fromScript = Array.isArray(data.categories) ? data.categories : [];

  const fromItems = items
    .map((item) => cleanText(item.category))
    .filter(Boolean);

  return Array.from(new Set([...fromScript, ...fromItems])).sort((a, b) =>
    a.localeCompare(b)
  );
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

async function fetchSuppliesWithAction(scriptUrl: string, action: string) {
  const url = new URL(scriptUrl);
  url.searchParams.set("action", action);

  // Read-only action — safe to retry after a throw (timeout/network
  // failure).
  const response = await fetchAppsScript(
    url.toString(),
    { cache: "no-store" },
    undefined,
    { retryOn5xx: true, retryOnThrow: true }
  );

  const parsed = await readScriptJson(response);

  return {
    action,
    response,
    parsed,
  };
}

export async function GET(request: NextRequest) {
  try {
    const scriptUrl = getScriptUrl();
    const { searchParams } = new URL(request.url);

    const requestedAction = searchParams.get("action") || "";

    const actionsToTry = requestedAction
      ? [
          requestedAction,
          "getSupplyItemsAdmin",
          "getSupplyItems",
          "getSupplies",
          "supplies",
        ]
      : [
          "getSupplyItemsAdmin",
          "getSupplyItems",
          "getSupplies",
          "supplies",
        ];

    const uniqueActionsToTry = Array.from(new Set(actionsToTry));

    const attempts: {
      action: string;
      success: boolean;
      error?: string;
      raw?: string;
      count?: number;
    }[] = [];

    for (const action of uniqueActionsToTry) {
      const result = await fetchSuppliesWithAction(scriptUrl, action);

      if (!result.parsed.isJson) {
        attempts.push({
          action,
          success: false,
          error: "Google Script did not return JSON.",
          raw: result.parsed.rawText.slice(0, 250),
        });
        continue;
      }

      const data = result.parsed.data as ScriptSupplyResponse;

      if (!result.response.ok || data.success === false) {
        attempts.push({
          action,
          success: false,
          error: data.error || data.message || "Action failed.",
        });
        continue;
      }

      const rawItems = getSupplyItemsFromResponse(data);
      const normalizedItems = rawItems.map(normalizeSupplyItem);
      const categories = getCategories(normalizedItems, data);

      if (normalizedItems.length > 0 || categories.length > 0) {
        return NextResponse.json({
          success: true,
          actionUsed: action,
          count: normalizedItems.length,
          supplies: normalizedItems,
          supplyItems: normalizedItems,
          items: normalizedItems,
          data: normalizedItems,
          categories,
        });
      }

      attempts.push({
        action,
        success: true,
        error: "Action returned JSON but no supply items/categories.",
        count: 0,
      });
    }

    return NextResponse.json(
      {
        success: false,
        error:
          "No supply action returned supply items or categories from Google Script.",
        attempts,
        supplies: [],
        supplyItems: [],
        items: [],
        data: [],
        categories: [],
      },
      { status: 500 }
    );
  } catch (error) {
    if (error instanceof AppsScriptFetchError) {
      return NextResponse.json(
        {
          success: false,
          error: error.message,
          supplies: [],
          supplyItems: [],
          items: [],
          data: [],
          categories: [],
        },
        { status: error.status }
      );
    }
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error.",
        supplies: [],
        supplyItems: [],
        items: [],
        data: [],
        categories: [],
      },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const scriptUrl = getScriptUrl();
    const body = (await request.json()) as SupplyPostBody;

    const action = body.action || "saveSupplyItem";

    // The Apps Script's updateSupplyItem and deactivateSupplyItem handlers
    // both expect the supply's fields nested under an "item" key. Every
    // other action on this route sends its fields flat, and that's what
    // these two were doing as well — their row lookup then failed every
    // time with "Could not find supply item to update/remove," even with a
    // correct rowNumber/supplyId, because the handler never finds any of
    // the flat fields it's looking for. Confirmed directly against the
    // live backend: identical flat payload fails, wrapping it under `item`
    // succeeds, for both actions.
    const NESTED_ITEM_ACTIONS = new Set([
      "updateSupplyItem",
      "deactivateSupplyItem",
    ]);
    const { action: _omit, ...itemFields } = body;
    const payload = NESTED_ITEM_ACTIONS.has(action)
      ? { action, item: itemFields }
      : { ...body, action };

    // This action is caller-supplied and mixed (add/update/deactivate) — a
    // 5xx means the Apps Script explicitly rejected the request (safe to
    // retry, nothing was written), but a thrown error (timeout/network
    // failure) is ambiguous, so it's not retried here to avoid risking a
    // duplicate write for a non-idempotent action like saveSupplyItem.
    const response = await fetchAppsScript(
      scriptUrl,
      {
        method: "POST",
        headers: {
          "Content-Type": "text/plain;charset=utf-8",
        },
        body: JSON.stringify(payload),
        cache: "no-store",
      },
      undefined,
      { retryOn5xx: true, retryOnThrow: false }
    );

    const parsed = await readScriptJson(response);

    if (!parsed.isJson) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Google Script did not return valid JSON while saving supplies.",
          raw: parsed.rawText.slice(0, 500),
        },
        { status: 502 }
      );
    }

    const data = parsed.data as {
      success?: boolean;
      error?: string;
      message?: string;
    };

    if (!response.ok || data.success === false) {
      return NextResponse.json(
        {
          success: false,
          error: data.error || data.message || "Failed to save supply item.",
        },
        { status: 500 }
      );
    }

    return NextResponse.json(data, { status: 200 });
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
        error: error instanceof Error ? error.message : "Unknown error.",
      },
      { status: 500 }
    );
  }
}