import { NextRequest, NextResponse } from "next/server";

const SCRIPT_URL =
  process.env.GOOGLE_SCRIPT_URL || process.env.NEXT_PUBLIC_GOOGLE_SCRIPT_URL;

type SupplyOrder = {
  rowNumber?: number;
  timestamp?: string;
  orderId?: string;
  orderGroupId?: string;
  subcontractor?: string;
  subcontractorEmail?: string;
  accountName?: string;
  accountId?: string;
  supplyItem?: string;
  category?: string;
  description?: string;
  itemDescription?: string;
  quantity?: string;
  unit?: string;
  deliveryMode?: string;
  status?: string;
  notes?: string;
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
  [key: string]: string | number | boolean | null | undefined;
};

function getScriptUrl() {
  if (!SCRIPT_URL) {
    throw new Error(
      "Missing GOOGLE_SCRIPT_URL or NEXT_PUBLIC_GOOGLE_SCRIPT_URL in .env.local"
    );
  }

  return SCRIPT_URL;
}

export async function GET() {
  try {
    const scriptUrl = getScriptUrl();
    const url = `${scriptUrl}?action=getSupplyOrders`;

    const response = await fetch(url, {
      method: "GET",
      cache: "no-store",
    });

    const text = await response.text();

    let data: ScriptResponse;

    try {
      data = JSON.parse(text) as ScriptResponse;
    } catch {
      return NextResponse.json(
        {
          success: false,
          error: "Google Script did not return valid JSON for supply orders.",
          rawResponse: text,
        },
        { status: 500 }
      );
    }

    if (!response.ok || data.success === false) {
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

    const supplyOrders = data.supplyOrders || data.orders || data.data || [];

    return NextResponse.json({
      success: true,
      count: supplyOrders.length,
      supplyOrders,
      orders: supplyOrders,
    });
  } catch (error) {
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

    const action = body.action || "updateSupplyOrderStatus";

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

    const text = await response.text();

    try {
      const data = JSON.parse(text);

      return NextResponse.json(data, {
        status: response.ok ? 200 : 500,
      });
    } catch {
      return NextResponse.json(
        {
          success: false,
          error:
            "Google Script did not return valid JSON while updating supply order.",
          rawResponse: text,
        },
        { status: 500 }
      );
    }
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Unknown supply order update error.",
      },
      { status: 500 }
    );
  }
}