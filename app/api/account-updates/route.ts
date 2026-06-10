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

    const response = await fetch(`${SCRIPT_URL}?action=getAccountUpdates`, {
      method: "GET",
      cache: "no-store",
    });

    const text = await response.text();

    let data: any;

    try {
      data = JSON.parse(text);
    } catch {
      return NextResponse.json(
        {
          success: false,
          error: "Google Script did not return valid JSON while loading account updates.",
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

    return NextResponse.json({
      success: true,
      accountUpdates: data.accountUpdates || [],
    });
  } catch (error) {
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

    const payload = {
      action: "addAccountUpdate",
      date: body.date || "",
      accountName: body.accountName || "",
      accountId: body.accountId || "",
      updateType: body.updateType || "",
      manager: body.manager || "",
      notes: body.notes || "",
      notifyEmail: body.notifyEmail || "",
    };

    console.log("Saving account update payload:", payload);

    const response = await fetch(SCRIPT_URL, {
      method: "POST",
      headers: {
        "Content-Type": "text/plain;charset=utf-8",
      },
      body: JSON.stringify(payload),
      cache: "no-store",
    });

    const text = await response.text();

    let data: any;

    try {
      data = JSON.parse(text);
    } catch {
      return NextResponse.json(
        {
          success: false,
          error: "Google Script did not return valid JSON while saving account update.",
          sentPayload: payload,
          rawResponse: text,
        },
        { status: 500 }
      );
    }

    if (!response.ok || data.success === false) {
      return NextResponse.json(
        {
          success: false,
          error: data.error || "Failed to save account update.",
          sentPayload: payload,
          rawResponse: data,
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      id: data.id || "",
      message: data.message || "Account update saved successfully.",
      sentPayload: payload,
      scriptResponse: data,
    });
  } catch (error) {
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