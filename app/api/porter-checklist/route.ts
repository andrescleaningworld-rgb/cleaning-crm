// Public, no-login route (added to proxy.ts PUBLIC_PATHS) — this is the
// entire porter-facing surface: look up a template by its opaque
// porter_code and submit an entry. No admin/mutation actions live here;
// template editing is app/api/checklist-templates/route.ts, which is NOT
// public.
import { NextRequest, NextResponse } from "next/server";
import { getMainAccountById } from "@/lib/googleSheets";
import { getTemplateByPorterCode, insertSubmission } from "@/lib/checklistDb";
import { countSubmissionProgress, type ChecklistSubmissionSection } from "@/lib/checklistTemplate";
import { logActivity } from "@/lib/activityLog";
import { resolveCrewLink, crewLinkIsLive } from "@/lib/crewLink";

export async function GET(request: NextRequest) {
  try {
    const code = new URL(request.url).searchParams.get("code")?.trim() ?? "";
    if (!code) {
      return NextResponse.json({ success: false, error: "code is required." }, { status: 400 });
    }

    // Re-check the live flags on every load — an account that's since had
    // "Checklist Needed" unchecked should stop accepting new visits from
    // this link without deleting anything already submitted against it.
    // Crew Link (docs/crew-link-spec.md): the link is also live when only
    // supply orders and/or problem reports are switched on; `modules` tells
    // the page which buttons to show. Checklist-only links return exactly
    // what they always did (plus `modules`).
    const link = await resolveCrewLink(code);
    if (!link || !crewLinkIsLive(link.modules)) {
      return NextResponse.json({ success: true, available: false });
    }
    const { template, modules } = link;

    return NextResponse.json({
      success: true,
      available: true,
      accountName: template.accountName,
      locationName: template.locationName,
      sections: modules.checklist ? template.sections : [],
      modules,
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Failed to load checklist." },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const action = typeof body.action === "string" && body.action ? body.action : "submit";

    if (action !== "submit") {
      return NextResponse.json({ success: false, error: `Unknown action "${action}".` }, { status: 400 });
    }

    const code = String(body.code ?? "").trim();
    const porterName = String(body.porterName ?? "").trim();
    if (!code || !porterName) {
      return NextResponse.json({ success: false, error: "code and porterName are required." }, { status: 400 });
    }

    const template = await getTemplateByPorterCode(code);
    if (!template) {
      return NextResponse.json({ success: false, error: "This checklist link is no longer valid." }, { status: 404 });
    }

    const account = await getMainAccountById(template.accountId);
    if (!account?.checklistNeeded) {
      return NextResponse.json(
        { success: false, error: "This checklist is not currently available." },
        { status: 403 }
      );
    }

    const sections = Array.isArray(body.sections) ? (body.sections as ChecklistSubmissionSection[]) : [];
    const { done, total } = countSubmissionProgress(sections);

    const id = await insertSubmission({
      accountId: template.accountId,
      accountName: template.accountName,
      locationName: template.locationName,
      porterName,
      weekOf: body.weekOf ? String(body.weekOf) : null,
      timeIn: String(body.timeIn ?? ""),
      timeOut: String(body.timeOut ?? ""),
      generalNotes: String(body.generalNotes ?? ""),
      sections,
      completedCount: done,
      totalCount: total,
    });

    await logActivity({
      actorAccountId: null,
      actorRole: "porter",
      actorName: porterName,
      action: "create",
      entityType: "checklist_submission",
      entityId: String(id),
      detail: template.accountName,
    });

    return NextResponse.json({ success: true, id, completedCount: done, totalCount: total });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Failed to submit checklist." },
      { status: 500 }
    );
  }
}
