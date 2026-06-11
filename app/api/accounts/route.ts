import { NextResponse } from "next/server";

const SCRIPT_URL = process.env.GOOGLE_SCRIPT_URL;

export async function GET() {
  try {
    if (!SCRIPT_URL) {
      return NextResponse.json(
        {
          success: false,
          error: "Missing GOOGLE_SCRIPT_URL in .env.local",
        },
        { status: 500 }
      );
    }

    const response = await fetch(`${SCRIPT_URL}?action=getAllAccounts`, {
      method: "GET",
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
          error:
            "Google Script did not return valid JSON while loading accounts.",
          rawResponse: text,
        },
        { status: 500 }
      );
    }

    if (!response.ok || data.success === false) {
      return NextResponse.json(
        {
          success: false,
          error: data.error || "Failed to load accounts from Google Script.",
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      accounts: data.accounts || data.data || [],
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Unknown error loading accounts.",
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
          error: "Missing GOOGLE_SCRIPT_URL in .env.local",
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
      body: JSON.stringify({
        action: body.action || "addAccount",
        account: body.account || body,
      }),
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
          error:
            "Google Script did not return valid JSON while saving account.",
          rawResponse: text,
        },
        { status: 500 }
      );
    }

    if (!response.ok || data.success === false) {
      return NextResponse.json(
        {
          success: false,
          error: data.error || "Failed to save account in Google Script.",
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: data.message || "Account saved successfully.",
      account: data.account || null,
      accountId: data.accountId || null,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Unknown error saving account.",
      },
      { status: 500 }
    );
  }
}