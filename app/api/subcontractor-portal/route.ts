import { NextRequest, NextResponse } from "next/server";
import { getIronSession } from "iron-session";
import { subSessionOptions, type SubSessionData } from "@/lib/subSession";

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

// Subcontractors may only see Sub Pay for their accounts — never what
// Cleaning World bills the customer or the margin between the two.
const FINANCIAL_FIELD_KEYS = [
  "revenue",
  "whatcleaningworldgetspaid",
  "cleaningworldgetspaid",
  "monthlyamount",
  "price",
  "margin",
  "gmpercent",
  "gm%",
  "profit",
];

function isFinancialFieldKey(key: string): boolean {
  const normalized = key.toLowerCase().replace(/[^a-z%]/g, "");
  return FINANCIAL_FIELD_KEYS.some((financialKey) =>
    normalized.includes(financialKey)
  );
}

function stripFinancialFields(accounts: unknown[]): unknown[] {
  return accounts.map((account) => {
    if (!account || typeof account !== "object") return account;

    const sanitized: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(
      account as Record<string, unknown>
    )) {
      if (isFinancialFieldKey(key)) continue;
      sanitized[key] = value;
    }

    return sanitized;
  });
}

function getSubIdentity(sub: NonNullable<ScriptResponse["subcontractor"]>) {
  const id = String(
    sub.id ?? sub.subcontractorId ?? sub["Subcontractor ID"] ?? ""
  ).trim();
  const email = String(sub.email ?? sub["Email"] ?? "").trim();
  const name = String(
    sub.subcontractorName ??
      sub.companyName ??
      sub.contactName ??
      sub.name ??
      "Subcontractor"
  ).trim();

  return { id, email, name };
}

export async function POST(request: NextRequest) {
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
    const action = body?.action;

    // Logout clears the session locally — no backend call needed.
    if (action === "logout") {
      const response = NextResponse.json({ success: true });
      const session = await getIronSession<SubSessionData>(
        request,
        response,
        subSessionOptions()
      );
      session.destroy();
      return response;
    }

    const isLoginAction = action === "getSubcontractorPortalByEmail";

    // Every action other than login must come from an already-logged-in
    // subcontractor. Identity is taken from the session, never trusted from
    // the request body, so a sub can no longer act as (or view) another sub
    // by passing a different email/name in the payload.
    let sessionIdentity: {
      subcontractorId: string;
      subcontractorEmail: string;
      subcontractorName: string;
    } | null = null;

    if (!isLoginAction) {
      const readResponse = NextResponse.json({});
      const session = await getIronSession<SubSessionData>(
        request,
        readResponse,
        subSessionOptions()
      );

      if (!session.subcontractorEmail) {
        return NextResponse.json(
          { success: false, error: "Not logged in." },
          { status: 401 }
        );
      }

      sessionIdentity = {
        subcontractorId: session.subcontractorId ?? "",
        subcontractorEmail: session.subcontractorEmail,
        subcontractorName: session.subcontractorName ?? "",
      };
    }

    const finalBody =
      action === "getSubcontractorPortalBySession"
        ? {
            action: "getSubcontractorPortalByEmail",
            email: sessionIdentity?.subcontractorEmail,
          }
        : action === "resolveComplaintBySubcontractor"
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
              subcontractor: sessionIdentity?.subcontractorName || "",
            },
          }
        : action === "submitSubPortalIssue"
        ? {
            ...body,
            issue: {
              ...(body.issue || {}),
              subcontractorEmail: sessionIdentity?.subcontractorEmail,
              subcontractorName: sessionIdentity?.subcontractorName,
            },
          }
        : action === "submitSupplyOrder" || action === "logSubcontractorActivity"
        ? {
            ...body,
            subcontractorEmail: sessionIdentity?.subcontractorEmail,
            subcontractorName: sessionIdentity?.subcontractorName,
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
          accounts: stripFinancialFields(data.accounts || []),
          complaints: data.complaints || [],
          supplyItems: data.supplyItems || [],
          orderId: data.orderId || data.id || null,
          rowNumber: data.rowNumber || "",
          status: data.status || "",
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

    const finalResponse = NextResponse.json({
      success: true,
      message: data.message || "Request completed successfully.",
      subcontractor: data.subcontractor || null,
      accounts: stripFinancialFields(data.accounts || []),
      complaints: data.complaints || [],
      supplyItems: data.supplyItems || [],
      orderId: data.orderId || data.id || null,
      rowNumber: data.rowNumber || "",
      status: data.status || "",
    });

    // Successful login establishes the real session. Every later request is
    // then scoped to this cookie instead of a client-supplied email — this is
    // what closes the IDOR (one sub reading another sub's data by email).
    if (isLoginAction && data.subcontractor) {
      const identity = getSubIdentity(data.subcontractor);
      const session = await getIronSession<SubSessionData>(
        request,
        finalResponse,
        subSessionOptions()
      );
      session.subcontractorId = identity.id;
      session.subcontractorEmail =
        identity.email || String(body.email ?? "").trim();
      session.subcontractorName = identity.name;
      await session.save();
    }

    return finalResponse;
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
