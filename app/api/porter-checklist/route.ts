// Public, no-login route (added to proxy.ts PUBLIC_PATHS) — this is the
// entire porter-facing surface: look up a template by its opaque
// porter_code and submit an entry. No admin/mutation actions live here;
// template editing is app/api/checklist-templates/route.ts, which is NOT
// public.
import { NextRequest, NextResponse } from "next/server";
import { getMainAccountById } from "@/lib/googleSheets";
import { getTabForAccount, getTemplateByPorterCode, insertSubmission, listActiveTabs, setSubmissionNotesTranslation } from "@/lib/checklistDb";
import { waitUntil } from "@vercel/functions";
import { translateToEnglish } from "@/lib/translate";
import {
  DEFAULT_TAB_NAME,
  countSubmissionProgress,
  countTabItems,
  type ChecklistSubmissionSection,
  type ChecklistTabDef,
} from "@/lib/checklistTemplate";
import { logActivity } from "@/lib/activityLog";
import { resolveCrewLink, crewLinkIsLive, cleanReporterName } from "@/lib/crewLink";
import { getContentTranslations, sectionTexts } from "@/lib/crewTranslations";

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

    // Crew Link tabs: crews see only tabs with at least one item; if every
    // tab is empty, the first one (same as before tabs). No tab rows at all
    // (migration not reached yet) → the template's sections as one tab.
    // `sections` stays = the first tab's sections for pages cached from
    // before tabs existed.
    let tabs: ChecklistTabDef[] = [];
    if (modules.checklist) {
      const active = await listActiveTabs(template.accountId);
      const withItems = active.filter((tab) => countTabItems(tab) > 0);
      tabs = withItems.length > 0 ? withItems : active.slice(0, 1);
      if (tabs.length === 0) tabs = [{ id: 0, name: DEFAULT_TAB_NAME, sections: template.sections }];
    }

    // ES/PT for every tab name, section and item (English if missing).
    const translations = await getContentTranslations(tabs.flatMap((tab) => [tab.name, ...sectionTexts(tab.sections)]));

    // Crews see the building name only — no account name, ids or details.
    return NextResponse.json({
      success: true,
      available: true,
      locationName: template.locationName,
      sections: tabs[0]?.sections ?? [],
      tabs,
      modules,
      translations,
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
    const porterName = cleanReporterName(body.porterName);
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

    // Each tab is submitted on its own. A tab deleted after the crew opened
    // it still links (soft delete). No tabId (page cached from before tabs)
    // → the account's first active tab.
    const requestedTabId = Number(body.tabId);
    let tab: ChecklistTabDef | null = null;
    if (Number.isInteger(requestedTabId) && requestedTabId > 0) {
      tab = await getTabForAccount(template.accountId, requestedTabId);
    }
    if (!tab) {
      tab = (await listActiveTabs(template.accountId))[0] ?? null;
    }

    const sections = Array.isArray(body.sections) ? (body.sections as ChecklistSubmissionSection[]) : [];
    const { done, total } = countSubmissionProgress(sections);

    // Automatic "started" time from the crew's first checkbox tap. Only a
    // sane value is kept (not in the future, not more than 24h ago) — a
    // wrong phone clock just means no start time, never a failed submit.
    let startedAt: string | null = null;
    if (typeof body.startedAt === "string") {
      const started = new Date(body.startedAt).getTime();
      const now = Date.now();
      if (Number.isFinite(started) && started <= now + 5 * 60 * 1000 && started >= now - 24 * 60 * 60 * 1000) {
        startedAt = new Date(Math.min(started, now)).toISOString();
      }
    }

    const id = await insertSubmission({
      accountId: template.accountId,
      accountName: template.accountName,
      locationName: template.locationName,
      tabId: tab?.id ?? null,
      tabName: tab?.name ?? null,
      porterName,
      weekOf: body.weekOf ? String(body.weekOf) : null,
      timeIn: String(body.timeIn ?? ""),
      timeOut: String(body.timeOut ?? ""),
      startedAt,
      generalNotes: String(body.generalNotes ?? ""),
      sections,
      completedCount: done,
      totalCount: total,
    });

    // English copy of the crew's note for staff + the sub portal (English
    // first, "Show original"). After the response, so Send never waits.
    const generalNotes = String(body.generalNotes ?? "").trim();
    if (generalNotes) {
      waitUntil(
        translateToEnglish(generalNotes)
          .then((t) => (t ? setSubmissionNotesTranslation(id, t.english, t.detectedLanguage) : undefined))
          .catch((error) => console.error("[porter-checklist note translation]", error))
      );
    }

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
