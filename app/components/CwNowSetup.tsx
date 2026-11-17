"use client";

// "Set up CW Now" (the account's CW Now card): three steps, no files or code.
//   1 What do they clean?   Build from estimate (ChecklistEstimateBuilder, as
//                           is) / Copy from another account (every tab with
//                           items) / Upload a file (.csv or .json, the same
//                           parser as Edit checklist → Upload). Then the
//                           account's "Checklist Needed" goes on.
//   2 Who's on the crew?    the crew list (CrewPeople)
//   3 Send                  WhatsApp each person their link (CrewPeople)
// The step lives in the card, so a reload after step 1 keeps the place.

import { useEffect, useState } from "react";
import { AccountPicker, BigButton, Stepper, type PickerOption } from "@/app/ui";
import ChecklistEstimateBuilder from "@/app/components/ChecklistEstimateBuilder";
import CrewPeople from "@/app/components/CrewPeople";
import { countTabItems, parseUploadedChecklistFile, type ChecklistTabDef } from "@/lib/checklistTemplate";
import type { CrewPeopleData } from "@/lib/crewLinkPeople";

export type SetupStep = 1 | 2 | 3;
const STEP_TITLES: Record<SetupStep, string> = { 1: "What do they clean?", 2: "Who's on the crew?", 3: "Send" };

type Api = { success?: boolean; error?: string; conflicts?: string[]; tabs?: ChecklistTabDef[] };

async function call(body: Record<string, unknown>): Promise<{ status: number; data: Api }> {
  const response = await fetch("/api/checklist-templates", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  return { status: response.status, data: (await response.json().catch(() => ({}))) as Api };
}

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
  const [way, setWay] = useState<"" | "copy">("");
  const [copyFrom, setCopyFrom] = useState("");
  const [copyOptions, setCopyOptions] = useState<PickerOption[] | null>(null);
  const [conflicts, setConflicts] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const items = tabs.reduce((sum, tab) => sum + countTabItems(tab), 0);

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

  const bigChoice = "flex min-h-[72px] w-full items-center justify-center gap-3 rounded-2xl px-4 text-xl font-black shadow-sm disabled:opacity-50";

  return (
    <div className="space-y-4 rounded-2xl border-2 border-green-300 bg-green-50/40 p-4">
      <div className="flex items-start justify-between gap-2">
        <Stepper step={step} total={3} label={STEP_TITLES[step]} />
        <button type="button" onClick={onClose} className="text-sm font-bold text-slate-600 underline">
          Close
        </button>
      </div>
      <h3 className="text-2xl font-black text-slate-900">{STEP_TITLES[step]}</h3>
      {error ? <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</p> : null}

      {step === 1 ? (
        <>
          {items > 0 ? (
            <p className="text-base font-semibold text-green-800">
              ✓ This account has a checklist: {items} item{items === 1 ? "" : "s"}
              {tabs.length > 1 ? ` in ${tabs.length} tabs` : ""}. Keep it, or make a new one below.
            </p>
          ) : (
            <p className="text-base text-slate-600">Pick one way to make the crew&apos;s checklist.</p>
          )}
          <button type="button" disabled={busy} onClick={() => setBuilderOpen(true)} className={`${bigChoice} bg-green-600 text-white hover:bg-green-700`}>
            <span className="text-2xl" aria-hidden="true">📋</span> Build from estimate
          </button>
          <button type="button" disabled={busy} onClick={() => setWay(way === "copy" ? "" : "copy")} aria-expanded={way === "copy"} className={`${bigChoice} bg-white text-slate-800 ring-2 ring-slate-300 hover:bg-slate-50`}>
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
          <label className={`${bigChoice} cursor-pointer bg-white text-slate-800 ring-2 ring-slate-300 hover:bg-slate-50`}>
            <span className="text-2xl" aria-hidden="true">⬆️</span> {busy ? "Working…" : "Upload a file (.csv, .json)"}
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
          <p className="text-sm text-slate-500">Have a PDF or Word file? Open Edit checklist after setup and upload it there, or paste its text into Build from estimate.</p>
          {items > 0 ? (
            <BigButton disabled={busy} onClick={() => void checklistIn()}>
              Keep this checklist — Next
            </BigButton>
          ) : null}
          <ChecklistEstimateBuilder
            open={builderOpen}
            accountId={accountId}
            accountName={accountName}
            locationName={placeName}
            onClose={() => setBuilderOpen(false)}
            onSaved={() => {
              setBuilderOpen(false);
              void checklistIn();
            }}
          />
        </>
      ) : null}

      {step === 2 ? (
        <>
          <p className="text-base text-slate-600">Add each person who cleans here. Their WhatsApp number, the language they read, and their own tab when there is more than one.</p>
          <CrewPeople accountId={accountId} placeName={placeName} baseUrl={baseUrl} tabs={tabs} data={people} onChange={onPeopleChange} mode="people" />
          <div className="grid gap-2 sm:grid-cols-2">
            <BigButton kind="second" onClick={() => onStep(1)}>
              ← Back
            </BigButton>
            <BigButton onClick={() => onStep(3)}>
              Next: Send
            </BigButton>
          </div>
        </>
      ) : null}

      {step === 3 ? (
        <>
          <p className="text-base text-slate-600">Send each person their link by WhatsApp. It opens on their checklist, in their language.</p>
          <CrewPeople accountId={accountId} placeName={placeName} baseUrl={baseUrl} tabs={tabs} data={people} onChange={onPeopleChange} mode="send" />
          <div className="grid gap-2 sm:grid-cols-2">
            <BigButton kind="second" onClick={() => onStep(2)}>
              ← Back
            </BigButton>
            <BigButton onClick={onClose}>Done</BigButton>
          </div>
        </>
      ) : null}
    </div>
  );
}
