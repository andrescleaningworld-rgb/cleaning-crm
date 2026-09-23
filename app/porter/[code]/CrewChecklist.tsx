"use client";

// Crew Link checklist: tap anywhere on a row to check it, one optional note,
// one big Send. Several tabs → big tab buttons at the top; each tab keeps
// its own checks (state lives in the page, so switching tabs or going home
// and back doesn't lose anything) and is sent on its own. No typed times:
// "started" is the first checkbox tap, "finished" is the Send (server time).
import type { ChecklistSubmissionSection, ChecklistTabDef } from "@/lib/checklistTemplate";
import type { CrewLinkStrings } from "./strings";
import { ErrorBox, SendBar } from "./ui";
import { useState } from "react";

export type TabProgress = { checked: Record<string, boolean>; note: string; startedAt: string | null };

export const EMPTY_TAB_PROGRESS: TabProgress = { checked: {}, note: "", startedAt: null };

export default function CrewChecklist({
  code,
  s,
  name,
  tabs,
  activeTabId,
  onSelectTab,
  progressByTab,
  onProgressChange,
  onSent,
}: {
  code: string;
  s: CrewLinkStrings;
  name: string;
  tabs: ChecklistTabDef[];
  activeTabId: number;
  onSelectTab: (tabId: number) => void;
  progressByTab: Record<number, TabProgress>;
  onProgressChange: (tabId: number, next: TabProgress) => void;
  onSent: (tabId: number) => void;
}) {
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  const tab = tabs.find((t) => t.id === activeTabId) ?? tabs[0];
  const progress = (tab && progressByTab[tab.id]) || EMPTY_TAB_PROGRESS;
  const items = tab ? tab.sections.flatMap((section) => section.items) : [];
  const doneCount = items.filter((item) => progress.checked[item.key]).length;

  function toggle(key: string) {
    if (!tab) return;
    navigator.vibrate?.(10);
    onProgressChange(tab.id, {
      ...progress,
      checked: { ...progress.checked, [key]: !progress.checked[key] },
      startedAt: progress.startedAt ?? new Date().toISOString(),
    });
  }

  async function send() {
    if (!tab) return;
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
          checked: Boolean(progress.checked[item.key]),
          note: "",
        })),
      }));
      const response = await fetch("/api/porter-checklist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "submit",
          code,
          tabId: tab.id,
          porterName: name,
          startedAt: progress.startedAt,
          generalNotes: progress.note.trim(),
          sections,
        }),
      });
      const data = (await response.json()) as { success?: boolean; error?: string };
      if (!response.ok || data.success === false) {
        setError(data.error || s.somethingWrong);
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

  return (
    <div className="space-y-4">
      {tabs.length > 1 ? (
        <div className="grid grid-cols-2 gap-3">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => onSelectTab(t.id)}
              aria-pressed={t.id === tab?.id}
              className={`min-h-[64px] rounded-2xl px-3 text-xl font-bold shadow-sm ${
                t.id === tab?.id ? "bg-blue-700 text-white" : "bg-white text-slate-800 active:bg-gray-100"
              }`}
            >
              {t.name}
            </button>
          ))}
        </div>
      ) : null}

      {items.length === 0 ? (
        <p className="rounded-2xl bg-white p-6 text-center text-xl text-slate-600 shadow-sm">{s.nothingHere}</p>
      ) : (
        <>
          <div className="rounded-2xl bg-white p-4 shadow-sm">
            <p className="text-xl font-bold text-slate-900">{s.progress(doneCount, items.length)}</p>
            <div className="mt-2 h-3 w-full overflow-hidden rounded-full bg-slate-200">
              <div
                className="h-full rounded-full bg-green-500 transition-all"
                style={{ width: `${(doneCount / items.length) * 100}%` }}
              />
            </div>
          </div>

          {tab!.sections.map((section) => (
            <section key={section.key} className="space-y-3">
              {section.title ? <h2 className="px-1 text-xl font-black text-slate-700">{section.title}</h2> : null}
              {section.items.map((item) => {
                const checked = Boolean(progress.checked[item.key]);
                return (
                  <button
                    key={item.key}
                    type="button"
                    role="checkbox"
                    aria-checked={checked}
                    onClick={() => toggle(item.key)}
                    className={`flex min-h-[72px] w-full items-center gap-4 rounded-2xl border-2 p-4 text-left shadow-sm ${
                      checked ? "border-green-500 bg-green-50" : "border-transparent bg-white active:bg-gray-100"
                    }`}
                  >
                    <span
                      aria-hidden="true"
                      className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border-2 text-2xl font-black ${
                        checked ? "border-green-600 bg-green-600 text-white" : "border-slate-300 bg-white text-transparent"
                      }`}
                    >
                      ✓
                    </span>
                    <span className="flex-1">
                      <span className="block text-xl font-semibold text-slate-900">{item.label}</span>
                      {item.subNote ? <span className="mt-1 block text-lg text-slate-500">{item.subNote}</span> : null}
                    </span>
                  </button>
                );
              })}
            </section>
          ))}

          <label className="block rounded-2xl bg-white p-4 shadow-sm">
            <span className="text-lg font-bold text-slate-700">{s.noteOptional}</span>
            <textarea
              value={progress.note}
              onChange={(event) => onProgressChange(tab!.id, { ...progress, note: event.target.value })}
              rows={2}
              maxLength={2000}
              className="mt-2 w-full rounded-xl border border-slate-300 p-3 text-lg"
            />
          </label>

          <ErrorBox message={error} />
          <SendBar label={s.send} busyLabel={s.sending} busy={sending} disabled={false} onClick={send} />
        </>
      )}
    </div>
  );
}
