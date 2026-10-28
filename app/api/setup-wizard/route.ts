// The setup wizard (app/components/OnboardingChecklist.tsx; lib/pg/setup-wizard.ts).
// Staff only: this path falls through to proxy.ts's admin gate, and the
// session is checked here too. The account's own fields (frequency, days,
// pay, scope, access, contact, start date) are saved through /api/accounts
// like Edit Account; this route saves the rest and the start date's step.
//
// GET  ?accountId=X                                   everything the wizard shows
// POST { action: "tap", accountId, step, done }       Customer called / Site survey / Walkthrough
// POST { action: "startDate", accountId, startDate }  after the date is saved on the account: the step
// POST { action: "supplies", accountId, mode }        included | billed | customer
// POST { action: "equipment", accountId, note }       "Special equipment?"
// POST { action: "billing", accountId, name, email }  the billing contact (if different)
// POST { action: "deletePhoto", accountId, photoId }
// POST multipart { accountId, label, full, thumb }    one site survey photo

import { NextRequest, NextResponse } from "next/server";
import { getAdminIdentity } from "@/lib/adminSession";
import { invalidateAccountLists } from "@/app/api/accounts/route";
import { FlowError, flowsReady, setTapStep, startDateSaved } from "@/lib/pg/account-flow";
import { setAccountSupplyMode, supplyControlReady } from "@/lib/pg/supply-control";
import { addSurveyPhoto, deleteSurveyPhoto, getSetupWizard, setBillingContact, setSpecialEquipment, setTick } from "@/lib/pg/setup-wizard";
import { TAP_STEPS, type SupplyMode, type TapStep } from "@/lib/setupWizard";

export const maxDuration = 60;

const clean = (value: unknown) => String(value ?? "").trim();
const noStore = { headers: { "Cache-Control": "no-store" } };
const refuse = (error: string, status = 400) => NextResponse.json({ success: false, error }, { status, ...noStore });

export async function GET(request: NextRequest) {
  try {
    if (!(await getAdminIdentity(request))) return refuse("Log in first.", 401);
    const accountId = clean(request.nextUrl.searchParams.get("accountId"));
    if (!accountId) return refuse("accountId is required.");
    const wizard = await getSetupWizard(accountId);
    if (!wizard) return refuse("That account was not found.", 404);
    return NextResponse.json({ success: true, wizard }, noStore);
  } catch (error) {
    console.error("[setup-wizard GET]", error instanceof Error ? error.message : error);
    return refuse("The setup did not load. Try again.", 500);
  }
}

export async function POST(request: NextRequest) {
  try {
    const identity = await getAdminIdentity(request);
    if (!identity) return refuse("Log in first.", 401);
    const by = clean(identity.name) || "Staff";

    if ((request.headers.get("content-type") ?? "").includes("multipart/form-data")) {
      const form = await request.formData().catch(() => null);
      if (!form) return refuse("No photo.");
      const accountId = clean(form.get("accountId"));
      const full = form.get("full");
      const thumb = form.get("thumb");
      if (!accountId) return refuse("accountId is required.");
      if (!(full instanceof File)) return refuse("No photo.");
      const photo = await addSurveyPhoto({
        accountId,
        accountName: clean(form.get("accountName")),
        label: clean(form.get("label")),
        full,
        thumb: thumb instanceof File ? thumb : null,
        by,
      });
      return NextResponse.json({ success: true, photo }, noStore);
    }

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const action = clean(body.action);
    const accountId = clean(body.accountId);
    const accountName = clean(body.accountName);
    if (!accountId) return refuse("accountId is required.");

    if (action === "tap") {
      const step = clean(body.step) as TapStep;
      if (!TAP_STEPS.includes(step)) return refuse("Unknown step.");
      const done = body.done === true;
      // An account in the new-account steps: the pin's own mark. Any other: a tick in its checklist.
      const wizard = await getSetupWizard(accountId);
      if (!wizard) return refuse("That account was not found.", 404);
      if (wizard.facts.flow && (await flowsReady())) await setTapStep(accountId, step, done, by);
      else await setTick(accountId, accountName || wizard.accountName, step, done);
      return NextResponse.json({ success: true }, noStore);
    }

    if (action === "startDate") {
      const startDate = clean(body.startDate);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate)) return refuse("Pick the start date.");
      if (await flowsReady()) await startDateSaved(accountId, startDate, by);
      await invalidateAccountLists();
      return NextResponse.json({ success: true }, noStore);
    }

    if (action === "supplies") {
      const mode = clean(body.mode);
      if (mode !== "included" && mode !== "billed" && mode !== "customer") return refuse("Pick one of the supplies choices.");
      if (!(await supplyControlReady().catch(() => false))) return refuse("Supplies are not set up in this database yet.", 409);
      await setAccountSupplyMode(accountId, accountName, mode as SupplyMode, by);
      return NextResponse.json({ success: true }, noStore);
    }

    if (action === "equipment") {
      await setSpecialEquipment(accountId, accountName, clean(body.note));
      return NextResponse.json({ success: true }, noStore);
    }

    if (action === "billing") {
      await setBillingContact(accountId, clean(body.name), clean(body.email), by);
      return NextResponse.json({ success: true }, noStore);
    }

    if (action === "deletePhoto") {
      const photoId = Number(body.photoId);
      if (!Number.isFinite(photoId)) return refuse("Which photo?");
      await deleteSurveyPhoto(accountId, photoId);
      return NextResponse.json({ success: true }, noStore);
    }

    return refuse("Unknown action.");
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    console.error("[setup-wizard POST]", message);
    if (error instanceof FlowError) return refuse(message, 409);
    // The plain-words messages thrown by the setup, contacts and supplies code are safe to show.
    return refuse(message && message.length < 160 && !/sql|syntax|relation|column|violates/i.test(message) ? message : "That did not save. Try again.", 500);
  }
}
