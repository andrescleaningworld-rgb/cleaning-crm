"use client";

// "Set up CW Now" (the account's CW Now card): four steps, no files or code.
//   1 What do they clean?  Type or paste / Make with AI / A template / Copy from
//                          another account (or upload a file). Typed items and
//                          templates open the same preview as AI, split per person.
//   2 How do they check it off?  Normal or Photo Checklist
//   3 Who's on the crew?   the crew list (CrewPeople)
//   4 Shift and send       the shift time (CwNowShift), then each person's link
// First time: a short tour (the app's Tips). "?" on each step: a tip, an example, a video.

import { useEffect, useRef, useState } from "react";
import { AccountPicker, BigButton, SHOW_TIPS_EVENT, Tips, type PickerOption } from "@/app/ui";
import ChecklistEstimateBuilder, { type BuiltTab } from "@/app/components/ChecklistEstimateBuilder";
import CrewPeople from "@/app/components/CrewPeople";
import CwNowShift from "@/app/components/CwNowShift";
import CwNowStepHelp from "@/app/components/CwNowStepHelp";
import { countTabItems, parseUploadedChecklistFile, type ChecklistSectionDef, type ChecklistTabDef } from "@/lib/checklistTemplate";
import { EXAMPLE_CHECKLIST, STARTER_CHECKLISTS, rowsFromText, splitForCrew } from "@/lib/checklistStarters";
import { CW_NOW_TOUR, CW_NOW_TOUR_ID, type CwNowHelpKey } from "@/lib/cwNowHelp";
import type { CrewPeopleData } from "@/lib/crewLinkPeople";
import type { CrewScreen } from "@/lib/photoChecklist";

export type SetupStep = 1 | 2 | 3 | 4;
const STEPS: { step: SetupStep; key: CwNowHelpKey; title: string; chip: string }[] = [
  { step: 1, key: "items", title: "What do they clean?", chip: "Items" },
  { step: 2, key: "mode", title: "How do they check it off?", chip: "Check off" },
  { step: 3, key: "crew", title: "Who's on the crew?", chip: "Crew" },
  { step: 4, key: "send", title: "Shift and send", chip: "Send" },
];

type Api = { success?: boolean; error?: string; conflicts?: string[]; tabs?: ChecklistTabDef[] };
type Saved = { id: number; name: string; sections: ChecklistSectionDef[] };

async function call(body: Record<string, unknown>): Promise<{ status: number; data: Api }> {
  const response = await fetch("/api/checklist-templates", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  return { status: response.status, data: (await response.json().catch(() => ({}))) as Api };
}

const sectionsToText = (sections: ChecklistSectionDef[]) => sections.map((section) => [`${section.title}:`, ...section.items.map((item) => item.label)].join("\n")).join("\n");

export default function CwNowSetup({
  step,
  onStep,
  accountId,
  accountName,
  placeName,
  baseUrl,
  tabs,
  people,
  onPeopleChange,
  onChecklistIn,
  onClose,
}: {
  step: SetupStep;
  onStep: (step: SetupStep) => void;
  accountId: string;
  accountName: string;
  placeName: string;
  baseUrl: string;
  tabs: ChecklistTabDef[];
  people: CrewPeopleData;
  onPeopleChange: (data: CrewPeopleData) => void;
  /** Step 1 is done: the card turns the checklist on and reloads. */
  onChecklistIn: () => Promise<void>;
  onClose: () => void;
}) {
  const [builderOpen, setBuilderOpen] = useState(false);
  // Typed items or a template, split per person: opens the builder's preview. The key starts it fresh.
  const [startTabs, setStartTabs] = useState<BuiltTab[] | null>(null);
  const [builderKey, setBuilderKey] = useState(0);
  const [way, setWay] = useState<"" | "type" | "library" | "copy">("");
  const [typed, setTyped] = useState("");
  const [crewSize, setCrewSize] = useState(1);
  const [saved, setSaved] = useState<Saved[] | null>(null);
  const [saveName, setSaveName] = useState("");
  const [copyFrom, setCopyFrom] = useState("");
  const [copyOptions, setCopyOptions] = useState<PickerOption[] | null>(null);
  const [conflicts, setConflicts] = useState<string[]>([]);
  const [screen, setScreen] = useState<CrewScreen>("classic");
  // A tap on Normal or Photo wins over a slow load of the saved choice.
  const pickedScreen = useRef(false);
  const screenSaves = useRef<Promise<unknown>>(Promise.resolve());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const items = tabs.reduce((sum, tab) => sum + countTabItems(tab), 0);
  const current = STEPS[step - 1];

  // The accounts that have a checklist to copy (the CW Now page's list).
  useEffect(() => {
    if (way !== "copy" || copyOptions) return;
    let alive = true;
    fetch("/api/crew-link/accounts", { cache: "no-store" })
      .then((r) => r.json())
      .then((data: { accounts?: { accountId: string; accountName: string; tabCount: number; itemCount: number }[] }) => {
        if (!alive) return;
        setCopyOptions(
          (data.accounts ?? [])
            .filter((a) => a.itemCount > 0 && a.accountId !== accountId)
            .sort((a, b) => a.accountName.localeCompare(b.accountName))
            .map((a) => ({ id: a.accountId, name: a.accountName || a.accountId, detail: `${a.tabCount} tab${a.tabCount === 1 ? "" : "s"} · ${a.itemCount} items` }))
        );
      })
      .catch(() => alive && setError("The accounts did not load."));
    return () => {
      alive = false;
    };
  }, [way, copyOptions, accountId]);

  useEffect(() => {
    if (way !== "library" || saved) return;
    let alive = true;
    fetch("/api/crew-link/shift?view=library", { cache: "no-store" })
      .then((r) => r.json())
      .then((data: { saved?: Saved[] }) => alive && setSaved(data.saved ?? []))
      .catch(() => alive && setSaved([]));
    return () => {
      alive = false;
    };
  }, [way, saved]);

  useEffect(() => {
    if (step !== 2) return;
    let alive = true;
    fetch(`/api/crew-link/work-reports?accountId=${encodeURIComponent(accountId)}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((data: { crewScreen?: CrewScreen }) => {
        if (alive && !pickedScreen.current) setScreen(data.crewScreen === "photo" ? "photo" : "classic");
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [step, accountId]);

  async function checklistIn() {
    setBusy(true);
    try {
      await onChecklistIn();
      setWay("");
      setConflicts([]);
      onStep(2);
    } catch (err) {
      setError(err instanceof Error ? err.message : "The checklist did not turn on. Try again.");
    } finally {
      setBusy(false);
    }
  }

  async function copy(replace: boolean) {
    if (!copyFrom) return setError("Pick the account to copy from.");
    setBusy(true);
    setError("");
    try {
      const { status, data } = await call({ action: "copyTabsFrom", accountId, accountName, fromAccountId: copyFrom, replace });
      if (status === 409 && data.conflicts?.length) return setConflicts(data.conflicts);
      if (!data.success) throw new Error(data.error || "Nothing was copied.");
    } catch (err) {
      setBusy(false);
      return setError(err instanceof Error ? err.message : "Nothing was copied.");
    }
    setBusy(false);
    await checklistIn();
  }

  async function upload(file: File) {
    setError("");
    const text = await file.text();
    // The same parser as Edit checklist → Upload, first here so a bad file never leaves the computer.
    const parsed = parseUploadedChecklistFile(text, file.name);
    if (!parsed.ok) return setError(parsed.error);
    setBusy(true);
    try {
      const ensured = await call({ action: "ensureTemplate", accountId, accountName });
      const first = ensured.data.tabs?.[0];
      if (!ensured.data.success || !first) throw new Error(ensured.data.error || "Could not start the checklist.");
      if (countTabItems(first) > 0 && !window.confirm(`Replace the checklist in "${first.name}"?`)) return;
      const { data } = await call({ action: "uploadTemplate", accountId, accountName, tabId: first.id, filename: file.name, fileText: text });
      if (!data.success) throw new Error(data.error || "The file did not upload.");
    } catch (err) {
      return setError(err instanceof Error ? err.message : "The file did not upload.");
    } finally {
      setBusy(false);
    }
    await checklistIn();
  }

  function openAi() {
    setError("");
    setStartTabs(null);
    setBuilderKey((key) => key + 1);
    setBuilderOpen(true);
  }

  function checkTyped() {
    setError("");
    const built = splitForCrew(rowsFromText(typed), crewSize);
    if (!built) return setError("Type at least one item.");
    setStartTabs(built);
    setBuilderKey((key) => key + 1);
    setBuilderOpen(true);
  }

  function pickTemplate(text: string) {
    setTyped(text);
    setWay("type");
  }

  async function saveTemplate() {
    setNote("");
    setError("");
    if (!saveName.trim()) return setError("Give the template a name.");
    setBusy(true);
    try {
      const response = await fetch("/api/crew-link/shift", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "saveLibrary", accountId, name: saveName.trim(), tabId: tabs[0]?.id }) });
      const data = (await response.json().catch(() => ({}))) as { success?: boolean; error?: string; saved?: Saved[] };
      if (!data.success) throw new Error(data.error || "It did not save.");
      setSaved(data.saved ?? null);
      setSaveName("");
      setNote("Saved. It is in Templates now.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "It did not save.");
    } finally {
      setBusy(false);
    }
  }

  async function pickScreen(next: CrewScreen) {
    setError("");
    const before = screen;
    pickedScreen.current = true;
    setScreen(next);
    // One at a time, in the order tapped: the last tap is what stays saved.
    const run = screenSaves.current.then(async () => {
      const response = await fetch("/api/crew-link/work-reports", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "setCrewScreen", accountId, screen: next }) });
      const data = (await response.json().catch(() => ({}))) as { success?: boolean; error?: string };
      if (!response.ok || !data.success) throw new Error(data.error || "That did not save.");
    });
    screenSaves.current = run.catch(() => undefined);
    try {
      await run;
    } catch (err) {
      setScreen(before);
      setError(err instanceof Error ? err.message : "That did not save.");
    }
  }

  const bigChoice = "flex min-h-[72px] w-full items-center justify-center gap-3 rounded-2xl px-4 text-xl font-black shadow-sm disabled:opacity-50";
  const plainChoice = `${bigChoice} bg-white text-slate-800 ring-2 ring-slate-300 hover:bg-slate-50`;
  const navRow = (back: SetupStep | null, next: SetupStep, label: string) => (
    <div className="grid gap-2 sm:grid-cols-2">
      {back ? <BigButton kind="second" onClick={() => onStep(back)}>← Back</BigButton> : <span />}
      <BigButton onClick={() => onStep(next)}>{label}</BigButton>
    </div>
  );

  return (
    <div className="space-y-4 rounded-2xl border-2 border-green-300 bg-green-50/40 p-4">
      <Tips id={CW_NOW_TOUR_ID} steps={CW_NOW_TOUR} skipOnlyThese />
      <div className="flex items-center justify-between gap-2">
        <button type="button" onClick={() => window.dispatchEvent(new CustomEvent(SHOW_TIPS_EVENT, { detail: CW_NOW_TOUR_ID }))} className="text-sm font-bold text-blue-700 underline" data-show-tour>
          Show me again
        </button>
        <button type="button" onClick={onClose} className="text-sm font-bold text-slate-600 underline">
          Close
        </button>
      </div>
      <div className="grid grid-cols-4 gap-1" role="group" aria-label="Setup steps">
        {STEPS.map((entry) => (
          <button
            key={entry.step}
            type="button"
            data-cw-tour={entry.key}
            aria-current={entry.step === step ? "step" : undefined}
            onClick={() => onStep(entry.step)}
            className={`min-h-[56px] rounded-xl px-1 text-sm font-black ${entry.step === step ? "bg-green-600 text-white" : "bg-white text-slate-700 ring-1 ring-slate-300"}`}
          >
            {entry.step}. {entry.chip}
          </button>
        ))}
      </div>
      <div className="flex items-start justify-between gap-3">
        <h3 className="pt-1 text-2xl font-black text-slate-900">{current.title}</h3>
        <div className="shrink-0"><CwNowStepHelp key={current.key} step={current.key} /></div>
      </div>
      {error ? <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</p> : null}
      {note ? <p className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm font-semibold text-green-800">{note}</p> : null}

      {step === 1 ? (
        <>
          {items > 0 ? (
            <p className="text-base font-semibold text-green-800">
              ✓ {items} item{items === 1 ? "" : "s"}
              {tabs.length > 1 ? ` in ${tabs.length} tabs` : ""}. Keep it, or make a new one.
            </p>
          ) : (
            <p className="text-base text-slate-600">Pick one.</p>
          )}
          <button type="button" disabled={busy} onClick={() => setWay(way === "type" ? "" : "type")} aria-expanded={way === "type"} className={`${bigChoice} bg-green-600 text-white hover:bg-green-700`}>
            <span className="text-2xl" aria-hidden="true">✍️</span> Type or paste
          </button>
          {way === "type" ? (
            <div className="space-y-3 rounded-2xl bg-white p-4">
              <label className="block">
                <span className="text-lg font-black text-slate-900">One job per line</span>
                <textarea value={typed} onChange={(event) => setTyped(event.target.value)} rows={9} maxLength={12000} placeholder={"Empty all trash cans\nWipe desks\nVacuum carpets"} className="mt-2 w-full rounded-xl border-2 border-slate-300 px-3 py-3 text-lg outline-none focus:border-green-600" />
              </label>
              <p className="text-sm text-slate-500">A line ending in : starts a group, like Kitchen:</p>
              <BigButton kind="second" onClick={() => setTyped(EXAMPLE_CHECKLIST)}>See an example</BigButton>
              <div>
                <p className="text-lg font-black text-slate-900">How many people?</p>
                <div className="mt-2 grid grid-cols-4 gap-2" role="radiogroup" aria-label="People on the crew">
                  {[1, 2, 3, 4].map((size) => (
                    <button key={size} type="button" role="radio" aria-checked={crewSize === size} onClick={() => setCrewSize(size)} className={`min-h-[56px] rounded-2xl text-xl font-black ${crewSize === size ? "bg-green-600 text-white" : "border-2 border-slate-300 bg-white text-slate-800"}`}>
                      {size}
                    </button>
                  ))}
                </div>
                {crewSize > 1 ? <p className="mt-1 text-sm text-slate-500">We split the work. You can change it next.</p> : null}
              </div>
              <BigButton disabled={!typed.trim()} onClick={checkTyped}>Next: check it</BigButton>
            </div>
          ) : null}
          <button type="button" disabled={busy} onClick={openAi} className={plainChoice}>
            <span className="text-2xl" aria-hidden="true">✨</span> Make checklist with AI
          </button>
          <button type="button" disabled={busy} onClick={() => setWay(way === "library" ? "" : "library")} aria-expanded={way === "library"} className={plainChoice}>
            <span className="text-2xl" aria-hidden="true">📚</span> Use a template
          </button>
          {way === "library" ? (
            <div className="grid gap-2 rounded-2xl bg-white p-4">
              {STARTER_CHECKLISTS.map((starter) => (
                <BigButton key={starter.id} kind="second" onClick={() => pickTemplate(starter.text)}>{starter.icon} {starter.name}</BigButton>
              ))}
              {(saved ?? []).map((entry) => (
                <BigButton key={entry.id} kind="second" onClick={() => pickTemplate(sectionsToText(entry.sections))}>⭐ {entry.name}</BigButton>
              ))}
            </div>
          ) : null}
          <button type="button" disabled={busy} onClick={() => setWay(way === "copy" ? "" : "copy")} aria-expanded={way === "copy"} className={plainChoice}>
            <span className="text-2xl" aria-hidden="true">📄</span> Copy from another account
          </button>
          {way === "copy" ? (
            <div className="space-y-3 rounded-2xl bg-white p-4">
              {copyOptions ? (
                <AccountPicker
                  options={copyOptions}
                  value={copyFrom}
                  onChange={(id) => {
                    setCopyFrom(id);
                    setConflicts([]);
                  }}
                  label="Copy the checklist of"
                  searchLabel="Search accounts"
                  emptyText="No other account has a checklist yet."
                />
              ) : (
                <p className="text-sm text-slate-500">Loading accounts…</p>
              )}
              {conflicts.length ? (
                <div className="rounded-xl border-2 border-amber-300 bg-amber-50 p-3">
                  <p className="font-black text-amber-900">
                    This account already has {conflicts.map((name) => `"${name}"`).join(", ")}. Replace {conflicts.length === 1 ? "it" : "them"}?
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <BigButton kind="danger" busy={busy} busyLabel="Copying…" onClick={() => void copy(true)}>
                      Yes, replace
                    </BigButton>
                    <BigButton kind="second" disabled={busy} onClick={() => setConflicts([])}>
                      No
                    </BigButton>
                  </div>
                </div>
              ) : (
                <BigButton busy={busy} busyLabel="Copying…" disabled={!copyFrom} onClick={() => void copy(false)}>
                  Copy all tabs
                </BigButton>
              )}
            </div>
          ) : null}
          <label className="block cursor-pointer text-center text-sm font-bold text-blue-700 underline">
            {busy ? "Working…" : "Or upload a file (.csv, .json)"}
            <input
              type="file"
              accept=".csv,.json,text/csv,application/json"
              className="hidden"
              disabled={busy}
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (file) void upload(file);
              }}
            />
          </label>
          {items > 0 ? (
            <>
              <BigButton disabled={busy} onClick={() => void checklistIn()}>
                Keep this checklist — Next
              </BigButton>
              <details className="rounded-2xl bg-white p-3">
                <summary className="cursor-pointer text-base font-bold text-slate-700">Save it as a template</summary>
                <div className="mt-2 space-y-2">
                  <input value={saveName} onChange={(event) => setSaveName(event.target.value)} maxLength={60} placeholder="Medical office" aria-label="Template name" className="w-full rounded-xl border-2 border-slate-300 px-3 py-3 text-lg" />
                  <BigButton kind="second" busy={busy} busyLabel="Saving…" onClick={() => void saveTemplate()}>Save template</BigButton>
                </div>
              </details>
            </>
          ) : null}
          <ChecklistEstimateBuilder
            key={builderKey}
            open={builderOpen}
            accountId={accountId}
            accountName={accountName}
            locationName={placeName}
            startTabs={startTabs}
            onClose={() => setBuilderOpen(false)}
            onSaved={() => {
              setBuilderOpen(false);
              setTyped("");
              void checklistIn();
            }}
          />
        </>
      ) : null}

      {step === 2 ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2" role="radiogroup" aria-label="How they check it off">
            {([["classic", "☑️", "Normal", "Tap a box"], ["photo", "📷", "Photo", "A picture for each job"]] as const).map(([value, icon, name, words]) => (
              <button key={value} type="button" role="radio" aria-checked={screen === value} onClick={() => void pickScreen(value)} className={`min-h-[96px] rounded-2xl px-3 text-xl font-black ${screen === value ? "bg-green-600 text-white" : "bg-white text-slate-800 ring-2 ring-slate-300"}`}>
                <span className="mr-2 text-2xl" aria-hidden="true">{icon}</span>{name}
                <span className="block text-sm font-bold">{words}</span>
              </button>
            ))}
          </div>
          {navRow(1, 3, "Next: Crew")}
        </>
      ) : null}

      {step === 3 ? (
        <>
          <p className="text-base text-slate-600">Add each person who cleans here.</p>
          <CrewPeople accountId={accountId} placeName={placeName} baseUrl={baseUrl} tabs={tabs} data={people} onChange={onPeopleChange} mode="people" />
          {navRow(2, 4, "Next: Send")}
        </>
      ) : null}

      {step === 4 ? (
        <>
          <CwNowShift accountId={accountId} />
          <p className="text-lg font-black text-slate-900">💬 Send each person their link</p>
          <CrewPeople accountId={accountId} placeName={placeName} baseUrl={baseUrl} tabs={tabs} data={people} onChange={onPeopleChange} mode="send" />
          <div className="grid gap-2 sm:grid-cols-2">
            <BigButton kind="second" onClick={() => onStep(3)}>
              ← Back
            </BigButton>
            <BigButton onClick={onClose}>Done</BigButton>
          </div>
        </>
      ) : null}
    </div>
  );
}
