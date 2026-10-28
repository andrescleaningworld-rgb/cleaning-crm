"use client";

// Crew Link checklist, the end of the shift in under 30 seconds:
//   "Everything done ✓"           one tap sends this tab with every item done
//   "Some things I couldn't do"   the items as big tiles: tap only the ones not
//                                 done, pick why with one tap (No time /
//                                 Blocked / No supplies / Other), Send
// No typing needed. "Must do every night" items (set by the office) are on
// top with a star. Several tabs: big tab buttons, and each tab is sent on its
// own; "Everything done" is only the tab on screen. The skips go to the office
// right away (the Pin Board paper "Couldn't do", lib/pg/crew-skips.ts).
import type { ChecklistItemDef, ChecklistSubmissionSection, ChecklistTabDef, SkipReason } from "@/lib/checklistTemplate";
import { SKIP_REASONS } from "@/lib/checklistTemplate";
import type { TeamHubLang } from "@/app/team-hub/teamHubStrings";
import type { CrewLinkStrings } from "./strings";
import { ErrorBox, SendBar, WhoAndWhen } from "./ui";
import { useState } from "react";
import { translated, type ContentTranslations } from "@/lib/translationKey";
import { useCrewLinkPreview } from "./preview";

/** One tab's skips not sent yet (kept by the page, so going home and back loses nothing). */
export type TabProgress = { skipped: Record<string, SkipReason>; note: string; startedAt: string | null; picking: boolean };

export const EMPTY_TAB_PROGRESS: TabProgress = { skipped: {}, note: "", startedAt: null, picking: false };

export default function CrewChecklist({
  code,
  s,
  lang,
  name,
  onNameChange,
  tabs,
  translations,
  activeTabId,
  onSelectTab,
  progressByTab,
  onProgressChange,
  onSent,
}: {
  code: string;
  s: CrewLinkStrings;
  lang: TeamHubLang;
  name: string;
  onNameChange: (name: string) => void;
  tabs: ChecklistTabDef[];
  // Crews see names/items in their language; what's SENT stays English
  // (the submission snapshot managers read).
  translations: ContentTranslations;
  activeTabId: number;
  onSelectTab: (tabId: number) => void;
  progressByTab: Record<number, TabProgress>;
  onProgressChange: (tabId: number, next: TabProgress) => void;
  onSent: (tabId: number) => void;
}) {
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  // The tile whose "Why?" is open.
  const [asking, setAsking] = useState("");
  const preview = useCrewLinkPreview();
  const tr = (text: string) => translated(translations, text, lang);

  const tab = tabs.find((t) => t.id === activeTabId) ?? tabs[0];
  const progress = (tab && progressByTab[tab.id]) || EMPTY_TAB_PROGRESS;
  const allItems = tab ? tab.sections.flatMap((section) => section.items) : [];
  const mustDo = allItems.filter((item) => item.mustDo);
  const skippedCount = Object.keys(progress.skipped).length;
  const nameMissing = !name.trim();

  const change = (next: Partial<TabProgress>) => {
    if (tab) onProgressChange(tab.id, { ...progress, startedAt: progress.startedAt ?? new Date().toISOString(), ...next });
  };

  function tapTile(key: string) {
    navigator.vibrate?.(10);
    if (progress.skipped[key]) {
      const rest = { ...progress.skipped };
      delete rest[key];
      change({ skipped: rest });
      return;
    }
    setAsking(asking === key ? "" : key);
  }

  function pickReason(key: string, reason: SkipReason) {
    navigator.vibrate?.(10);
    change({ skipped: { ...progress.skipped, [key]: reason } });
    setAsking("");
  }

  async function send(skipped: Record<string, SkipReason>) {
    if (!tab || nameMissing) return;
    // Preview: nothing is posted; the page shows "Preview only — not sent".
    if (preview) return onSent(tab.id);
    setSending(true);
    setError("");
    try {
      const sections: ChecklistSubmissionSection[] = tab.sections.map((section) => ({
        key: section.key,
        title: section.title,
        items: section.items.map((item) => ({
          key: item.key,
          label: item.label,
          subNote: item.subNote,
          ...(item.mustDo ? { mustDo: true } : {}),
          checked: !skipped[item.key],
          note: "",
          ...(skipped[item.key] ? { skipReason: skipped[item.key] } : {}),
        })),
      }));
      const response = await fetch("/api/porter-checklist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "submit",
          code,
          tabId: tab.id,
          porterName: name.trim(),
          startedAt: progress.startedAt,
          generalNotes: progress.note.trim(),
          sections,
        }),
      });
      const data = (await response.json()) as { success?: boolean; error?: string };
      if (!response.ok || data.success === false) {
        setError(lang === "en" && data.error ? data.error : s.somethingWrong);
        return;
      }
      navigator.vibrate?.([15, 60, 15]);
      onSent(tab.id);
    } catch {
      setError(s.noSignal);
    } finally {
      setSending(false);
    }
  }

  const star = (
    <span className="mr-1 text-amber-500" aria-label={s.mustDo}>
      ★
    </span>
  );

  /** One item as a big tile: tap = not done, then why. */
  const tile = (item: ChecklistItemDef) => {
    const reason = progress.skipped[item.key];
    return (
      <div key={item.key} className="space-y-2">
        <button
          type="button"
          aria-pressed={Boolean(reason)}
          onClick={() => tapTile(item.key)}
          className={`flex min-h-[76px] w-full items-center gap-3 rounded-2xl border-4 p-4 text-left shadow-sm ${reason ? "border-amber-500 bg-amber-50" : asking === item.key ? "border-blue-600 bg-white" : "border-transparent bg-white active:bg-gray-100"}`}
        >
          <span className="flex-1">
            <span className="block text-2xl font-bold text-slate-900">
              {item.mustDo ? star : null}
              {tr(item.label)}
            </span>
            {reason ? <span className="mt-1 block text-xl font-black text-amber-800">✕ {s.reasons[reason]}</span> : null}
          </span>
        </button>
        {asking === item.key && !reason ? (
          <div className="rounded-2xl bg-blue-50 p-3">
            <p className="mb-2 text-xl font-black text-blue-900">{s.why}</p>
            <div className="grid grid-cols-2 gap-2">
              {SKIP_REASONS.map((each) => (
                <button key={each} type="button" onClick={() => pickReason(item.key, each)} className="min-h-[68px] rounded-2xl bg-white px-2 text-xl font-bold text-slate-900 shadow-sm active:bg-blue-100">
                  {s.reasons[each]}
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <WhoAndWhen s={s} lang={lang} name={name} onNameChange={onNameChange} />

      {tabs.length > 1 ? (
        <div className="grid grid-cols-2 gap-3">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => {
                setAsking("");
                onSelectTab(t.id);
              }}
              aria-pressed={t.id === tab?.id}
              className={`min-h-[64px] rounded-2xl px-3 text-xl font-bold shadow-sm ${t.id === tab?.id ? "bg-blue-700 text-white" : "bg-white text-slate-800 active:bg-gray-100"}`}
            >
              {tr(t.name)}
            </button>
          ))}
        </div>
      ) : null}

      {allItems.length === 0 ? (
        <p className="rounded-2xl bg-white p-6 text-center text-xl text-slate-600 shadow-sm">{s.nothingHere}</p>
      ) : !progress.picking ? (
        <>
          <ErrorBox message={error} />
          {nameMissing ? <p className="text-center text-lg font-semibold text-amber-700">{s.writeYourName}</p> : null}
          <button
            type="button"
            disabled={sending || nameMissing}
            onClick={() => void send({})}
            className="min-h-[110px] w-full rounded-3xl bg-green-600 text-4xl font-black text-white shadow-lg active:bg-green-700 disabled:bg-slate-300 disabled:text-slate-500"
          >
            {sending ? s.sending : s.everythingDone}
          </button>
          <button
            type="button"
            disabled={sending}
            onClick={() => change({ picking: true })}
            className="min-h-[80px] w-full rounded-3xl border-4 border-amber-500 bg-white text-2xl font-black text-amber-800 shadow-sm active:bg-amber-50 disabled:opacity-50"
          >
            {s.couldntDo}
          </button>

          {/* What tonight is: must-do on top with a star. Reading only. */}
          <div className="space-y-2 rounded-2xl bg-white p-4 shadow-sm">
            <p className="text-lg font-black text-slate-500">{s.tonightsList}</p>
            {mustDo.length ? (
              <ul className="space-y-1 rounded-xl bg-amber-50 p-3">
                {mustDo.map((item) => (
                  <li key={item.key} className="text-xl font-bold text-slate-900">
                    {star}
                    {tr(item.label)}
                  </li>
                ))}
              </ul>
            ) : null}
            {tab!.sections.map((section) => {
              const rest = section.items.filter((item) => !item.mustDo);
              if (!rest.length) return null;
              return (
                <div key={section.key}>
                  {section.title ? <p className="mt-2 text-lg font-black text-slate-600">{tr(section.title)}</p> : null}
                  <ul className="space-y-1">
                    {rest.map((item) => (
                      <li key={item.key} className="text-xl text-slate-800">
                        • {tr(item.label)}
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        </>
      ) : (
        <>
          <p className="rounded-2xl bg-amber-100 p-4 text-2xl font-black text-amber-900">
            {s.tapSkipped}
            <span className="mt-1 block text-lg font-semibold">{s.tapToUndo}</span>
          </p>
          {mustDo.length ? <section className="space-y-3">{mustDo.map(tile)}</section> : null}
          {tab!.sections.map((section) => {
            const rest = section.items.filter((item) => !item.mustDo);
            if (!rest.length) return null;
            return (
              <section key={section.key} className="space-y-3">
                {section.title ? <h2 className="px-1 text-xl font-black text-slate-700">{tr(section.title)}</h2> : null}
                {rest.map(tile)}
              </section>
            );
          })}

          <label className="block rounded-2xl bg-white p-4 shadow-sm">
            <span className="text-lg font-bold text-slate-700">{s.noteOptional}</span>
            <textarea value={progress.note} onChange={(event) => change({ note: event.target.value })} rows={2} maxLength={2000} className="mt-2 w-full rounded-xl border border-slate-300 p-3 text-lg" />
          </label>

          <button type="button" onClick={() => change({ picking: false })} className="min-h-[56px] w-full rounded-2xl bg-white text-xl font-bold text-slate-700 shadow-sm active:bg-gray-100">
            {s.cancel}
          </button>
          <ErrorBox message={error} />
          <SendBar
            label={s.sendSkipped(skippedCount)}
            busyLabel={s.sending}
            busy={sending}
            disabled={nameMissing || skippedCount === 0}
            onClick={() => void send(progress.skipped)}
            hint={nameMissing ? s.writeYourName : skippedCount === 0 ? s.tapSkipped : undefined}
          />
        </>
      )}
    </div>
  );
}
