import { NextRequest, NextResponse } from "next/server";
import { getIronSession } from "iron-session";
import { subSessionOptions, type SubSessionData } from "@/lib/subSession";
import { fetchAppsScript, AppsScriptFetchError } from "@/lib/appsScriptFetch";
import { closeComplaint } from "@/lib/data/complaints";
import { createSupplyOrder } from "@/lib/data/supplies";
import {
  getSubPortalByEmail,
  logSubcontractorActivity,
  submitSubPortalIssue,
  subPortalOnPostgres,
} from "@/lib/data/sub-portal";
import { sendInternalNotification } from "@/lib/email";
import { emailNewSupplyOrder } from "@/lib/supplyOrderEmail";

const SCRIPT_URL =
  process.env.GOOGLE_SCRIPT_URL || process.env.NEXT_PUBLIC_GOOGLE_SCRIPT_URL;

// Apps Script latency has been measured spiking to ~14s on a single call;
// this must comfortably exceed the per-attempt timeout in fetchAppsScript
// (18s) plus its one retry plus backoff, or Vercel would kill the function
// before our own retry/error-handling logic gets a chance to run. Matches
// the budget used by /api/accounts and /api/subcontractors for the same
// upstream.
export const maxDuration = 45;

// Only these actions are confirmed read-only against the Apps Script backend
// — safe to retry after a throw (timeout/network failure), since a retry
// can't duplicate a side effect it never had. Every other action here
// (logSubcontractorActivity, submitSubPortalIssue, submitSupplyOrder,
// resolveComplaint) writes a row and its Apps Script handler isn't in this
// repo to confirm it upserts by id rather than appending — same reasoning
// app/api/accounts/route.ts uses to withhold retryOnThrow from addAccount.
const RETRY_ON_THROW_ACTIONS = new Set([
  "getSubcontractorPortalByEmail",
  "getSubcontractorPortalBySession",
]);

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

type SessionIdentity = { subcontractorId: string; subcontractorEmail: string; subcontractorName: string };

// DATA_SOURCE_SUB_PORTAL=postgres: the same six actions, answered from
// Postgres. Apps Script is not called. The answers keep the keys the portal
// screen reads (subcontractor, accounts, complaints, supplyItems, orderId,
// rowNumber, status).
async function handleOnPostgres(
  request: NextRequest,
  body: Record<string, unknown>,
  action: string,
  sessionIdentity: SessionIdentity | null
): Promise<NextResponse> {
  const answer = (extra: {
    message?: string;
    subcontractor?: unknown;
    accounts?: unknown[];
    complaints?: unknown[];
    supplyItems?: unknown[];
    orderId?: string | null;
    rowNumber?: string | number;
    status?: string;
  }) => ({
    success: true,
    message: extra.message || "Request completed successfully.",
    subcontractor: extra.subcontractor ?? null,
    accounts: stripFinancialFields(extra.accounts ?? []),
    complaints: extra.complaints ?? [],
    supplyItems: extra.supplyItems ?? [],
    orderId: extra.orderId ?? null,
    rowNumber: extra.rowNumber ?? "",
    status: extra.status ?? "",
  });
  const refuse = (error: string, status: number) => NextResponse.json({ success: false, error }, { status });

  const isLogin = action === "getSubcontractorPortalByEmail";
  if (isLogin || action === "getSubcontractorPortalBySession") {
    const email = isLogin ? String(body.email ?? "").trim() : sessionIdentity?.subcontractorEmail ?? "";
    const portal = await getSubPortalByEmail(email);
    if (!portal) return refuse("We could not find that email on file.", isLogin ? 404 : 401);
    if (isInactiveSub(portal.subcontractor)) {
      return refuse("Your account is currently inactive. Please contact your manager.", 401);
    }
    const response = NextResponse.json(answer({ ...portal, message: "Subcontractor portal loaded." }));
    if (isLogin) {
      const identity = getSubIdentity(portal.subcontractor);
      const session = await getIronSession<SubSessionData>(request, response, subSessionOptions());
      session.subcontractorId = identity.id;
      session.subcontractorEmail = identity.email || email;
      session.subcontractorName = identity.name;
      await session.save();
    }
    return response;
  }

  // Everything below needs a logged-in subcontractor (checked by the caller).
  const email = sessionIdentity?.subcontractorEmail ?? "";
  const name = sessionIdentity?.subcontractorName ?? "";

  if (action === "logSubcontractorActivity") {
    await logSubcontractorActivity({ email, name, actionType: String(body.actionType ?? ""), details: String(body.details ?? "") });
    return NextResponse.json(answer({ message: "Activity logged." }));
  }

  if (action === "submitSubPortalIssue") {
    const issue = await submitSubPortalIssue({ ...((body.issue as Record<string, unknown>) || {}), subcontractorEmail: email, subcontractorName: name });
    // The office hears about a new issue by email as well as under Notifications.
    await sendInternalNotification(`Sub portal issue: ${issue.issueType || "Issue"} (${issue.urgency})`, [
      `Issue ID: ${issue.issueId}`,
      `Subcontractor: ${issue.subcontractorName || issue.subcontractorEmail}`,
      `Account: ${issue.accountName || "Not given"}`,
      `Type: ${issue.issueType || "Not given"}`,
      `Urgency: ${issue.urgency}`,
      `Description: ${issue.description}`,
      `Photos: ${issue.photoCount || "0"}`,
    ]).catch(() => false);
    return NextResponse.json({
      ...answer({ message: "Issue submitted.", rowNumber: issue.rowNumber, status: issue.status }),
      // The screen ties the issue's photos to this id.
      issueId: issue.issueId,
      data: { issueId: issue.issueId },
    });
  }

  if (action === "submitSupplyOrder") {
    const order = await createSupplyOrder({ ...body, subcontractor: name, subcontractorName: name, subcontractorEmail: email });
    await emailNewSupplyOrder(order);
    return NextResponse.json(answer({ message: "Supply order submitted.", orderId: order.orderId, rowNumber: order.rowNumber, status: order.status }));
  }

  if (action === "resolveComplaintBySubcontractor") {
    const complaint = (body.complaint as Record<string, unknown>) || {};
    const resolution = String(complaint.resolution || complaint.resolutionNotes || complaint.notes || "");
    const closed = await closeComplaint({
      rowNumber: complaint.rowNumber as string | number | undefined,
      id: String(complaint.id ?? "").trim(),
      status: "Resolved by Sub",
      resolution: name ? `Resolved by ${name}: ${resolution}` : resolution,
    });
    return NextResponse.json(answer({ message: "Complaint resolved.", rowNumber: closed.rowNumber, status: closed.status }));
  }

  return refuse(`Unknown subcontractor portal action: ${action}`, 400);
}

export async function POST(request: NextRequest) {
  try {
    if (!SCRIPT_URL && !subPortalOnPostgres()) {
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
    let sessionIdentity: SessionIdentity | null = null;

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

    if (subPortalOnPostgres()) {
      return await handleOnPostgres(request, body, String(action ?? ""), sessionIdentity);
    }

    if (!SCRIPT_URL) {
      throw new Error("Missing GOOGLE_SCRIPT_URL or NEXT_PUBLIC_GOOGLE_SCRIPT_URL in .env.local");
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

    let response: Response;
    try {
      response = await fetchAppsScript(
        SCRIPT_URL,
        {
          method: "POST",
          headers: {
            "Content-Type": "text/plain;charset=utf-8",
          },
          body: JSON.stringify(finalBody),
          cache: "no-store",
        },
        undefined,
        {
          retryOn5xx: true,
          retryOnThrow: RETRY_ON_THROW_ACTIONS.has(action),
        }
      );
    } catch (err) {
      if (err instanceof AppsScriptFetchError) {
        return NextResponse.json(
          { success: false, error: err.message },
          { status: err.status }
        );
      }
      throw err;
    }

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
