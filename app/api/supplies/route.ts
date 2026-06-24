import { NextRequest, NextResponse } from "next/server";

const GOOGLE_SCRIPT_URL =
  process.env.GOOGLE_SCRIPT_URL || process.env.NEXT_PUBLIC_GOOGLE_SCRIPT_URL;

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
    cleanText(item.name);

  const description =
    cleanText(item.description) || cleanText(item.itemDescription);

  return {
    ...item,
    itemName,
    supplyItem: itemName,
    name: itemName,
    description,
    itemDescription: description,
    category: cleanText(item.category),
    unit: cleanText(item.unit),
    status: cleanText(item.status) || "Active",
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

export async function GET(request: NextRequest) {
  try {
    const scriptUrl = getScriptUrl();
    const { searchParams } = new URL(request.url);

    /*
      Default stays admin-friendly, but this route now normalizes the result
      so subcontractor portal can also read categories/items/descriptions.
    */
    const action = searchParams.get("action") || "getSupplyItemsAdmin";

    const url = new URL(scriptUrl);
    url.searchParams.set("action", action);

    const response = await fetch(url.toString(), {
      cache: "no-store",
    });

    const parsed = await readScriptJson(response);

    if (!parsed.isJson) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Google Script did not return valid JSON while loading supplies.",
          raw: parsed.rawText.slice(0, 500),
          supplies: [],
          supplyItems: [],
          items: [],
          categories: [],
        },
        { status: 502 }
      );
    }

    const data = parsed.data as ScriptSupplyResponse;

    if (!response.ok || data.success === false) {
      return NextResponse.json(
        {
          success: false,
          error: data.error || data.message || "Failed to load supplies.",
          supplies: [],
          supplyItems: [],
          items: [],
          categories: [],
        },
        { status: 500 }
      );
    }

    const rawItems = getSupplyItemsFromResponse(data);
    const normalizedItems = rawItems.map(normalizeSupplyItem);
    const categories = getCategories(normalizedItems, data);

    return NextResponse.json({
      success: true,
      count: normalizedItems.length,

      // Give every page the field name it may be expecting
      supplies: normalizedItems,
      supplyItems: normalizedItems,
      items: normalizedItems,
      data: normalizedItems,

      categories,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error.",
        supplies: [],
        supplyItems: [],
        items: [],
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

    const response = await fetch(scriptUrl, {
      method: "POST",
      headers: {
        "Content-Type": "text/plain;charset=utf-8",
      },
      body: JSON.stringify({
        ...body,
        action,
      }),
      cache: "no-store",
    });

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

    const data = parsed.data;

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
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error.",
      },
      { status: 500 }
    );
  }
}