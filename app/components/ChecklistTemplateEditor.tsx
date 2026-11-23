"use client";

// The account's CW Now card (Crew Link), on the account page and the CW Now
// page. Compact: one status line and one big button.
//   Not set up  → "Set up CW Now": the 3-step wizard (CwNowSetup).
//   Set up      → "Maria ✓ sent · Jose ✓ sent · Last used last night ✓",
//                 then Send (WhatsApp each person, CrewPeople), Crew list,
//                 and Edit checklist (tabs, Build from estimate, upload, the
//                 sections editor).
//   More options (closed): the link for everyone with Text / Copy / Print QR
//   sign, crew photos to customer, translations, supplies, orders & problems.

import CrewTranslationsReview from "./CrewTranslationsReview";
import { useEffect, useState } from "react";
import Image from "next/image";
import {
  MAX_TABS,
  MAX_TAB_NAME_LENGTH,
  cleanTabName,
  countTabItems,
  validateSections,
  parseUploadedChecklistFile,
  type ChecklistSectionDef,
  type ChecklistTabDef,
} from "@/lib/checklistTemplate";
import CrewLinkShare from "@/app/components/CrewLinkShare";
import ChecklistSectionsEditor, { makeEmptySection, moveInArray } from "@/app/components/ChecklistSectionsEditor";
import ChecklistEstimateBuilder from "@/app/components/ChecklistEstimateBuilder";
import AccountSupplies from "@/app/components/AccountSupplies";
import CrewPeople from "@/app/components/CrewPeople";
import CwNowSetup, { type SetupStep } from "@/app/components/CwNowSetup";
import CwNowShift from "@/app/components/CwNowShift";
import { checklistStatusWords } from "@/lib/cwNowHelp";
import { whenShort, type CrewPeopleData } from "@/lib/crewLinkPeople";
import { OrdersAndProblems } from "@/app/accounts/[id]/team-hub-tab";
import CwNowPhotoChecklist from "@/app/components/CwNowPhotoChecklist";
import type { CrewScreen } from "@/lib/photoChecklist";

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
    showPhotosToCustomer?: boolean;
  } | null;
  tabs?: ChecklistTabDef[];
};

export type ChecklistTemplateEditorProps = {
  accountId: string;
  accountName: string;
  /** The CW Now page's "Set up" button: open the setup wizard right away. */
  startSetup?: boolean;
};

// Mirrors MAX_UPLOAD_BYTES in lib/checklistDocumentExtract.ts — checked here
// too so an oversized file never even reaches the network.
const MAX_DOCUMENT_BYTES = 3 * 1024 * 1024;

export default function ChecklistTemplateEditor({ accountId, accountName, startSetup = false }: ChecklistTemplateEditorProps) {
  const [loading, setLoading] = useState(true);
  // Later loads (after the setup wizard's step 1) keep the card on screen.
  const [loadedOnce, setLoadedOnce] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const reload = () => setReloadKey((key) => key + 1);
  const [people, setPeople] = useState<CrewPeopleData>({ ready: true, people: [], lastUsedAt: "" });
  const [panel, setPanel] = useState<"" | "send" | "crew" | "shift" | "edit">("");
  // Scheduled cleanings since the last checklist, for the status line.
  const [missedDays, setMissedDays] = useState<number | null>(null);
  useEffect(() => {
    let alive = true;
    fetch(`/api/crew-link/shift?accountId=${encodeURIComponent(accountId)}&status=1`, { cache: "no-store" })
      .then((response) => response.json())
      .then((data: { missedDays?: number | null }) => alive && setMissedDays(data.missedDays ?? null))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [accountId, reloadKey]);
  const [setupStep, setSetupStep] = useState<SetupStep | null>(startSetup ? 1 : null);
  const [moreOpen, setMoreOpen] = useState(false);
  const [formatHelp, setFormatHelp] = useState(false);
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
  // "Show crew photos to customer": on by default.
  const [showPhotos, setShowPhotos] = useState(true);
  const [savingPhotos, setSavingPhotos] = useState(false);
  // The crew screen (CwNowPhotoChecklist): on the Photo Checklist each item shows "Photo required?".
  const [crewScreen, setCrewScreen] = useState<CrewScreen>("classic");
  const [extracting, setExtracting] = useState(false);
  // "Build from estimate" (ChecklistEstimateBuilder).
  const [builderOpen, setBuilderOpen] = useState(false);
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
        // The crew list and when the crew last sent a checklist (status line, Send).
        void fetch(`/api/crew-link/people?accountId=${encodeURIComponent(accountId)}`, { cache: "no-store" })
          .then((r) => r.json())
          .then((reply: { success?: boolean } & CrewPeopleData) => {
            if (!cancelled && reply.success) setPeople({ ready: reply.ready, people: reply.people ?? [], lastUsedAt: reply.lastUsedAt ?? "" });
          })
          .catch(() => undefined);
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
        setShowPhotos(data.template?.showPhotosToCustomer !== false);
        if (!data.checklistNeeded && !ordersOn && !problemsOn) {
          // Not set up: nothing is made yet. What is there (an old checklist) still shows in the wizard.
          if (data.template) {
            setPorterCode(data.template.porterCode);
            setLocationName(data.template.locationName || accountName);
            applyTabs(data.tabs ?? [], null);
          }
          return;
        }

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
        if (!cancelled) {
          setLoading(false);
          setLoadedOnce(true);
        }
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [accountId, accountName, reloadKey]);

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
  // "Close preview" comes back to this page.
  const previewHref =
    typeof window !== "undefined" && porterCode
      ? `/crew-link/preview/${encodeURIComponent(porterCode)}?back=${encodeURIComponent(window.location.pathname + window.location.search)}`
      : "";

  const place = locationName || accountName;

  function addSection() {
    setSections((prev) => [...prev, makeEmptySection()]);
  }

  if (loading && !loadedOnce) {
    return <p className="text-sm text-slate-500">Loading CW Now…</p>;
  }

  const totalItems = tabs.reduce((sum, tab) => sum + countTabItems(tab), 0);
  // Set up = the crew has something to open: a checklist with items, or orders / problems.
  const checklistLive = checklistNeeded && totalItems > 0;
  const setUp = checklistLive || supplyOrdersEnabled || problemReportsEnabled;
  const usedText = people.lastUsedAt ? `Last used ${whenShort(people.lastUsedAt)} ✓` : setUp ? "Not used yet" : "";
  const peopleText = people.people.map((person) => `${person.name}${person.lastSentAt ? " ✓ sent" : ""}`).join(" · ");
  const status = checklistLive ? checklistStatusWords({ crew: people.people.length, lastDoneText: people.lastUsedAt ? whenShort(people.lastUsedAt) : "", missedDays }) : null;
  const statusLine = !setUp
    ? "No checklist yet"
    : status
      ? status.text
      : [peopleText || (people.ready ? "No crew list yet" : ""), usedText].filter(Boolean).join(" · ");

  async function checklistIn() {
    const response = await fetch("/api/checklist-templates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "turnOnChecklist", accountId }),
    });
    const data = (await response.json().catch(() => ({}))) as { success?: boolean; error?: string };
    if (!response.ok || !data.success) throw new Error(data.error || "The checklist did not turn on. Try again.");
    reload();
  }

  const bigButton = "flex min-h-[64px] w-full items-center justify-center gap-3 rounded-2xl px-4 text-xl font-black shadow-sm";
  const panelButton = (key: "send" | "crew" | "shift" | "edit", label: string, icon: string, main = false) => (
    <button
      type="button"
      onClick={() => {
        if (panel === "edit" && key !== "edit" && !okToLeaveTab()) return;
        setPanel(panel === key ? "" : key);
      }}
      aria-expanded={panel === key}
      className={`${bigButton} ${main ? "bg-green-600 text-white hover:bg-green-700" : panel === key ? "bg-blue-600 text-white" : "bg-white text-slate-800 ring-2 ring-slate-300 hover:bg-slate-50"}`}
    >
      <span className="text-2xl" aria-hidden="true">{icon}</span> {label}
    </button>
  );

  return (
    <div className="space-y-4">
      {/* The card, compact: one status line, one big button. */}
      <div className="flex items-center gap-3" data-cw-tour="account">
        <Image src="/logo-CW-single-phone-optimized.png" alt="Cleaning World" width={32} height={32} className="h-8 w-8 object-contain" />
        <div className="min-w-0">
          <h2 className="text-xl font-black text-slate-950">CW Now</h2>
          <p className={`mt-0.5 text-base font-bold ${status?.warn ? "text-amber-700" : setUp ? "text-green-800" : "text-slate-500"}`} data-cw-status>{statusLine}</p>
        </div>
      </div>

      {error ? <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</p> : null}
      {savedMessage ? <p className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm font-semibold text-green-800">{savedMessage}</p> : null}

      {setupStep ? (
        <CwNowSetup
          step={setupStep}
          onStep={setSetupStep}
          accountId={accountId}
          accountName={accountName}
          placeName={place}
          baseUrl={porterUrl}
          tabs={tabs}
          people={people}
          onPeopleChange={setPeople}
          onChecklistIn={checklistIn}
          onClose={() => setSetupStep(null)}
        />
      ) : !setUp ? (
        <div className="space-y-3 rounded-2xl border-2 border-dashed border-green-400 bg-green-50 p-5 text-center" data-cw-empty>
          <p className="text-2xl font-black text-slate-900">No checklist yet</p>
          <p className="text-lg font-semibold text-slate-600">Make one in 2 minutes</p>
          <button type="button" onClick={() => setSetupStep(1)} className={`${bigButton} min-h-[72px] bg-green-600 text-white hover:bg-green-700`}>
            <span className="text-2xl" aria-hidden="true">🚀</span> Make a checklist
          </button>
        </div>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {panelButton("send", "Send", "💬", true)}
            {panelButton("crew", "Crew list", "👥")}
            {checklistLive ? panelButton("shift", "Shift", "⏰") : null}
            {checklistNeeded ? panelButton("edit", "Edit checklist", "✏️") : null}
          </div>
          {!checklistLive ? (
            <button type="button" onClick={() => setSetupStep(1)} className="text-sm font-bold text-blue-700 underline">
              Add a checklist
            </button>
          ) : null}

          {panel === "send" ? (
            <CrewPeople accountId={accountId} placeName={place} baseUrl={porterUrl} tabs={tabs} data={people} onChange={setPeople} mode="send" />
          ) : null}
          {panel === "send" && people.ready && people.people.length === 0 ? (
            <button type="button" onClick={() => setPanel("crew")} className="text-sm font-bold text-blue-700 underline">
              Add people to the crew list first
            </button>
          ) : null}

          {panel === "shift" ? <CwNowShift accountId={accountId} /> : null}

          {panel === "crew" ? (
            <CrewPeople accountId={accountId} placeName={place} baseUrl={porterUrl} tabs={tabs} data={people} onChange={setPeople} mode="people" />
          ) : null}

          {panel === "edit" && checklistNeeded ? (
            <>
              {/* The real crew screens, admin-only, where nothing sent is saved (app/crew-link/preview). */}
              {previewHref ? (
                <a
                  href={previewHref}
                  // The preview shows what is saved; unsaved checklist edits would be lost.
                  onClick={(event) => {
                    if (!okToLeaveTab()) event.preventDefault();
                  }}
                  className="flex min-h-[64px] w-full items-center justify-center gap-3 rounded-2xl bg-yellow-300 px-4 text-xl font-black text-slate-900 shadow-sm hover:bg-yellow-200"
                >
                  <span className="text-2xl" aria-hidden="true">👀</span> See what the crew sees
                </a>
              ) : null}

              {/* Paste the estimate's scope of work → one tab per person, no files or code. */}
              <button
                type="button"
                onClick={() => {
                  if (okToLeaveTab()) setBuilderOpen(true);
                }}
                className="flex min-h-[64px] w-full items-center justify-center gap-3 rounded-2xl bg-green-600 px-4 text-xl font-black text-white shadow-sm hover:bg-green-700"
              >
                <span className="text-2xl" aria-hidden="true">📋</span> Build from estimate
              </button>
              <ChecklistEstimateBuilder
                open={builderOpen}
                accountId={accountId}
                accountName={accountName}
                locationName={locationName || accountName}
                onClose={() => setBuilderOpen(false)}
                onSaved={(next, firstTabId, message) => {
                  setBuilderOpen(false);
                  applyTabs(next, firstTabId);
                  setError("");
                  setSavedMessage(message);
                }}
              />

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
                    <a
                      href={`/crew-link/print/blank/${encodeURIComponent(accountId)}/${activeTab.id}`}
                      target="_blank"
                      rel="noopener"
                      title={hasUnsavedEdits ? "Prints the last saved version — save your changes first." : undefined}
                      className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-black text-slate-700 hover:bg-slate-50"
                    >
                      🖨️ Print blank
                    </a>
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
                <div className="flex flex-wrap items-center gap-2">
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
                  {/* The long file-format explanation, only when asked for. */}
                  <button
                    type="button"
                    onClick={() => setFormatHelp((v) => !v)}
                    aria-expanded={formatHelp}
                    aria-label="What files can I upload?"
                    className="h-8 w-8 rounded-full border-2 border-slate-300 text-sm font-black text-slate-600 hover:bg-slate-50"
                  >
                    ?
                  </button>
                </div>
                {formatHelp ? (
                  <p className="mt-1 text-xs text-slate-500">
                    CSV columns: section, item, sub_note — or a JSON array of {"{"}section, item, sub_note{"}"} objects, or a simple {"{"} &quot;title&quot;, &quot;instructions&quot;, &quot;sections&quot;: [{"{"} &quot;name&quot;, &quot;items&quot; {"}"}] {"}"} file (the instructions become a first &quot;Rules&quot; section, shown to the crew as a notice) — replaces only this tab&apos;s checklist in one step.
                    A PDF or Word document is read and interpreted by AI, then shown below for you to review before it is applied.
                    Have a Google Doc? File → Download → Word (.docx) or PDF, then upload here.
                  </p>
                ) : null}
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

              <ChecklistSectionsEditor sections={sections} onChange={setSections} photoMode={crewScreen === "photo"} />

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
      )}

      {/* Crew screen (Classic / Photo Checklist) and the Photo Checklist's Work reports. */}
      {/* Hidden while the wizard is open: it has its own Normal / Photo step, and this reloads the saved choice after. */}
      {checklistLive && !setupStep ? <CwNowPhotoChecklist accountId={accountId} accountName={accountName} onScreenChange={setCrewScreen} /> : null}

      {/* Everything else, out of the way. */}
      {porterCode || setUp ? (
        <div className="rounded-2xl border border-slate-200">
          <button
            type="button"
            onClick={() => setMoreOpen((v) => !v)}
            aria-expanded={moreOpen}
            className="flex min-h-[52px] w-full items-center justify-between px-4 text-left text-base font-black text-slate-700"
          >
            More options <span className="text-sm font-semibold text-slate-500">{moreOpen ? "Hide" : "Show"}</span>
          </button>
          {moreOpen ? (
            <div className="space-y-4 border-t border-slate-200 p-4">
              <div className="grid gap-4 rounded-2xl bg-slate-50 p-4 sm:grid-cols-2">
                {checklistNeeded ? (
                  <label className="block">
                    <span className="text-[11px] font-black uppercase tracking-wide text-slate-400">Location Name</span>
                    <input
                      value={locationName}
                      onChange={(event) => setLocationName(event.target.value)}
                      className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                    />
                    <span className="mt-1 block text-xs text-slate-400">Saved with Edit checklist → Save.</span>
                  </label>
                ) : null}
                <div>
                  <span className="text-[11px] font-black uppercase tracking-wide text-slate-400">The crew link (everyone)</span>
                  <input readOnly value={porterUrl} className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600" />
                </div>
              </div>

              {/* The one link for everyone: Text / Copy / Print QR sign, as before. */}
              <CrewLinkShare accountId={accountId} placeName={place} url={porterUrl} />

              {/* Crew photos ("Send photos" on the crew screen) in the customer portal. */}
              <div className="space-y-2 rounded-2xl border border-slate-200 p-4">
                <label className="flex min-h-[48px] items-center gap-3">
                  <input
                    type="checkbox"
                    className="h-6 w-6"
                    checked={showPhotos}
                    disabled={savingPhotos}
                    onChange={async (event) => {
                      const on = event.target.checked;
                      setSavingPhotos(true);
                      setError("");
                      try {
                        const response = await fetch("/api/checklist-templates", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "setShowPhotosToCustomer", accountId, on }) });
                        const data = (await response.json().catch(() => ({}))) as { success?: boolean; error?: string };
                        if (!response.ok || data.success === false) throw new Error(data.error || "That did not save.");
                        setShowPhotos(on);
                      } catch (err) {
                        setError(err instanceof Error ? err.message : "That did not save.");
                      } finally {
                        setSavingPhotos(false);
                      }
                    }}
                  />
                  <span className="text-base font-black text-slate-900">Show crew photos to customer</span>
                </label>
                <p className="text-sm text-slate-500">
                  In their customer portal, under Photos. A photo the crew tagged Problem starts hidden. Hide or show any one photo on{" "}
                  <a className="font-bold text-blue-700 underline" href={`/photos?account=${encodeURIComponent(accountName)}&accountId=${encodeURIComponent(accountId)}`}>
                    this account&apos;s Photos
                  </a>
                  .
                </p>
              </div>

              {checklistNeeded ? <CrewTranslationsReview accountId={accountId} /> : null}

              {/* Which catalog items this account's crew can order. */}
              {supplyOrdersEnabled ? <AccountSupplies accountId={accountId} accountName={accountName} /> : null}

              {supplyOrdersEnabled || problemReportsEnabled ? (
                <OrdersAndProblems crewLinkAccountId={accountId} accountId={accountId} accountName={accountName} />
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
