import { NextRequest, NextResponse } from "next/server";

const GOOGLE_SCRIPT_URL = process.env.GOOGLE_SCRIPT_URL;

export async function GET() {
  if (!GOOGLE_SCRIPT_URL) {
    return NextResponse.json(
      {
        success: false,
        message: "GOOGLE_SCRIPT_URL is missing.",
        issues: [],
        newCount: 0,
      },
      { status: 500 }
    );
  }

  try {
    const response = await fetch(
      `${GOOGLE_SCRIPT_URL}?action=getSubPortalIssues`,
      {
        cache: "no-store",
      }
    );

    const text = await response.text();

    try {
      const data = JSON.parse(text);

      return NextResponse.json(
        {
          success: Boolean(data.success),
          message: data.message || "",
          issues: Array.isArray(data.issues) ? data.issues : [],
          newCount: Number(data.newCount || 0),
        },
        {
          headers: {
            "Cache-Control": "public, max-age=15, stale-while-revalidate=30",
          },
        }
      );
    } catch {
      return NextResponse.json(
        {
          success: false,
          message: "Google Script did not return valid JSON for notifications.",
          rawResponse: text,
          issues: [],
          newCount: 0,
        },
        { status: 500 }
      );
    }
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        message:
          error instanceof Error
            ? error.message
            : "Unknown error loading notifications.",
        issues: [],
        newCount: 0,
      },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  if (!GOOGLE_SCRIPT_URL) {
    return NextResponse.json(
      {
        success: false,
        message: "GOOGLE_SCRIPT_URL is missing.",
      },
      { status: 500 }
    );
  }

  try {
    const body = await request.json();

    const response = await fetch(GOOGLE_SCRIPT_URL, {
      method: "POST",
      headers: {
        "Content-Type": "text/plain;charset=utf-8",
      },
      body: JSON.stringify({
        action: body.action || "updateSubPortalIssueStatus",
        issue: body.issue || body,
      }),
    });

    const text = await response.text();

    try {
      const data = JSON.parse(text);

      return NextResponse.json({
        success: Boolean(data.success),
        message: data.message || "",
        issueId: data.issueId || "",
        rowNumber: data.rowNumber || "",
        status: data.status || "",
        data,
      });
    } catch {
      return NextResponse.json(
        {
          success: false,
          message:
            "Google Script did not return valid JSON while updating notification.",
          rawResponse: text,
        },
        { status: 500 }
      );
    }
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        message:
          error instanceof Error
            ? error.message
            : "Unknown error updating notification.",
      },
      { status: 500 }
    );
  }
}