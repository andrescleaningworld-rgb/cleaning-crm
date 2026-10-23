// Sub insurance (COI) for the office (lib/pg/sub-insurance.ts). Staff only
// (proxy.ts default gate, plus a logged-in check here).
//
// GET                    every sub's insurance (badges, Sub Center list) and
//                        the COIs waiting for approval
// GET ?subId=            one sub: its insurance and its COI files
// POST (form)            the office uploads a COI: subId, file, expiresOn.
//                        It counts at once.
// POST { action: "approve", id, expiresOn }   a COI from the portal counts
// POST { action: "reject", id, reason }       the sub sees the reason

import { NextRequest, NextResponse } from "next/server";
import { getAdminIdentity } from "@/lib/adminSession";
import { saveCoiFromForm } from "@/lib/coiUpload";
import { looseDate } from "@/lib/subInsurance";
import { getFeatureSetting } from "@/lib/pg/feature-settings";
import { addOfficeCoi, approveCoi, listCoiDocs, listPendingCoi, listSubInsurance, rejectCoi, resolveSubId, subInsuranceReady } from "@/lib/pg/sub-insurance";

const noStore = { headers: { "Cache-Control": "no-store" } };
const refuse = (error: string, status = 400) => NextResponse.json({ success: false, error }, { status, ...noStore });

export async function GET(request: NextRequest) {
  try {
    if (!(await getAdminIdentity(request))) return refuse("Log in first.", 401);
    const ready = await subInsuranceReady();
    const wanted = request.nextUrl.searchParams.get("subId")?.trim() ?? "";
    if (wanted) {
      const subId = await resolveSubId(wanted);
      if (!subId) return refuse("That sub was not found.", 404);
      const [all, docs] = await Promise.all([listSubInsurance(), listCoiDocs(subId)]);
      return NextResponse.json({ success: true, ready, insurance: all.find((sub) => sub.subId === subId) ?? null, docs }, noStore);
    }
    const [list, pending, portal] = await Promise.all([listSubInsurance(), listPendingCoi(), getFeatureSetting("subInsurancePortal")]);
    return NextResponse.json({ success: true, ready, list, pending, portalOn: portal.on }, noStore);
  } catch (error) {
    console.error("[sub-insurance GET]", error instanceof Error ? error.message : error);
    return refuse("Insurance did not load.", 500);
  }
}

export async function POST(request: NextRequest) {
  try {
    const identity = await getAdminIdentity(request);
    if (!identity) return refuse("Log in first.", 401);
    const by = identity.name || "Office";
    const actor = identity.accountId ?? null;

    if ((request.headers.get("content-type") ?? "").includes("multipart/form-data")) {
      let form: FormData;
      try {
        form = await request.formData();
      } catch {
        return refuse("That file is too big. Use a PDF under 4 MB, or take a photo.");
      }
      const subId = await resolveSubId(String(form.get("subId") ?? ""));
      if (!subId) return refuse("That sub was not found.", 404);
      const saved = await saveCoiFromForm(form);
      await addOfficeCoi({ subId, ...saved, by, actorAccountId: actor });
      return NextResponse.json({ success: true }, noStore);
    }

    const body = (await request.json().catch(() => ({}))) as { action?: unknown; id?: unknown; expiresOn?: unknown; reason?: unknown };
    const id = String(body.id ?? "").trim();
    if (body.action === "approve") {
      const day = looseDate(body.expiresOn);
      if (!day) return refuse("Enter the expiration date.");
      return (await approveCoi(id, day, by, actor)) ? NextResponse.json({ success: true }, noStore) : refuse("It was already checked.", 409);
    }
    if (body.action === "reject") {
      const reason = String(body.reason ?? "").trim();
      if (!reason) return refuse("Write the reason. The sub will see it.");
      return (await rejectCoi(id, reason, by, actor)) ? NextResponse.json({ success: true }, noStore) : refuse("It was already checked.", 409);
    }
    return refuse("Unknown action.");
  } catch (error) {
    console.error("[sub-insurance POST]", error instanceof Error ? error.message : error);
    return refuse(error instanceof Error ? error.message : "That did not save. Try again.", 500);
  }
}
