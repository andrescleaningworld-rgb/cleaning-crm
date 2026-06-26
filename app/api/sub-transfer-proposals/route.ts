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

    const response = await fetch(
      `${SCRIPT_URL}?action=getSubTransferProposals`,
      {
        method: "GET",
        next: { revalidate: 120 },
      }
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

    const response = await fetch(SCRIPT_URL, {
      method: "POST",
      headers: {
        "Content-Type": "text/plain;charset=utf-8",
      },
      body: JSON.stringify({
        action: requestedAction,
        proposal: body.proposal || body,
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

    return NextResponse.json({
      success: true,
      message: data.message || "Transfer proposal request completed.",
      proposalId: data.proposalId || data.id || null,
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