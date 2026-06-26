import { NextResponse } from "next/server";

const SCRIPT_URL = process.env.GOOGLE_SCRIPT_URL;

type ScriptResponse = {
  success?: boolean;
  error?: string;
  message?: string;
  id?: string;
  visits?: unknown[];
  data?: unknown[];
};

type VisitRequestBody = {
  accountId?: string;
  accountName?: string;
  date?: string;
  visitType?: string;
  manager?: string;
  completedBy?: string;
  subcontractor?: string;
  condition?: string;
  followUpNeeded?: string;
  followUpDate?: string;
  notes?: string;
};

function clean(value: unknown): string {
  return String(value ?? "").trim();
}

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

    const response = await fetch(`${SCRIPT_URL}?action=getVisits`, {
      method: "GET",
      next: { revalidate: 60 }, // visits update reasonably often
    });

    const text = await response.text();

    let data: ScriptResponse;

    try {
      data = JSON.parse(text) as ScriptResponse;
    } catch {
      return NextResponse.json(
        {
          success: false,
          error: "Google Script did not return valid JSON while loading visits.",
          rawResponse: text,
        },
        { status: 500 }
      );
    }

    if (!response.ok || data.success === false) {
      return NextResponse.json(
        {
          success: false,
          error: data.error || "Failed to load visits from Google Script.",
          rawResponse: data,
        },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        success: true,
        visits: Array.isArray(data.visits)
          ? data.visits
          : Array.isArray(data.data)
            ? data.data
            : [],
      },
      {
        headers: {
          "Cache-Control": "public, max-age=30, stale-while-revalidate=60",
        },
      }
    );
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Unknown error loading visits.",
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

    const body = (await request.json()) as VisitRequestBody;

    const payload = {
      action: "addVisit",

      accountId: clean(body.accountId),
      accountName: clean(body.accountName),

      date: clean(body.date),
      visitDate: clean(body.date),

      visitType: clean(body.visitType),

      manager: clean(body.manager),
      completedBy: clean(body.manager || body.completedBy),

      subcontractor: clean(body.subcontractor),

      condition: clean(body.condition),
      conditionScore: clean(body.condition),

      followUpNeeded: clean(body.followUpNeeded),
      followUpDate: clean(body.followUpDate),

      notes: clean(body.notes),
    };

    console.log("Saving visit payload:", payload);

    const response = await fetch(SCRIPT_URL, {
      method: "POST",
      headers: {
        "Content-Type": "text/plain;charset=utf-8",
      },
      body: JSON.stringify(payload),
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
          error: "Google Script did not return valid JSON while saving visit.",
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
          error: data.error || "Failed to save visit to Google Script.",
          sentPayload: payload,
          rawResponse: data,
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      id: data.id || "",
      message: data.message || "Visit saved successfully.",
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
            : "Unknown error saving visit.",
      },
      { status: 500 }
    );
  }
}