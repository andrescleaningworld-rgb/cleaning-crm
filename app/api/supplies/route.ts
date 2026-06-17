import { NextRequest, NextResponse } from "next/server";

const GOOGLE_SCRIPT_URL =
  process.env.GOOGLE_SCRIPT_URL || process.env.NEXT_PUBLIC_GOOGLE_SCRIPT_URL;

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

export async function GET(request: NextRequest) {
  try {
    const scriptUrl = getScriptUrl();
    const { searchParams } = new URL(request.url);

    const action = searchParams.get("action") || "getSupplyItemsAdmin";

    const url = new URL(scriptUrl);
    url.searchParams.set("action", action);

    const response = await fetch(url.toString(), {
      cache: "no-store",
    });

    const text = await response.text();

    try {
      const data = JSON.parse(text);
      return NextResponse.json(data, { status: response.status });
    } catch {
      return NextResponse.json(
        {
          success: false,
          error: "Google Script did not return valid JSON while loading supplies.",
          raw: text.slice(0, 500),
        },
        { status: 502 }
      );
    }
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

export async function POST(request: NextRequest) {
  try {
    const scriptUrl = getScriptUrl();
    const body = (await request.json()) as SupplyPostBody;

    const response = await fetch(scriptUrl, {
      method: "POST",
      headers: {
        "Content-Type": "text/plain;charset=utf-8",
      },
      body: JSON.stringify(body),
      cache: "no-store",
    });

    const text = await response.text();

    try {
      const data = JSON.parse(text);
      return NextResponse.json(data, { status: response.status });
    } catch {
      return NextResponse.json(
        {
          success: false,
          error: "Google Script did not return valid JSON while saving supplies.",
          raw: text.slice(0, 500),
        },
        { status: 502 }
      );
    }
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