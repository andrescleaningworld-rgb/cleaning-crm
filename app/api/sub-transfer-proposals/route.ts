import { NextRequest, NextResponse } from "next/server";
import { fetchAppsScript, AppsScriptFetchError } from "@/lib/appsScriptFetch";
import { getAdminIdentity } from "@/lib/adminSession";
import { logActivity } from "@/lib/activityLog";
import { isPostgres } from "@/lib/dataSource";
import { buildSubTransferProposalEmail, createSubTransferProposal, getSubTransferProposals, sendSubTransferProposalEmail, updateSubTransferProposalStatus } from "@/lib/pg/sub-transfers";

const SCRIPT_URL = process.env.GOOGLE_SCRIPT_URL;

// Apps Script latency has been measured spiking to ~14s on a single call;
// this must comfortably exceed the per-attempt timeout in fetchAppsScript
// (18s) plus its one retry plus backoff, or Vercel would kill the function
// before our own retry/error-handling logic gets a chance to run. Matches
// the pattern in app/api/accounts/route.ts and app/api/subcontractors/route.ts.
export const maxDuration = 45;

export async function GET() {
  try {
    // DATA_SOURCE_SUB_TRANSFERS=postgres: the same list, in the same shape, without Apps Script.
    if (isPostgres("SUB_TRANSFERS")) {
      const proposals = await getSubTransferProposals();
      return NextResponse.json({ success: true, proposals, count: proposals.length });
    }

    if (!SCRIPT_URL) {
      return NextResponse.json(
        {
          success: false,
          error: "Missing GOOGLE_SCRIPT_URL in .env.local",
        },
        { status: 500 }
      );
    }

    // Was a bare fetch() with no timeout of its own — on a slow upstream it
    // just hung until Vercel's platform-level maxDuration (45s) killed the
    // whole function, which returns a platform error page (not JSON) and
    // crashed the client's JSON.parse. fetchAppsScript gives this the same
    // 18s-per-attempt timeout + retry the POST handler below already has,
    // so a slow upstream now fails fast with a real JSON error instead.
    let response: Response;
    try {
      response = await fetchAppsScript(`${SCRIPT_URL}?action=getSubTransferProposals`, {
        method: "GET",
        cache: "no-store",
      });
    } catch (err) {
      const message =
        err instanceof AppsScriptFetchError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Unknown error loading transfer proposals.";
      return NextResponse.json({ success: false, error: message }, { status: 500 });
    }

    const text = await response.text();

    let data;

    try {
      data = JSON.parse(text);
    } catch {
      return NextResponse.json(
        {
          success: false,
          error:
            "Google Script did not return valid JSON while loading transfer proposals.",
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
            "Failed to load transfer proposals from Google Script.",
          googleScriptResponse: data,
          rawGoogleScriptResponse: text,
          googleScriptStatus: response.status,
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      proposals: data.proposals || data.data || [],
      count: data.count || 0,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Unknown error loading transfer proposals.",
      },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const onPostgres = isPostgres("SUB_TRANSFERS");
    if (!onPostgres && !SCRIPT_URL) {
      return NextResponse.json(
        {
          success: false,
          error: "Missing GOOGLE_SCRIPT_URL in .env.local",
        },
        { status: 500 }
      );
    }

    const body = await request.json();

    // "Preview before sending": the email exactly as the sub will get it (same
    // build as the send), with who it goes to. Nothing is sent or saved.
    if (String(body.action || "").trim() === "previewSubTransferProposalEmail") {
      if (!onPostgres) return NextResponse.json({ success: false, error: "The preview is not available here." }, { status: 409 });
      const built = await buildSubTransferProposalEmail((body.proposal || body) as Record<string, unknown>, request.nextUrl.origin);
      if ("error" in built) return NextResponse.json({ success: false, error: built.error }, { status: 400 });
      return NextResponse.json({ success: true, preview: built });
    }

    const allowedActions = [
      "createSubTransferProposal",
      "addSubTransferProposal",
      "sendSubTransferProposalEmail",
      "updateSubTransferProposalStatus",
    ];

    const requestedAction = String(body.action || "").trim();

    if (!allowedActions.includes(requestedAction)) {
      return NextResponse.json(
        {
          success: false,
          error: "Invalid transfer proposal action: " + requestedAction,
        },
        { status: 400 }
      );
    }

    // DATA_SOURCE_SUB_TRANSFERS=postgres: the same three actions, done here
    // (lib/pg/sub-transfers.ts). Apps Script is not called. The Accept and
    // Decline buttons in the email open this app.
    if (onPostgres) {
      let result: Record<string, unknown>;
      try {
        const proposal = (body.proposal || body) as Record<string, unknown>;
        result =
          requestedAction === "sendSubTransferProposalEmail"
            ? await sendSubTransferProposalEmail(proposal, request.nextUrl.origin, (await getAdminIdentity(request))?.name || "Someone")
            : requestedAction === "updateSubTransferProposalStatus"
              ? await updateSubTransferProposalStatus(body as Record<string, unknown>)
              : await createSubTransferProposal(proposal);
      } catch (err) {
        // What the script answered for a refused request: { success: false, error }.
        result = { success: false, error: String(err instanceof Error ? `Error: ${err.message}` : err) };
      }
      if (result.success === false) {
        return NextResponse.json(
          { success: false, error: result.error || result.message || "Failed to save transfer proposal.", googleScriptResponse: result },
          { status: 500 }
        );
      }
      const savedId = (result.proposalId as string | undefined) || null;
      const who = await getAdminIdentity(request);
      if (who?.accountId) {
        await logActivity({
          actorAccountId: who.accountId,
          actorRole: who.role ?? "manager",
          actorName: who.name || "",
          action: requestedAction === "updateSubTransferProposalStatus" ? "update" : "create",
          entityType: "sub_transfer_proposal",
          entityId: savedId,
        });
      }
      return NextResponse.json({ success: true, message: result.message || "Transfer proposal request completed.", proposalId: savedId, sentTo: result.sentTo || null, data: result });
    }

    const response = await fetchAppsScript(
      SCRIPT_URL!,
      {
        method: "POST",
        headers: {
          "Content-Type": "text/plain;charset=utf-8",
        },
        body: JSON.stringify({
          action: requestedAction,
          proposal: body.proposal || body,
        }),
        cache: "no-store",
      },
      undefined,
      // createSubTransferProposal/addSubTransferProposal append a new sheet
      // row and sendSubTransferProposalEmail sends an email — neither is
      // safe to retry blindly on a thrown/timeout error (risk of a
      // duplicate proposal or a duplicate email), so only a confirmed 5xx
      // (nothing was written) is retried here — same reasoning as
      // addAccount's retryOnThrow in app/api/accounts/route.ts.
      { retryOnThrow: false }
    );

    const text = await response.text();

    let data;

    try {
      data = JSON.parse(text);
    } catch {
      return NextResponse.json(
        {
          success: false,
          error:
            "Google Script did not return valid JSON while saving transfer proposal.",
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
            "Failed to save transfer proposal in Google Script.",
          googleScriptResponse: data,
          rawGoogleScriptResponse: text,
          googleScriptStatus: response.status,
        },
        { status: 500 }
      );
    }

    const proposalId = data.proposalId || data.id || null;
    const actor = await getAdminIdentity(request);
    if (actor?.accountId) {
      await logActivity({
        actorAccountId: actor.accountId,
        actorRole: actor.role ?? "manager",
        actorName: actor.name || "",
        action: requestedAction === "updateSubTransferProposalStatus" ? "update" : "create",
        entityType: "sub_transfer_proposal",
        entityId: proposalId,
      });
    }

    return NextResponse.json({
      success: true,
      message: data.message || "Transfer proposal request completed.",
      proposalId,
      sentTo: data.sentTo || null,
      data,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Unknown error saving transfer proposal.",
      },
      { status: 500 }
    );
  }
}