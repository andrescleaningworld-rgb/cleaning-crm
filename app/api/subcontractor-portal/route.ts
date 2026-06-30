import { NextResponse } from "next/server";

const SCRIPT_URL =
  process.env.GOOGLE_SCRIPT_URL || process.env.NEXT_PUBLIC_GOOGLE_SCRIPT_URL;

type ScriptResponse = {
  success?: boolean;
  message?: string;
  error?: string;
  subcontractor?: { status?: string; [key: string]: unknown } | null;
  accounts?: unknown[];
  complaints?: unknown[];
  supplyItems?: unknown[];
  orderId?: string;
  id?: string;
  rowNumber?: string | number;
  status?: string;
};

function isInactiveSub(sub: ScriptResponse["subcontractor"]): boolean {
  return String(sub?.status ?? "").trim().toLowerCase() === "inactive";
}

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

    const finalBody =
      body?.action === "resolveComplaintBySubcontractor"
        ? {
            action: "resolveComplaint",
            complaint: {
              ...(body.complaint || {}),
              status: "Resolved by Sub",
              resolution:
                body.complaint?.resolution ||
                body.complaint?.resolutionNotes ||
                body.complaint?.notes ||
                "",
              resolutionNotes:
                body.complaint?.resolutionNotes ||
                body.complaint?.resolution ||
                body.complaint?.notes ||
                "",
              notes: body.complaint?.notes || body.complaint?.resolutionNotes || "",
              followUpDate:
                body.complaint?.followUpDate ||
                new Date().toISOString().slice(0, 10),
              closedDate: "",
            },
          }
        : body;

    const response = await fetch(SCRIPT_URL, {
      method: "POST",
      headers: {
        "Content-Type": "text/plain;charset=utf-8",
      },
      body: JSON.stringify(finalBody),
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
          sentPayload: finalBody,
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
          complaints: data.complaints || [],
          supplyItems: data.supplyItems || [],
          orderId: data.orderId || data.id || null,
          rowNumber: data.rowNumber || "",
          status: data.status || "",
          rawResponse: data,
        },
        { status: 500 }
      );
    }

    // Block inactive subcontractors. Checked server-side on every response that
    // includes the subcontractor object (covers login + any action that returns it).
    if (data.subcontractor && isInactiveSub(data.subcontractor)) {
      return NextResponse.json(
        {
          success: false,
          error: "Your account is currently inactive. Please contact your manager.",
        },
        { status: 401 }
      );
    }

    return NextResponse.json({
      success: true,
      message: data.message || "Request completed successfully.",
      subcontractor: data.subcontractor || null,
      accounts: data.accounts || [],
      complaints: data.complaints || [],
      supplyItems: data.supplyItems || [],
      orderId: data.orderId || data.id || null,
      rowNumber: data.rowNumber || "",
      status: data.status || "",
      scriptResponse: data,
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