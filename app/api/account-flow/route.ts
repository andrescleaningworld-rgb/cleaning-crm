// The New Account flow (lib/pg/account-flow.ts). Staff only: this path falls
// through to proxy.ts's default admin gate.
//
// GET  ?accountId=X                         the flow (null for an account that has none)
// GET  ?list=1                              every new account still in the flow (Accounts Center)
// POST { action: "create", ... }            the "New Accepted Account" form
// POST { action: "previewOffer", accountId, subId }                  step 2: what the sub will get (nothing sent)
// POST { action: "offer", accountId, subId, days, start, minutes }   step 2
// POST { action: "takeBack", accountId }    step 3: pick someone else
// POST { action: "done", accountId, step }  steps 4 and 6
// POST { action: "startDate", accountId, startDate }                 step 7
// POST { action: "followUp", accountId, note }                       step 8
// POST { action: "note", accountId, note }  why the current step is stuck

import { after, NextRequest, NextResponse } from "next/server";
import { getAdminIdentity } from "@/lib/adminSession";
import { invalidateAccountLists } from "@/app/api/accounts/route";
import { notifyBoardSquare } from "@/lib/pg/board-sms";
import {
  FlowError,
  confirmStartDate,
  createAcceptedAccount,
  flowsReady,
  followUpDone,
  getFlowDetail,
  listOpenFlows,
  previewOffer,
  sendOffer,
  setStuckNote,
  syncAutoSteps,
  takeOfferBack,
  tapDone,
} from "@/lib/pg/account-flow";

const clean = (value: unknown) => String(value ?? "").trim();
const refuse = (error: string, status = 400) => NextResponse.json({ success: false, error }, { status });
const noStore = { headers: { "Cache-Control": "no-store" } };

export async function GET(request: NextRequest) {
  try {
    if (!(await flowsReady())) return NextResponse.json({ success: true, ready: false, flow: null, flows: [] }, noStore);
    // Accounts Center → New accounts: every new account still in the flow.
    if (request.nextUrl.searchParams.get("list") === "1") {
      const identity = await getAdminIdentity(request);
      await syncAutoSteps().catch((error) => console.error("[account-flow list] sync:", error instanceof Error ? error.message : error));
      return NextResponse.json({ success: true, ready: true, flows: await listOpenFlows(clean(identity?.name)) }, noStore);
    }
    const accountId = clean(request.nextUrl.searchParams.get("accountId"));
    if (!accountId) return refuse("accountId is required.");
    return NextResponse.json({ success: true, ready: true, flow: await getFlowDetail(accountId) }, noStore);
  } catch (error) {
    console.error("[account-flow GET]", error instanceof Error ? error.message : error);
    return refuse("The new-account steps did not load.", 500);
  }
}

export async function POST(request: NextRequest) {
  try {
    if (!(await flowsReady())) return refuse("New-account steps are not turned on here yet.", 409);
    const identity = await getAdminIdentity(request);
    if (!identity) return refuse("Log in first.", 401);
    const by = clean(identity.name) || "Staff";
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const action = clean(body.action);
    const accountId = clean(body.accountId);

    if (action === "create") {
      const accountName = clean(body.accountName);
      const manager = clean(body.manager);
      if (!accountName) return refuse("Type the customer name.");
      if (!manager) return refuse("Pick the account manager.");
      const saved = await createAcceptedAccount(
        {
          accountName,
          address: clean(body.address),
          city: clean(body.city),
          state: clean(body.state),
          zip: clean(body.zip),
          latitude: clean(body.latitude),
          longitude: clean(body.longitude),
          monthlyRevenue: clean(body.monthlyRevenue).replace(/[^0-9.]/g, ""),
          contactName: clean(body.contactName),
          phone: clean(body.phone),
          frequency: clean(body.frequency),
          monthlySubcontractorPay: clean(body.monthlySubcontractorPay).replace(/[^0-9.]/g, ""),
          subPricePerCleaning: clean(body.subPricePerCleaning).replace(/[^0-9.]/g, ""),
          email: clean(body.email),
          manager,
          estimateUrl: clean(body.estimateUrl),
          estimateName: clean(body.estimateName),
        },
        by
      );
      await invalidateAccountLists();
      // The usual board text: the manager hears about the paper in their square (not when they made it themselves).
      if (saved.square) {
        const origin = new URL(request.url).origin;
        const byStaffId = clean(identity.staffId);
        after(() => notifyBoardSquare({ square: saved.square, byStaffId, paperId: saved.accountId, title: accountName, accountName, notes: "New accepted account", origin, routeContext: "account-flow/create" }));
      }
      return NextResponse.json({ success: true, accountId: saved.accountId });
    }

    if (!accountId) return refuse("accountId is required.");

    // "Preview before sending": who the offer goes to and the exact text. Nothing is sent or saved.
    if (action === "previewOffer") {
      const subId = clean(body.subId);
      if (!subId) return refuse("Pick a subcontractor.");
      return NextResponse.json({ success: true, preview: await previewOffer(accountId, subId) });
    }

    if (action === "offer") {
      const subId = clean(body.subId);
      if (!subId) return refuse("Pick a subcontractor.");
      const minutes = Math.round(Number(body.minutes));
      const { subName } = await sendOffer(accountId, { subId, days: clean(body.days), start: clean(body.start), minutes: Number.isFinite(minutes) ? minutes : 0 }, by);
      return NextResponse.json({ success: true, subName });
    }

    if (action === "takeBack") {
      await takeOfferBack(accountId, by);
      return NextResponse.json({ success: true });
    }

    if (action === "done") {
      const step = clean(body.step);
      if (step !== "call" && step !== "walkthrough") return refuse("That step is not finished with a Done button.");
      await tapDone(accountId, step, by);
      return NextResponse.json({ success: true });
    }

    if (action === "startDate") {
      await confirmStartDate(accountId, clean(body.startDate), by);
      await invalidateAccountLists();
      return NextResponse.json({ success: true });
    }

    if (action === "followUp") {
      await followUpDone(accountId, clean(body.note), by);
      await invalidateAccountLists();
      return NextResponse.json({ success: true });
    }

    if (action === "note") {
      await setStuckNote(accountId, clean(body.note), by);
      return NextResponse.json({ success: true });
    }

    return refuse("Unknown action.");
  } catch (error) {
    if (error instanceof FlowError) return refuse(error.message, 409);
    console.error("[account-flow POST]", error instanceof Error ? error.message : error);
    return refuse(error instanceof Error && error.message.startsWith("The start date") ? error.message : "That did not save. Try again.", 500);
  }
}
