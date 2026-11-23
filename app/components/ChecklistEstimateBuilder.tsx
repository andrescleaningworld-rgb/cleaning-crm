"use client";

// "Build from estimate" (Crew Link card): paste the scope of work from the
// estimate, pick the crew size, "Make checklist". The AI makes one tab per
// person (lib/checklistEstimateBuild.ts); the tabs come back as a preview
// to fix up here with the same section/item editor as the Crew Link card
// (ChecklistSectionsEditor), then Save adds them to the account (or, after
// "Replace it?", replaces tabs with the same name). Nothing is saved until
// Save. Closing keeps the work until "Start over".

import { useState } from "react";
import { BigButton, ErrorBox, Sheet } from "@/app/ui";
import ChecklistSectionsEditor, { makeEmptySection } from "@/app/components/ChecklistSectionsEditor";
import { MAX_TAB_NAME_LENGTH, cleanTabName, countTabItems, validateSections, type ChecklistSectionDef, type ChecklistTabDef } from "@/lib/checklistTemplate";

export type BuiltTab = { name: string; sections: ChecklistSectionDef[] };
const CREW_SIZES = [1, 2, 3, 4] as const;

export default function ChecklistEstimateBuilder({
  open,
  accountId,
  accountName,
  locationName,
  startTabs = null,
  onClose,
  onSaved,
}: {
  open: boolean;
  accountId: string;
  accountName: string;
  locationName: string;
  /** Typed items or a template: opens right on the preview. Give the component a new key for each. */
  startTabs?: BuiltTab[] | null;
  onClose: () => void;
  onSaved: (tabs: ChecklistTabDef[], firstTabId: number | null, message: string) => void;
}) {
  const [scope, setScope] = useState("");
  const [crewSize, setCrewSize] = useState<number>(1);
  const [tabs, setTabs] = useState<BuiltTab[] | null>(startTabs);
  const [active, setActive] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [conflicts, setConflicts] = useState<string[]>([]);

  async function make() {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/checklist-templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "buildFromEstimate", accountId, scope, crewSize }),
      });
      const data = (await response.json().catch(() => ({}))) as { success?: boolean; error?: string; preview?: { tabs: BuiltTab[] } };
      if (!response.ok || !data.success || !data.preview) throw new Error(data.error || "The checklist was not made. Try again.");
      setTabs(data.preview.tabs);
      setActive(0);
      setConflicts([]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "The checklist was not made. Try again.");
    } finally {
      setBusy(false);
    }
  }

  async function save(replace: boolean) {
    if (!tabs) return;
    // The same checks as the editor's Save, before anything is sent.
    for (const tab of tabs) {
      if (!cleanTabName(tab.name)) return setError("Every tab needs a name.");
      const valid = validateSections(tab.sections);
      if (!valid.ok) return setError(`${tab.name}: ${valid.error}`);
    }
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/checklist-templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "saveBuiltTabs", accountId, accountName, locationName, tabs, replace }),
      });
      const data = (await response.json().catch(() => ({}))) as { success?: boolean; error?: string; conflicts?: string[]; tabs?: ChecklistTabDef[]; firstTabId?: number | null };
      if (response.status === 409 && data.conflicts?.length) {
        setConflicts(data.conflicts);
        return;
      }
      if (!response.ok || !data.success || !data.tabs) throw new Error(data.error || "Nothing was saved. Try again.");
      const count = tabs.length;
      onSaved(data.tabs, data.firstTabId ?? null, `Saved ${count === 1 ? `"${tabs[0].name}"` : `${count} tabs (${tabs.map((t) => t.name).join(", ")})`} from the estimate.`);
      startOver();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Nothing was saved. Try again.");
    } finally {
      setBusy(false);
    }
  }

  function startOver() {
    setTabs(null);
    setScope("");
    setActive(0);
    setConflicts([]);
    setError("");
  }

  const updateActive = (patch: (tab: BuiltTab) => BuiltTab) => setTabs((prev) => (prev ? prev.map((tab, i) => (i === active ? patch(tab) : tab)) : prev));
  const tab = tabs?.[active] ?? null;

  return (
    <Sheet
      open={open}
      title={startTabs ? "Check your checklist" : "Make checklist with AI"}
      text={tabs ? "Check each tab. Tap a line to change it, ✕ to delete it. Nothing is saved until Save." : undefined}
      onClose={onClose}
      closeLabel="Close"
      busy={busy}
      actions={
        tabs ? (
          <>
            <BigButton busy={busy} busyLabel="Saving…" disabled={conflicts.length > 0} onClick={() => void save(false)}>
              {tabs.length === 1 ? "Save" : `Save ${tabs.length} tabs`}
            </BigButton>
            <BigButton kind="quiet" disabled={busy} onClick={startOver}>
              Start over
            </BigButton>
          </>
        ) : (
          <BigButton busy={busy} busyLabel="Making the checklist…" disabled={!scope.trim()} onClick={() => void make()} style={{ background: "#16a34a" }}>
            Make checklist
          </BigButton>
        )
      }
    >
      <div className="space-y-4">
        {error ? <ErrorBox title="Not done" text={error} /> : null}

        {!tabs ? (
          <>
            <label className="block">
              <span className="text-lg font-black text-slate-900">Type a few words, or paste the scope of work</span>
              <textarea
                value={scope}
                onChange={(event) => setScope(event.target.value)}
                rows={12}
                maxLength={20000}
                placeholder={"Main Floor 5x/week\n  Empty waste baskets — 1x per Service Date\n  Vacuum carpets — 1x per Service Date\nBasement 3x/week\n  Dust desks — 1x per Service Date\nRefrigerator — 2x per Service Month"}
                className="mt-2 w-full rounded-xl border-2 border-slate-300 px-3 py-3 text-base outline-none focus:border-green-600"
              />
            </label>
            <div>
              <p className="text-lg font-black text-slate-900">How many people on the crew?</p>
              <div className="mt-2 grid grid-cols-4 gap-2" role="radiogroup" aria-label="Crew size">
                {CREW_SIZES.map((size) => (
                  <button
                    key={size}
                    type="button"
                    role="radio"
                    aria-checked={crewSize === size}
                    onClick={() => setCrewSize(size)}
                    className={`min-h-[64px] rounded-2xl text-xl font-black ${crewSize === size ? "bg-green-600 text-white" : "border-2 border-slate-300 bg-white text-slate-700 hover:bg-slate-50"}`}
                  >
                    {size}
                    <span className="block text-xs font-bold">{size === 1 ? "person" : "people"}</span>
                  </button>
                ))}
              </div>
              <p className="mt-2 text-sm text-slate-500">
                {crewSize === 1 ? "One checklist tab with all the work." : `${crewSize} tabs, "Person 1" to "Person ${crewSize}", with the work split evenly. The last person locks up.`}
              </p>
            </div>
            {busy ? <p className="text-sm font-semibold text-slate-600">This takes about a minute. Keep this open.</p> : null}
          </>
        ) : (
          <>
            {conflicts.length ? (
              <div className="rounded-2xl border-2 border-amber-300 bg-amber-50 p-4">
                <p className="text-base font-black text-amber-900">
                  {conflicts.length === 1 ? `This account already has a tab called "${conflicts[0]}".` : `This account already has tabs called ${conflicts.map((n) => `"${n}"`).join(", ")}.`} Replace{" "}
                  {conflicts.length === 1 ? "it" : "them"}?
                </p>
                <p className="mt-1 text-sm text-amber-900">Past submissions are kept. Other tabs are not touched.</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <BigButton kind="danger" busy={busy} busyLabel="Saving…" onClick={() => void save(true)}>
                    Yes, replace
                  </BigButton>
                  <BigButton kind="second" disabled={busy} onClick={() => setConflicts([])}>
                    No, let me rename
                  </BigButton>
                </div>
              </div>
            ) : null}

            {tabs.length > 1 ? (
              <div className="flex flex-wrap gap-2">
                {tabs.map((t, index) => (
                  <button
                    key={index}
                    type="button"
                    onClick={() => setActive(index)}
                    className={`rounded-lg px-3 py-2 text-sm font-black ${index === active ? "bg-blue-600 text-white" : "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"}`}
                  >
                    {t.name || "No name"} <span className={index === active ? "text-blue-100" : "text-slate-400"}>({countTabItems(t)})</span>
                  </button>
                ))}
              </div>
            ) : null}

            {tab ? (
              <>
                <label className="block">
                  <span className="text-[11px] font-black uppercase tracking-wide text-slate-400">Tab name</span>
                  <input
                    value={tab.name}
                    maxLength={MAX_TAB_NAME_LENGTH}
                    onChange={(event) => {
                      setConflicts([]);
                      updateActive((t) => ({ ...t, name: event.target.value }));
                    }}
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold outline-none focus:border-blue-500"
                  />
                </label>
                <p className="text-sm text-slate-500">
                  {countTabItems(tab)} item(s) in {tab.sections.length} section(s).
                </p>
                <ChecklistSectionsEditor sections={tab.sections} onChange={(update) => updateActive((t) => ({ ...t, sections: update(t.sections) }))} />
                <button
                  type="button"
                  onClick={() => updateActive((t) => ({ ...t, sections: [...t.sections, makeEmptySection()] }))}
                  className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-black text-slate-700 hover:bg-slate-50"
                >
                  + Add Section
                </button>
              </>
            ) : null}
          </>
        )}
      </div>
    </Sheet>
  );
}
