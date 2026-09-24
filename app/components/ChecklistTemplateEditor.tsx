"use client";

import CrewTranslationsReview from "./CrewTranslationsReview";
import { useEffect, useState } from "react";
import Image from "next/image";
import {
  MAX_TABS,
  MAX_TAB_NAME_LENGTH,
  cleanTabName,
  countTabItems,
  slugifyKey,
  validateSections,
  parseUploadedChecklistFile,
  type ChecklistSectionDef,
  type ChecklistItemDef,
  type ChecklistTabDef,
} from "@/lib/checklistTemplate";
import CrewLinkShare from "@/app/components/CrewLinkShare";
import { OrdersAndProblems } from "@/app/accounts/[id]/team-hub-tab";

type TemplateApiResponse = {
  success?: boolean;
  error?: string;
  checklistNeeded?: boolean;
  template?: {
    accountId: string;
    accountName: string;
    locationName: string;
    porterCode: string;
    sections: ChecklistSectionDef[];
    supplyOrdersEnabled?: boolean;
    problemReportsEnabled?: boolean;
  } | null;
  tabs?: ChecklistTabDef[];
};

export type ChecklistTemplateEditorProps = {
  accountId: string;
  accountName: string;
};

function makeEmptySection(): ChecklistSectionDef {
  return { key: slugifyKey(`section-${Date.now()}`), title: "New Section", items: [] };
}

function makeEmptyItem(): ChecklistItemDef {
  return { key: `${slugifyKey(`item-${Date.now()}-${Math.random()}`)}`, label: "New item", subNote: "" };
}

// Mirrors MAX_UPLOAD_BYTES in lib/checklistDocumentExtract.ts — checked here
// too so an oversized file never even reaches the network.
const MAX_DOCUMENT_BYTES = 3 * 1024 * 1024;

function moveInArray<T>(arr: T[], index: number, direction: -1 | 1): T[] {
  const target = index + direction;
  if (target < 0 || target >= arr.length) return arr;
  const next = [...arr];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

export default function ChecklistTemplateEditor({ accountId, accountName }: ChecklistTemplateEditorProps) {
  const [loading, setLoading] = useState(true);
  const [checklistNeeded, setChecklistNeeded] = useState(false);
  const [porterCode, setPorterCode] = useState("");
  const [locationName, setLocationName] = useState("");
  // Crew Link tabs: `tabs` is what's saved; `sections` is the editor's
  // working copy of the active tab. Save/upload replace ONLY the active tab.
  const [tabs, setTabs] = useState<ChecklistTabDef[]>([]);
  const [activeTabId, setActiveTabId] = useState(0);
  const [sections, setSections] = useState<ChecklistSectionDef[]>([]);
  const [tabNameDraft, setTabNameDraft] = useState("");
  const [newTabName, setNewTabName] = useState("");
  const [confirmDeleteTab, setConfirmDeleteTab] = useState(false);
  const [tabBusy, setTabBusy] = useState(false);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [savedMessage, setSavedMessage] = useState("");
  // Crew Link (docs/crew-link-spec.md): the other two modules, switched on
  // from the account edit page. The checklist itself stays on checklistNeeded.
  const [supplyOrdersEnabled, setSupplyOrdersEnabled] = useState(false);
  const [problemReportsEnabled, setProblemReportsEnabled] = useState(false);
  const [collapsed, setCollapsed] = useState(true);
  const [extracting, setExtracting] = useState(false);
  const [extractPreview, setExtractPreview] = useState<{
    locationName: string;
    sections: ChecklistSectionDef[];
  } | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!accountId) return;
      setLoading(true);
      setError("");
      try {
        const response = await fetch(`/api/checklist-templates?accountId=${encodeURIComponent(accountId)}`, {
          cache: "no-store",
        });
        const data = (await response.json()) as TemplateApiResponse;
        if (!response.ok || data.success === false) {
          throw new Error(data.error ?? "Could not load checklist template.");
        }
        if (cancelled) return;

        setChecklistNeeded(Boolean(data.checklistNeeded));
        const ordersOn = data.template?.supplyOrdersEnabled === true;
        const problemsOn = data.template?.problemReportsEnabled === true;
        setSupplyOrdersEnabled(ordersOn);
        setProblemReportsEnabled(problemsOn);
        if (!data.checklistNeeded && !ordersOn && !problemsOn) return;

        let template = data.template ?? null;
        let loadedTabs = data.tabs ?? [];
        if (!template) {
          const ensureResponse = await fetch("/api/checklist-templates", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "ensureTemplate", accountId, accountName }),
          });
          const ensureData = (await ensureResponse.json()) as TemplateApiResponse;
          if (!ensureResponse.ok || ensureData.success === false || !ensureData.template) {
            throw new Error(ensureData.error ?? "Could not create checklist template.");
          }
          template = ensureData.template;
          loadedTabs = ensureData.tabs ?? [];
        }

        if (cancelled) return;
        setPorterCode(template.porterCode);
        setLocationName(template.locationName || accountName);
        applyTabs(loadedTabs, null);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not load checklist template.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [accountId, accountName]);

  // Replaces the saved tab list and opens `preferTabId` (or the first tab)
  // in the editor.
  function applyTabs(next: ChecklistTabDef[], preferTabId: number | null) {
    setTabs(next);
    const target = next.find((tab) => tab.id === preferTabId) ?? next[0];
    setActiveTabId(target?.id ?? 0);
    setSections(target?.sections ?? []);
    setTabNameDraft(target?.name ?? "");
    setConfirmDeleteTab(false);
    setExtractPreview(null);
  }

  const activeTab = tabs.find((tab) => tab.id === activeTabId) ?? null;
  const activeTabLabel = activeTab?.name ?? "this tab";
  const hasUnsavedEdits = activeTab ? JSON.stringify(activeTab.sections) !== JSON.stringify(sections) : false;

  function okToLeaveTab(): boolean {
    return !hasUnsavedEdits || window.confirm("This tab has unsaved changes. Discard them?");
  }

  function selectTab(tabId: number) {
    if (tabId === activeTabId || !okToLeaveTab()) return;
    setError("");
    setSavedMessage("");
    applyTabs(tabs, tabId);
  }

  async function runTabAction(body: Record<string, unknown>): Promise<ChecklistTabDef[] | null> {
    setTabBusy(true);
    setError("");
    setSavedMessage("");
    try {
      const response = await fetch("/api/checklist-templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId, accountName, ...body }),
      });
      const data = (await response.json()) as TemplateApiResponse;
      if (!response.ok || data.success === false || !data.tabs) {
        throw new Error(data.error ?? "Could not update tabs.");
      }
      return data.tabs;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update tabs.");
      return null;
    } finally {
      setTabBusy(false);
    }
  }

  async function handleAddTab() {
    const name = cleanTabName(newTabName);
    if (!name || !okToLeaveTab()) return;
    const next = await runTabAction({ action: "addTab", name });
    if (!next) return;
    const added = next.find((tab) => !tabs.some((old) => old.id === tab.id));
    applyTabs(next, added?.id ?? null);
    setNewTabName("");
    setSavedMessage(`Tab "${name}" added — upload or build its checklist below.`);
  }

  // Rename/reorder only change the tab list — unsaved edits to the active
  // tab stay in the editor.
  async function handleRenameTab() {
    const name = cleanTabName(tabNameDraft);
    if (!activeTab || !name || name === activeTab.name) return;
    const next = await runTabAction({ action: "renameTab", tabId: activeTab.id, name });
    if (!next) return;
    setTabs(next);
    setSavedMessage("Tab renamed.");
  }

  async function handleMoveTab(direction: -1 | 1) {
    const index = tabs.findIndex((tab) => tab.id === activeTabId);
    const reordered = moveInArray(tabs, index, direction);
    if (reordered === tabs) return;
    const next = await runTabAction({ action: "reorderTabs", tabIds: reordered.map((tab) => tab.id) });
    if (next) setTabs(next);
  }

  async function handleDeleteTab() {
    if (!activeTab) return;
    const deletedName = activeTab.name;
    const next = await runTabAction({ action: "deleteTab", tabId: activeTab.id });
    setConfirmDeleteTab(false);
    if (!next) return;
    applyTabs(next, null);
    setSavedMessage(`Tab "${deletedName}" deleted. Its past submissions are kept.`);
  }

  async function handleSave() {
    setSaving(true);
    setError("");
    setSavedMessage("");
    try {
      const validation = validateSections(sections);
      if (!validation.ok) {
        throw new Error(validation.error);
      }
      const response = await fetch("/api/checklist-templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "saveTemplate", accountId, tabId: activeTabId, locationName, sections }),
      });
      const data = (await response.json()) as TemplateApiResponse;
      if (!response.ok || data.success === false || !data.template || !data.tabs) {
        throw new Error(data.error ?? "Could not save checklist template.");
      }
      applyTabs(data.tabs, activeTabId);
      setLocationName(data.template.locationName);
      setSavedMessage("Template saved.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save checklist template.");
    } finally {
      setSaving(false);
    }
  }

  // PDF/DOCX go through server-side extraction + an LLM structuring step,
  // which is inherently interpretive (unlike deterministic CSV/JSON
  // parsing) — so the result is shown as a preview for staff to review and
  // explicitly apply, never saved directly. See handleApplyExtractPreview.
  async function handleDocumentFileSelected(file: File) {
    setError("");
    setSavedMessage("");
    setExtractPreview(null);

    if (file.size > MAX_DOCUMENT_BYTES) {
      setError(
        `This file is too large (max ${Math.floor(MAX_DOCUMENT_BYTES / (1024 * 1024))} MB) — try exporting a smaller or simpler version.`
      );
      return;
    }

    setExtracting(true);
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
        reader.onerror = () => reject(new Error("Could not read the selected file."));
        reader.readAsDataURL(file);
      });
      const base64 = dataUrl.split(",")[1] ?? "";
      if (!base64) throw new Error("Could not read the selected file.");

      const response = await fetch("/api/checklist-templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "extractTemplateFromDocument",
          accountId,
          filename: file.name,
          mimeType: file.type,
          fileBase64: base64,
        }),
      });
      const data = (await response.json()) as TemplateApiResponse & {
        preview?: { locationName: string; sections: ChecklistSectionDef[] };
      };
      if (!response.ok || data.success === false || !data.preview) {
        throw new Error(data.error ?? "Could not extract a checklist from this document.");
      }
      setExtractPreview(data.preview);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not extract a checklist from this document.");
    } finally {
      setExtracting(false);
    }
  }

  function handleApplyExtractPreview() {
    if (!extractPreview) return;
    setSections(extractPreview.sections);
    if (extractPreview.locationName) setLocationName(extractPreview.locationName);
    setExtractPreview(null);
    setSavedMessage("Loaded into the editor below — review, adjust if needed, and click Save Template to publish.");
  }

  function handleDiscardExtractPreview() {
    setExtractPreview(null);
  }

  function handleFileSelected(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = ""; // allow re-selecting the same filename later
    if (!file) return;

    const lowerName = file.name.toLowerCase();
    if (lowerName.endsWith(".pdf") || lowerName.endsWith(".docx")) {
      handleDocumentFileSelected(file);
      return;
    }

    setError("");
    setSavedMessage("");

    const reader = new FileReader();
    reader.onload = async () => {
      const text = typeof reader.result === "string" ? reader.result : "";
      // Validate client-side first so a bad file never even reaches the
      // server, then let the server re-validate (source of truth) before
      // it replaces anything already saved.
      const parsed = parseUploadedChecklistFile(text, file.name);
      if (!parsed.ok) {
        setError(parsed.error);
        return;
      }

      setSaving(true);
      try {
        const response = await fetch("/api/checklist-templates", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "uploadTemplate",
            accountId,
            tabId: activeTabId,
            accountName,
            locationName,
            filename: file.name,
            fileText: text,
          }),
        });
        const data = (await response.json()) as TemplateApiResponse;
        if (!response.ok || data.success === false || !data.template || !data.tabs) {
          throw new Error(data.error ?? "Could not upload checklist.");
        }
        const uploadedTab = data.tabs.find((tab) => tab.id === activeTabId);
        applyTabs(data.tabs, activeTabId);
        setLocationName(data.template.locationName);
        setSavedMessage(`Checklist uploaded to "${uploadedTab?.name ?? "this tab"}" — ${uploadedTab?.sections.length ?? 0} section(s).`);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not upload checklist.");
      } finally {
        setSaving(false);
      }
    };
    reader.onerror = () => setError("Could not read the selected file.");
    reader.readAsText(file);
  }

  const porterUrl =
    typeof window !== "undefined" && porterCode ? `${window.location.origin}/porter/${porterCode}` : "";

  const place = locationName || accountName;

  function updateSectionTitle(sectionIndex: number, title: string) {
    setSections((prev) => prev.map((s, i) => (i === sectionIndex ? { ...s, title } : s)));
  }

  function updateItem(sectionIndex: number, itemIndex: number, patch: Partial<ChecklistItemDef>) {
    setSections((prev) =>
      prev.map((s, i) =>
        i === sectionIndex ? { ...s, items: s.items.map((it, j) => (j === itemIndex ? { ...it, ...patch } : it)) } : s
      )
    );
  }

  function addSection() {
    setSections((prev) => [...prev, makeEmptySection()]);
  }

  function removeSection(sectionIndex: number) {
    setSections((prev) => prev.filter((_, i) => i !== sectionIndex));
  }

  function moveSection(sectionIndex: number, direction: -1 | 1) {
    setSections((prev) => moveInArray(prev, sectionIndex, direction));
  }

  function addItem(sectionIndex: number) {
    setSections((prev) =>
      prev.map((s, i) => (i === sectionIndex ? { ...s, items: [...s.items, makeEmptyItem()] } : s))
    );
  }

  function removeItem(sectionIndex: number, itemIndex: number) {
    setSections((prev) =>
      prev.map((s, i) => (i === sectionIndex ? { ...s, items: s.items.filter((_, j) => j !== itemIndex) } : s))
    );
  }

  function moveItem(sectionIndex: number, itemIndex: number, direction: -1 | 1) {
    setSections((prev) =>
      prev.map((s, i) => (i === sectionIndex ? { ...s, items: moveInArray(s.items, itemIndex, direction) } : s))
    );
  }

  if (loading) {
    return <p className="text-sm text-slate-500">Loading Crew Link…</p>;
  }

  if (!checklistNeeded && !supplyOrdersEnabled && !problemReportsEnabled) {
    return null;
  }

  const moduleNames = [
    checklistNeeded ? "Checklist" : null,
    supplyOrdersEnabled ? "Supply orders" : null,
    problemReportsEnabled ? "Problem reports" : null,
  ].filter(Boolean);

  return (
    <div className="space-y-5">
      <button
        type="button"
        onClick={() => setCollapsed((prev) => !prev)}
        aria-expanded={!collapsed}
        className="flex w-full items-center justify-between gap-4 text-left"
      >
        <div className="flex items-center gap-2">
          <Image src="/logo-CW-single-phone-optimized.png" alt="Cleaning World" width={32} height={32} className="h-8 w-8 object-contain" />
          <div>
            <h2 className="text-xl font-black text-slate-950">Crew Link</h2>
            <p className="mt-1 text-sm text-slate-500">
              {moduleNames.join(" · ")}
              {checklistNeeded
                ? tabs.length > 1
                  ? ` — ${tabs.length} tabs, ${tabs.reduce((sum, tab) => sum + countTabItems(tab), 0)} item(s) in total.`
                  : ` — ${sections.reduce((sum, s) => sum + s.items.length, 0)} item(s) across ${sections.length} section(s).`
                : ""}
            </p>
          </div>
        </div>
        <span className="shrink-0 text-sm font-semibold text-slate-500">{collapsed ? "Show" : "Hide"}</span>
      </button>

      {!collapsed ? (
        <>
          {error ? (
            <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
              {error}
            </p>
          ) : null}
          {savedMessage ? (
            <p className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm font-semibold text-green-800">
              {savedMessage}
            </p>
          ) : null}

          <div className="grid gap-4 rounded-2xl bg-slate-50 p-4 sm:grid-cols-2">
            {checklistNeeded ? (
            <label className="block">
              <span className="text-[11px] font-black uppercase tracking-wide text-slate-400">Location Name</span>
              <input
                value={locationName}
                onChange={(event) => setLocationName(event.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              />
            </label>
            ) : null}
            <div>
              <span className="text-[11px] font-black uppercase tracking-wide text-slate-400">Crew Link</span>
              <input
                readOnly
                value={porterUrl}
                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600"
              />
            </div>
          </div>

          <CrewLinkShare accountId={accountId} placeName={place} url={porterUrl} />

          {checklistNeeded ? <CrewTranslationsReview accountId={accountId} /> : null}

          {supplyOrdersEnabled || problemReportsEnabled ? (
            <OrdersAndProblems crewLinkAccountId={accountId} accountId={accountId} accountName={accountName} />
          ) : null}

          {checklistNeeded ? (
          <>

          <div className="space-y-3 rounded-2xl border border-slate-200 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-[11px] font-black uppercase tracking-wide text-slate-400">
                Checklist Tabs ({tabs.length}/{MAX_TABS})
              </span>
              <span className="text-xs text-slate-400">Crews see a tab bar only when 2 or more tabs have items.</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => selectTab(tab.id)}
                  disabled={tabBusy}
                  className={`rounded-lg px-3 py-2 text-sm font-black ${
                    tab.id === activeTabId
                      ? "bg-blue-600 text-white"
                      : "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                  }`}
                >
                  {tab.name}
                  <span className={tab.id === activeTabId ? "ml-1 text-blue-100" : "ml-1 text-slate-400"}>
                    ({countTabItems(tab)})
                  </span>
                </button>
              ))}
            </div>

            {activeTab ? (
              <div className="flex flex-wrap items-center gap-2">
                <input
                  value={tabNameDraft}
                  onChange={(event) => setTabNameDraft(event.target.value)}
                  maxLength={MAX_TAB_NAME_LENGTH}
                  aria-label="Tab name"
                  className="min-w-0 flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold outline-none focus:border-blue-500"
                />
                <button
                  type="button"
                  onClick={handleRenameTab}
                  disabled={tabBusy || !cleanTabName(tabNameDraft) || cleanTabName(tabNameDraft) === activeTab.name}
                  className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-black text-slate-700 hover:bg-slate-50 disabled:opacity-40"
                >
                  Rename
                </button>
                <button
                  type="button"
                  onClick={() => handleMoveTab(-1)}
                  disabled={tabBusy || tabs[0]?.id === activeTabId}
                  aria-label="Move tab left"
                  className="rounded-lg border border-slate-200 px-2 py-2 text-xs font-bold text-slate-600 disabled:opacity-30"
                >
                  ←
                </button>
                <button
                  type="button"
                  onClick={() => handleMoveTab(1)}
                  disabled={tabBusy || tabs[tabs.length - 1]?.id === activeTabId}
                  aria-label="Move tab right"
                  className="rounded-lg border border-slate-200 px-2 py-2 text-xs font-bold text-slate-600 disabled:opacity-30"
                >
                  →
                </button>
                {confirmDeleteTab ? (
                  <span className="flex flex-wrap items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-2 py-1">
                    <span className="text-xs font-semibold text-red-700">
                      Delete &quot;{activeTab.name}&quot;? Past submissions are kept.
                    </span>
                    <button
                      type="button"
                      onClick={handleDeleteTab}
                      disabled={tabBusy}
                      className="rounded-md bg-red-600 px-2 py-1 text-xs font-black text-white hover:bg-red-500 disabled:opacity-60"
                    >
                      Yes, delete
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmDeleteTab(false)}
                      className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-black text-slate-700"
                    >
                      Cancel
                    </button>
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmDeleteTab(true)}
                    disabled={tabBusy || tabs.length <= 1}
                    title={tabs.length <= 1 ? "Every account keeps at least one tab." : undefined}
                    className="rounded-lg border border-red-200 px-3 py-2 text-xs font-bold text-red-600 hover:bg-red-50 disabled:opacity-40"
                  >
                    Delete Tab
                  </button>
                )}
              </div>
            ) : null}

            <div className="flex flex-wrap items-center gap-2">
              <input
                value={newTabName}
                onChange={(event) => setNewTabName(event.target.value)}
                maxLength={MAX_TAB_NAME_LENGTH}
                placeholder="New tab name (e.g. Supplies, Monday)"
                disabled={tabs.length >= MAX_TABS}
                className="min-w-0 flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-500 disabled:bg-slate-100"
              />
              <button
                type="button"
                onClick={handleAddTab}
                disabled={tabBusy || tabs.length >= MAX_TABS || !cleanTabName(newTabName)}
                className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-black text-slate-700 hover:bg-slate-50 disabled:opacity-40"
              >
                + Add Tab
              </button>
            </div>
          </div>

          <div>
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
              {extracting ? "Reading document…" : `Upload to "${activeTabLabel}" (.csv, .json, .pdf, .docx)`}
              <input
                type="file"
                accept=".csv,.json,.pdf,.docx,text/csv,application/json,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                onChange={handleFileSelected}
                disabled={extracting}
                className="hidden"
              />
            </label>
            <p className="mt-1 text-xs text-slate-400">
              CSV columns: section, item, sub_note — or a JSON array of {"{"}section, item, sub_note{"}"} objects — replaces only this tab&apos;s checklist in one step.
              A PDF or Word document is read and interpreted by AI, then shown below for you to review before it is applied.
              Have a Google Doc? File → Download → Word (.docx) or PDF, then upload here.
            </p>
          </div>

          {extractPreview ? (
            <div className="rounded-2xl border-2 border-indigo-200 bg-indigo-50 p-4">
              <h3 className="text-sm font-black uppercase tracking-wide text-indigo-700">
                Extracted from document — review before applying
              </h3>
              <p className="mt-1 text-sm text-indigo-900">
                {extractPreview.locationName ? `Location: ${extractPreview.locationName} — ` : ""}
                {extractPreview.sections.reduce((sum, s) => sum + s.items.length, 0)} item(s) across{" "}
                {extractPreview.sections.length} section(s). Nothing has been saved yet.
              </p>
              <div className="mt-3 max-h-80 space-y-3 overflow-y-auto rounded-xl bg-white p-3">
                {extractPreview.sections.map((section) => (
                  <div key={section.key}>
                    <p className="text-xs font-black uppercase tracking-wide text-slate-500">{section.title}</p>
                    <ul className="mt-1 space-y-1">
                      {section.items.map((item) => (
                        <li key={item.key} className="text-sm text-slate-700">
                          • {item.label}
                          {item.subNote ? <span className="text-slate-400"> — {item.subNote}</span> : null}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
              <div className="mt-3 flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={handleApplyExtractPreview}
                  className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-black text-white shadow-sm hover:bg-indigo-500"
                >
                  Apply to Editor
                </button>
                <button
                  type="button"
                  onClick={handleDiscardExtractPreview}
                  className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-black text-slate-700 hover:bg-slate-50"
                >
                  Discard
                </button>
              </div>
            </div>
          ) : null}

          <div className="space-y-6">
            {sections.map((section, sectionIndex) => (
              <div key={section.key} className="rounded-2xl border border-slate-200 p-4">
                <div className="flex items-center gap-2">
                  <input
                    value={section.title}
                    onChange={(event) => updateSectionTitle(sectionIndex, event.target.value)}
                    className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm font-black uppercase tracking-wide text-slate-700 outline-none focus:border-blue-500"
                  />
                  <button type="button" onClick={() => moveSection(sectionIndex, -1)} disabled={sectionIndex === 0} className="rounded-lg border border-slate-200 px-2 py-1 text-xs font-bold text-slate-600 disabled:opacity-30">
                    ↑
                  </button>
                  <button type="button" onClick={() => moveSection(sectionIndex, 1)} disabled={sectionIndex === sections.length - 1} className="rounded-lg border border-slate-200 px-2 py-1 text-xs font-bold text-slate-600 disabled:opacity-30">
                    ↓
                  </button>
                  <button type="button" onClick={() => removeSection(sectionIndex)} className="rounded-lg border border-red-200 px-2 py-1 text-xs font-bold text-red-600 hover:bg-red-50">
                    Remove Section
                  </button>
                </div>

                <div className="mt-3 space-y-2">
                  {section.items.map((item, itemIndex) => (
                    <div key={item.key} className="flex items-start gap-2 rounded-xl border border-slate-100 p-2">
                      <div className="flex-1 space-y-1">
                        <input
                          value={item.label}
                          onChange={(event) => updateItem(sectionIndex, itemIndex, { label: event.target.value })}
                          placeholder="Item label"
                          className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold outline-none focus:border-blue-500"
                        />
                        <input
                          value={item.subNote ?? ""}
                          onChange={(event) => updateItem(sectionIndex, itemIndex, { subNote: event.target.value })}
                          placeholder="Optional guidance note for the porter…"
                          className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-600 outline-none focus:border-blue-500"
                        />
                      </div>
                      <div className="flex shrink-0 flex-col gap-1">
                        <button type="button" onClick={() => moveItem(sectionIndex, itemIndex, -1)} disabled={itemIndex === 0} className="rounded-lg border border-slate-200 px-2 py-0.5 text-xs font-bold text-slate-600 disabled:opacity-30">
                          ↑
                        </button>
                        <button type="button" onClick={() => moveItem(sectionIndex, itemIndex, 1)} disabled={itemIndex === section.items.length - 1} className="rounded-lg border border-slate-200 px-2 py-0.5 text-xs font-bold text-slate-600 disabled:opacity-30">
                          ↓
                        </button>
                        <button type="button" onClick={() => removeItem(sectionIndex, itemIndex)} className="rounded-lg border border-red-200 px-2 py-0.5 text-xs font-bold text-red-600 hover:bg-red-50">
                          ✕
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                <button
                  type="button"
                  onClick={() => addItem(sectionIndex)}
                  className="mt-3 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-black text-slate-700 hover:bg-slate-50"
                >
                  + Add Item
                </button>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={addSection}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-black text-slate-700 hover:bg-slate-50"
            >
              + Add Section
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-black text-white shadow-sm hover:bg-blue-500 disabled:opacity-60"
            >
              {saving ? "Saving…" : `Save "${activeTabLabel}"`}
            </button>
          </div>
          </>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
