import { NextResponse } from "next/server";

const SCRIPT_URL =
  process.env.GOOGLE_SCRIPT_URL || process.env.NEXT_PUBLIC_GOOGLE_SCRIPT_URL;

type ScriptResponse = {
  success?: boolean;
  message?: string;
  error?: string;
  subcontractor?: unknown;
  accounts?: unknown[];
  supplyItems?: unknown[];
  orderId?: string;
  id?: string;
};

export async function POST(request: Request) {
  try {
    if (!SCRIPT_URL) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Missing GOOGLE_SCRIPT_URL or NEXT_PUBLIC_GOOGLE_SCRIPT_URL in .env.local",
        },
        { status: 500 }
      );
    }

    const body = await request.json();

    const response = await fetch(SCRIPT_URL, {
      method: "POST",
      headers: {
        "Content-Type": "text/plain;charset=utf-8",
      },
      body: JSON.stringify(body),
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
          error:
            "Google Script did not return valid JSON for subcontractor portal.",
          rawResponse: text,
        },
        { status: 500 }
      );
    }

    if (!response.ok || data.success === false) {
      return NextResponse.json(
        {
          success: false,
          error:
            data.error ||
            data.message ||
            "Failed to complete subcontractor portal request.",
          message: data.message || "",
          subcontractor: data.subcontractor || null,
          accounts: data.accounts || [],
          supplyItems: data.supplyItems || [],
          orderId: data.orderId || data.id || null,
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: data.message || "Request completed successfully.",
      subcontractor: data.subcontractor || null,
      accounts: data.accounts || [],
      supplyItems: data.supplyItems || [],
      orderId: data.orderId || data.id || null,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Unknown subcontractor portal error.",
      },
      { status: 500 }
    );
  }
}