// Admin-only (default proxy.ts gate — not in PUBLIC_PATHS): loads/edits a
// single account's checklist template. The porter-facing read/submit path
// is app/api/porter-checklist/route.ts instead, which is deliberately
// public and can't reach any of these actions.
import { scheduleCrewTranslations } from "@/lib/crewTranslations";
import { NextRequest, NextResponse } from "next/server";
import { getMainAccountById, setAccountChecklistNeeded } from "@/lib/data/accounts";
import {
  addTab,
  deleteTab,
  ensureFirstTab,
  ensureTemplate,
  getTemplateByAccountId,
  renameTab,
  reorderTabs,
  listActiveTabs,
  saveTabSections,
  saveTabsByName,
  setCrewLinkModules,
} from "@/lib/checklistDb";
import { cleanTabName, parseUploadedChecklistFile, validateSections, type ChecklistSectionDef } from "@/lib/checklistTemplate";
import { buildChecklistFromEstimate } from "@/lib/checklistEstimateBuild";
import { getAdminIdentity } from "@/lib/adminSession";
import { checkRateLimit } from "@/lib/siteLinkRateLimit";
import { extractChecklistFromDocx, extractChecklistFromPdf, MAX_UPLOAD_BYTES } from "@/lib/checklistDocumentExtract";
import { setPhotosShownToCustomer } from "@/lib/pg/crew-photos";

// The extractTemplateFromDocument and buildFromEstimate actions call the
// Claude API, which can take a minute or more on a long document or scope.
export const maxDuration = 120;

/** "Build from estimate": at most this many AI runs per staff member per minute. */
const ESTIMATE_BUILDS_PER_MINUTE = 5;

function parseTabId(value: unknown): number | null {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export async function GET(request: NextRequest) {
  try {
    const accountId = new URL(request.url).searchParams.get("accountId")?.trim() ?? "";
    if (!accountId) {
      return NextResponse.json({ success: false, error: "accountId is required." }, { status: 400 });
    }

    const account = await getMainAccountById(accountId);
    const template = await getTemplateByAccountId(accountId);
    // Crew Link tabs: every template keeps at least one tab.
    const tabs = template ? await ensureFirstTab(accountId) : [];

    return NextResponse.json({
      success: true,
      checklistNeeded: account?.checklistNeeded ?? false,
      template,
      tabs,
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Failed to load checklist template." },
      { status: 500 }
    );
  }
}

async function handlePost(request: NextRequest) {
  try {
    const body = await request.json();
    const action = typeof body.action === "string" && body.action ? body.action : "";
    const accountId = String(body.accountId ?? "").trim();

    if (!accountId) {
      return NextResponse.json({ success: false, error: "accountId is required." }, { status: 400 });
    }

    if (action === "ensureTemplate") {
      const accountName = String(body.accountName ?? accountId);
      const template = await ensureTemplate(accountId, accountName);
      const tabs = await ensureFirstTab(accountId);
      return NextResponse.json({ success: true, template, tabs });
    }

    // Crew Link tabs: add / rename / reorder / delete. Each returns the
    // account's active tabs in order. Uploads and saves below take a tabId
    // and replace ONLY that tab.
    if (action === "addTab") {
      const name = cleanTabName(body.name);
      if (!name) return NextResponse.json({ success: false, error: "Tab name is required." }, { status: 400 });
      await ensureTemplate(accountId, String(body.accountName ?? accountId));
      const tabs = await addTab(accountId, name);
      return NextResponse.json({ success: true, tabs });
    }

    if (action === "renameTab") {
      const tabId = parseTabId(body.tabId);
      const name = cleanTabName(body.name);
      if (!tabId) return NextResponse.json({ success: false, error: "tabId is required." }, { status: 400 });
      if (!name) return NextResponse.json({ success: false, error: "Tab name is required." }, { status: 400 });
      const tabs = await renameTab(accountId, tabId, name);
      return NextResponse.json({ success: true, tabs });
    }

    if (action === "reorderTabs") {
      const tabIds = Array.isArray(body.tabIds) ? body.tabIds.map(parseTabId) : [];
      if (tabIds.length === 0 || tabIds.some((id: number | null) => id === null)) {
        return NextResponse.json({ success: false, error: "tabIds must be a list of tab ids." }, { status: 400 });
      }
      const tabs = await reorderTabs(accountId, tabIds as number[]);
      return NextResponse.json({ success: true, tabs });
    }

    if (action === "deleteTab") {
      const tabId = parseTabId(body.tabId);
      if (!tabId) return NextResponse.json({ success: false, error: "tabId is required." }, { status: 400 });
      const tabs = await deleteTab(accountId, tabId);
      return NextResponse.json({ success: true, tabs });
    }

    // Crew Link (docs/crew-link-spec.md): the two new module switches —
    // Postgres only. The Checklist switch stays the Sheets "Checklist
    // Needed" flag, saved through the account edit form exactly as before.
    if (action === "setCrewLinkModules") {
      const accountName = String(body.accountName ?? accountId);
      const template = await setCrewLinkModules(accountId, accountName, {
        supplyOrders: body.supplyOrders === true,
        problemReports: body.problemReports === true,
      });
      return NextResponse.json({ success: true, template });
    }

    // "Show crew photos to customer" (the customer portal's Photos, lib/pg/crew-photos.ts).
    if (action === "setShowPhotosToCustomer") {
      await setPhotosShownToCustomer(accountId, body.on === true);
      return NextResponse.json({ success: true, on: body.on === true });
    }

    if (action === "saveTemplate") {
      const tabId = parseTabId(body.tabId);
      if (!tabId) return NextResponse.json({ success: false, error: "tabId is required." }, { status: 400 });
      const locationName = String(body.locationName ?? "");
      const validation = validateSections(body.sections);
      if (!validation.ok) {
        return NextResponse.json({ success: false, error: validation.error }, { status: 400 });
      }
      const { template, tabs } = await saveTabSections(accountId, tabId, locationName, validation.sections);
      return NextResponse.json({ success: true, template, tabs });
    }

    if (action === "uploadTemplate") {
      const tabId = parseTabId(body.tabId);
      if (!tabId) return NextResponse.json({ success: false, error: "tabId is required." }, { status: 400 });
      const filename = String(body.filename ?? "upload.csv");
      const fileText = String(body.fileText ?? "");
      const parsed = parseUploadedChecklistFile(fileText, filename);
      if (!parsed.ok) {
        return NextResponse.json({ success: false, error: parsed.error }, { status: 400 });
      }

      // Make sure a template row exists before we try to update it (e.g. the
      // very first save for a newly-flagged account).
      const accountName = String(body.accountName ?? accountId);
      await ensureTemplate(accountId, accountName);

      const existing = await getTemplateByAccountId(accountId);
      const locationName = String(body.locationName ?? existing?.locationName ?? accountName);
      const { template, tabs } = await saveTabSections(accountId, tabId, locationName, parsed.sections);
      return NextResponse.json({ success: true, template, tabs });
    }

    // "Build from estimate" (lib/checklistEstimateBuild.ts): the pasted
    // scope + crew size → one tab per person, as a preview. Never saves.
    if (action === "buildFromEstimate") {
      const who = await getAdminIdentity(request);
      if (!who) return NextResponse.json({ success: false, error: "Log in first." }, { status: 401 });
      if (!(await checkRateLimit(`checklist-estimate:${who.accountId}`, ESTIMATE_BUILDS_PER_MINUTE))) {
        return NextResponse.json({ success: false, error: "That is a lot of checklists in one minute. Wait a minute, then try again." }, { status: 429 });
      }
      const result = await buildChecklistFromEstimate(String(body.scope ?? ""), Number(body.crewSize));
      if (!result.ok) return NextResponse.json({ success: false, error: result.error }, { status: 422 });
      return NextResponse.json({ success: true, preview: { tabs: result.tabs } });
    }

    // "Build from estimate" → Save: each tab is saved by name. A new name
    // adds a tab; a name the account already has replaces that tab's
    // checklist, but only with replace: true (else 409 with the names, so the
    // screen can ask "Replace it?"). An existing tab with no items is
    // replaced without asking. Same checks as the editor's Save.
    if (action === "saveBuiltTabs") {
      const input: unknown[] = Array.isArray(body.tabs) ? body.tabs : [];
      if (input.length === 0) return NextResponse.json({ success: false, error: "There is nothing to save." }, { status: 400 });
      const built: { name: string; sections: ChecklistSectionDef[] }[] = [];
      for (const entry of input) {
        const tab = (entry && typeof entry === "object" ? entry : {}) as { name?: unknown; sections?: unknown };
        const name = cleanTabName(tab.name);
        if (!name) return NextResponse.json({ success: false, error: "Every tab needs a name." }, { status: 400 });
        const valid = validateSections(tab.sections);
        if (!valid.ok) return NextResponse.json({ success: false, error: `${name}: ${valid.error}` }, { status: 400 });
        built.push({ name, sections: valid.sections });
      }
      if (new Set(built.map((tab) => tab.name.trim().toLowerCase())).size !== built.length) {
        return NextResponse.json({ success: false, error: "Two tabs have the same name. Give each tab its own name." }, { status: 400 });
      }

      const result = await saveTabsByName({
        accountId,
        accountName: String(body.accountName ?? accountId),
        locationName: body.locationName === undefined ? undefined : String(body.locationName),
        tabs: built,
        replace: body.replace === true,
      });
      if (!result.ok) return NextResponse.json({ success: false, error: result.error, conflicts: result.conflicts }, { status: result.conflicts ? 409 : 400 });
      return NextResponse.json({ success: true, template: result.template, tabs: result.tabs, firstTabId: result.firstTabId });
    }

    // CW Now "Copy from another account": every tab with items on the other
    // account, by name, the same way as Build from estimate's Save
    // ("Replace it?" for names this account already has, with items).
    if (action === "copyTabsFrom") {
      const fromAccountId = String(body.fromAccountId ?? "").trim();
      if (!fromAccountId || fromAccountId === accountId) return NextResponse.json({ success: false, error: "Pick another account to copy from." }, { status: 400 });
      const source = (await listActiveTabs(fromAccountId)).filter((tab) => tab.sections.some((section) => section.items.length > 0));
      if (source.length === 0) return NextResponse.json({ success: false, error: "That account has no checklist to copy." }, { status: 400 });
      const result = await saveTabsByName({
        accountId,
        accountName: String(body.accountName ?? accountId),
        tabs: source.map((tab) => ({ name: tab.name, sections: tab.sections })),
        replace: body.replace === true,
      });
      if (!result.ok) return NextResponse.json({ success: false, error: result.error, conflicts: result.conflicts }, { status: result.conflicts ? 409 : 400 });
      return NextResponse.json({ success: true, template: result.template, tabs: result.tabs, firstTabId: result.firstTabId, copied: source.length });
    }

    // CW Now setup: the checklist is in, so the account's "Checklist Needed"
    // goes on (the same flag as the Edit page's Crew Link box).
    if (action === "turnOnChecklist") {
      await setAccountChecklistNeeded(accountId, true);
      return NextResponse.json({ success: true });
    }

    if (action === "extractTemplateFromDocument") {
      // Read-only against checklist_templates — this never saves anything.
      // The client shows the result as a preview and only reaches
      // saveTemplate (above) once staff explicitly applies and saves it.
      const filename = String(body.filename ?? "").trim();
      const fileBase64 = String(body.fileBase64 ?? "");
      const mimeType = String(body.mimeType ?? "");

      if (!filename || !fileBase64) {
        return NextResponse.json({ success: false, error: "filename and fileBase64 are required." }, { status: 400 });
      }

      const buffer = Buffer.from(fileBase64, "base64");
      if (buffer.length > MAX_UPLOAD_BYTES) {
        return NextResponse.json(
          {
            success: false,
            error: `This file is too large (max ${Math.floor(MAX_UPLOAD_BYTES / (1024 * 1024))} MB) — try exporting a smaller or simpler version.`,
          },
          { status: 400 }
        );
      }
      if (buffer.length === 0) {
        return NextResponse.json({ success: false, error: "The uploaded file is empty." }, { status: 400 });
      }

      const isPdf = mimeType === "application/pdf" || filename.toLowerCase().endsWith(".pdf");
      const isDocx =
        mimeType.includes("wordprocessingml") ||
        filename.toLowerCase().endsWith(".docx");

      if (!isPdf && !isDocx) {
        return NextResponse.json(
          { success: false, error: "Only .pdf and .docx files are supported for document extraction." },
          { status: 400 }
        );
      }

      const result = isPdf
        ? await extractChecklistFromPdf(fileBase64, filename)
        : await extractChecklistFromDocx(buffer, filename);

      if (!result.ok) {
        return NextResponse.json({ success: false, error: result.error }, { status: 422 });
      }

      return NextResponse.json({
        success: true,
        preview: { locationName: result.locationName, sections: result.sections },
      });
    }

    return NextResponse.json({ success: false, error: `Unknown action "${action}".` }, { status: 400 });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Failed to save checklist template." },
      { status: 500 }
    );
  }
}

// Any successful save may add or change crew-facing text → ES/PT for the new texts (after the response; lib/crewTranslations.ts).
export async function POST(request: NextRequest) {
  const response = await handlePost(request);
  if (response.ok) scheduleCrewTranslations();
  return response;
}
