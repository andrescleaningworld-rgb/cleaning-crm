"use client";

import { useEffect, useState } from "react";
import {
  slugifyKey,
  validateSections,
  parseUploadedChecklistFile,
  type ChecklistSectionDef,
  type ChecklistItemDef,
} from "@/lib/checklistTemplate";

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
  } | null;
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
  const [sections, setSections] = useState<ChecklistSectionDef[]>([]);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [savedMessage, setSavedMessage] = useState("");
  const [shareState, setShareState] = useState<"idle" | "copied">("idle");
  const [collapsed, setCollapsed] = useState(true);

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
        if (!data.checklistNeeded) return;

        let template = data.template ?? null;
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
        }

        if (cancelled) return;
        setPorterCode(template.porterCode);
        setLocationName(template.locationName || accountName);
        setSections(template.sections || []);
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
        body: JSON.stringify({ action: "saveTemplate", accountId, locationName, sections }),
      });
      const data = (await response.json()) as TemplateApiResponse;
      if (!response.ok || data.success === false || !data.template) {
        throw new Error(data.error ?? "Could not save checklist template.");
      }
      setSections(data.template.sections);
      setLocationName(data.template.locationName);
      setSavedMessage("Template saved.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save checklist template.");
    } finally {
      setSaving(false);
    }
  }

  function handleFileSelected(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = ""; // allow re-selecting the same filename later
    if (!file) return;

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
            accountName,
            locationName,
            filename: file.name,
            fileText: text,
          }),
        });
        const data = (await response.json()) as TemplateApiResponse;
        if (!response.ok || data.success === false || !data.template) {
          throw new Error(data.error ?? "Could not upload checklist.");
        }
        setSections(data.template.sections);
        setLocationName(data.template.locationName);
        setSavedMessage(`Checklist uploaded — ${data.template.sections.length} section(s).`);
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

  async function handleShare() {
    if (!porterUrl) return;
    if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
      try {
        await navigator.share({
          title: `${accountName} Porter Checklist`,
          text: `Cleaning checklist link for ${locationName || accountName}`,
          url: porterUrl,
        });
      } catch {
        // AbortError (user closed the share sheet) — not an error worth surfacing.
      }
      return;
    }
    try {
      await navigator.clipboard.writeText(porterUrl);
      setShareState("copied");
      setTimeout(() => setShareState("idle"), 2000);
    } catch {
      setError("Could not copy the link — copy it manually: " + porterUrl);
    }
  }

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
    return <p className="text-sm text-slate-500">Loading porter checklist…</p>;
  }

  if (!checklistNeeded) {
    return null;
  }

  return (
    <div className="space-y-5">
      <button
        type="button"
        onClick={() => setCollapsed((prev) => !prev)}
        aria-expanded={!collapsed}
        className="flex w-full items-center justify-between gap-4 text-left"
      >
        <div>
          <h2 className="text-xl font-black text-slate-950">Porter Checklist</h2>
          <p className="mt-1 text-sm text-slate-500">
            {sections.reduce((sum, s) => sum + s.items.length, 0)} item(s) across {sections.length} section(s).
          </p>
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
            <label className="block">
              <span className="text-[11px] font-black uppercase tracking-wide text-slate-400">Location Name</span>
              <input
                value={locationName}
                onChange={(event) => setLocationName(event.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              />
            </label>
            <div>
              <span className="text-[11px] font-black uppercase tracking-wide text-slate-400">Porter Link</span>
              <div className="mt-1 flex items-center gap-2">
                <input
                  readOnly
                  value={porterUrl}
                  className="w-full min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600"
                />
                <button
                  type="button"
                  onClick={handleShare}
                  disabled={!porterUrl}
                  className="shrink-0 rounded-lg bg-indigo-600 px-3 py-2 text-xs font-black text-white shadow-sm hover:bg-indigo-500 disabled:opacity-60"
                >
                  {shareState === "copied" ? "Copied!" : "Share Link"}
                </button>
              </div>
            </div>
          </div>

          <div>
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
              Upload Checklist (.csv or .json)
              <input type="file" accept=".csv,.json,text/csv,application/json" onChange={handleFileSelected} className="hidden" />
            </label>
            <p className="mt-1 text-xs text-slate-400">
              CSV columns: section, item, sub_note — or a JSON array of {"{"}section, item, sub_note{"}"} objects. Replaces the current checklist in one step.
            </p>
          </div>

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
              {saving ? "Saving…" : "Save Template"}
            </button>
          </div>
        </>
      ) : null}
    </div>
  );
}
