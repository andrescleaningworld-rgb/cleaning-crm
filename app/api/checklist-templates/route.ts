// Admin-only (default proxy.ts gate — not in PUBLIC_PATHS): loads/edits a
// single account's checklist template. The porter-facing read/submit path
// is app/api/porter-checklist/route.ts instead, which is deliberately
// public and can't reach any of these actions.
import { NextRequest, NextResponse } from "next/server";
import { getMainAccountById } from "@/lib/googleSheets";
import {
  addTab,
  deleteTab,
  ensureFirstTab,
  ensureTemplate,
  getTemplateByAccountId,
  renameTab,
  reorderTabs,
  saveTabSections,
  setCrewLinkModules,
} from "@/lib/checklistDb";
import { cleanTabName, parseUploadedChecklistFile, validateSections } from "@/lib/checklistTemplate";
import { extractChecklistFromDocx, extractChecklistFromPdf, MAX_UPLOAD_BYTES } from "@/lib/checklistDocumentExtract";

// The extractTemplateFromDocument action calls the Claude API, which can
// comfortably exceed the default serverless timeout on a large/slow
// document — matches the budget used elsewhere in this app for slow
// upstream calls.
export const maxDuration = 45;

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

export async function POST(request: NextRequest) {
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
