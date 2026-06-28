import { NextResponse } from "next/server";

const SCRIPT_URL = process.env.GOOGLE_SCRIPT_URL;

export async function GET() {
  try {
    if (!SCRIPT_URL) {
      return NextResponse.json(
        {
          success: false,
          error: "Missing GOOGLE_SCRIPT_URL environment variable.",
        },
        { status: 500 }
      );
    }

    const response = await fetch(`${SCRIPT_URL}?action=getSales`, {
      cache: "no-store",
    });

    const text = await response.text();

    let data;

    try {
      data = JSON.parse(text);
    } catch {
      return NextResponse.json(
        {
          success: false,
          error: "Google Script did not return valid JSON while loading sales.",
          raw: text,
        },
        { status: 500 }
      );
    }

    return NextResponse.json(data, {
      headers: {
        "Cache-Control": "public, max-age=60, stale-while-revalidate=120",
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Unknown error loading sales.",
      },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    if (!SCRIPT_URL) {
      return NextResponse.json(
        {
          success: false,
          error: "Missing GOOGLE_SCRIPT_URL environment variable.",
        },
        { status: 500 }
      );
    }

    const body = await request.json();

    console.log("SALE BODY RECEIVED BY NEXT API:", body);

    const payload = {
      ...body,
      action: "addSale",
    };

    console.log("SALE PAYLOAD SENT TO APPS SCRIPT:", payload);

    const response = await fetch(SCRIPT_URL, {
      method: "POST",
      headers: {
        "Content-Type": "text/plain;charset=utf-8",
      },
      body: JSON.stringify(payload),
    });

    const text = await response.text();

    console.log("APPS SCRIPT RAW SALE RESPONSE:", text);

    let data;

    try {
      data = JSON.parse(text);
    } catch {
      return NextResponse.json(
        {
          success: false,
          error: "Google Script did not return valid JSON while saving sale.",
          debugBodyReceivedByNextApi: body,
          debugPayloadSentToAppsScript: payload,
          raw: text,
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ...data,
      debugBodyReceivedByNextApi: body,
      debugPayloadSentToAppsScript: payload,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Unknown error saving sale.",
      },
      { status: 500 }
    );
  }
}