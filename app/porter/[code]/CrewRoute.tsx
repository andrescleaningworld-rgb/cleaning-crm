"use client";

// Crew Link route screen: for tabs whose file uses route fields (time, days,
// photo, choices, special rows; isRouteTab in lib/checklistTemplate.ts).
// Built like the Equipment Check page: giant rows, very few words, English
// and Spanish together, no menus, one hand on a cheap phone.
//   - only tonight's rows, in route order, with the time on each
//   - tap anywhere on a row to check it; a photo row opens the camera first
//     and is checked once the photo is taken
//   - dumpster-style rows: one button per choice, grey → Not full ↔ Full
//   - "Couldn't do / No se pudo" on each row: Locked / Occupied / No time / Other
//   - progress bar on top, Finish at the bottom (lit when every row is done
//     or marked "couldn't do")
//   - special rows: "Urgent request" (logged with the time, many per shift)
//     and "Note for night crew" (sent with Finish, shown on the other route
//     tabs the same day)
// Everything is kept on the phone until Finish, so a reload loses nothing.
// What's sent stays English (the office reads it); photos go through the
// page's one photo sender (photo-queue.ts) and are linked to the row by id.

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ROUTE_SKIP_REASONS,
  routeNightOf,
  routeSpecialRow,
  rowsForNight,
  type ChecklistItemDef,
  type ChecklistSubmissionSection,
  type ChecklistTabDef,
  type SkipReason,
} from "@/lib/checklistTemplate";
import { translated, type ContentTranslations } from "@/lib/translationKey";
import { TEAM_HUB_TIMEZONE } from "@/lib/teamHubTimezone";
import type { NightNote } from "@/lib/checklistDb";
import type { PhotoQueue } from "./photo-queue";
import { SendBar } from "./ui";

/** The fixed words, always both languages (no language switch on route screens). */
export const ROUTE_WORDS = {
  done: (done: number, total: number) => `${done} of ${total} done / ${done} de ${total} listos`,
  finish: "Finish / Terminar",
  sending: "Sending… / Enviando…",
  left: (n: number) => `${n} left / Faltan ${n}`,
  couldnt: "Couldn't do / No se pudo",
  why: "Why? / ¿Por qué?",
  reasons: { blocked: "Locked / Cerrado", occupied: "Occupied / Ocupado", no_time: "No time / Sin tiempo", other: "Other / Otro" } as Record<string, string>,
  cancel: "Cancel / Cancelar",
  notFull: "Not full / No lleno",
  full: "Full / Lleno",
  tapEach: "Tap each one / Toca cada uno",
  takePhoto: "Take photo / Saca foto",
  photoFailed: "The photo didn't work. Try again. / La foto no funcionó. Prueba otra vez.",
  noSignal: "No signal. Try again. / Sin señal. Prueba otra vez.",
  notSent: "It didn't send. Try again. / No se envió. Prueba otra vez.",
  what: "What? / ¿Qué?",
  who: "Who asked? / ¿Quién pidió?",
  details: "Details (optional) / Detalle (opcional)",
  ok: "OK",
  fromDay: "From day porter / Del porter de día",
  yourName: "Your name / Tu nombre",
  back: "Back / Atrás",
  sent: "Sent! / ¡Enviado!",
  backToStart: "Back to start / Volver al inicio",
  sentToday: "Sent / Enviado",
  nothingTonight: "Nothing tonight / Nada esta noche",
};

type ChoiceState = "ok" | "full";

type RouteProgress = {
  checked: string[];
  skipped: Record<string, SkipReason>;
  choices: Record<string, Record<string, ChoiceState>>;
  photos: Record<string, string[]>;
  note: string;
  startedAt: string | null;
};

type UrgentRequest = { at: string; what: string; who: string; text: string };

const EMPTY: RouteProgress = { checked: [], skipped: {}, choices: {}, photos: {}, note: "", startedAt: null };

/* ---------- kept on the phone ---------- */

const progressKey = (code: string, tabId: number, dateKey: string) => `crew-route:${code}:${tabId}:${dateKey}`;
// Requests are kept until a Finish sends them (even on a later day).
const requestsKey = (code: string, tabId: number) => `crew-route-requests:${code}:${tabId}`;
const sentKey = (code: string, dateKey: string) => `crew-route-sent:${code}:${dateKey}`;

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? ({ ...fallback, ...JSON.parse(raw) } as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // best-effort: the checks still work while the page is open
  }
}

function removeKey(key: string) {
  try {
    localStorage.removeItem(key);
  } catch {
    // best-effort
  }
}

/** Tabs already sent today on this phone (the start screen shows "Sent"). */
export function sentTodayOnThisPhone(code: string): number[] {
  try {
    const raw = localStorage.getItem(sentKey(code, routeNightOf(new Date()).dateKey));
    const list = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(list) ? list.filter((id): id is number => typeof id === "number") : [];
  } catch {
    return [];
  }
}

function markSentToday(code: string, tabId: number) {
  const key = sentKey(code, routeNightOf(new Date()).dateKey);
  writeJson(key, [...new Set([...sentTodayOnThisPhone(code), tabId])]);
}

/** Yesterday's (and older) unfinished checks for this link: removed so the phone doesn't fill up. */
function dropOldProgress(code: string, dateKey: string) {
  try {
    const prefix = `crew-route:${code}:`;
    const sentPrefix = `crew-route-sent:${code}:`;
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = localStorage.key(i) ?? "";
      if ((key.startsWith(prefix) || key.startsWith(sentPrefix)) && !key.endsWith(`:${dateKey}`)) localStorage.removeItem(key);
    }
  } catch {
    // best-effort
  }
}

const timeOf = (iso: string) => new Date(iso).toLocaleTimeString("en-US", { timeZone: TEAM_HUB_TIMEZONE, hour: "numeric", minute: "2-digit" });
const dayOf = (iso: string) => new Date(iso).toLocaleDateString("en-US", { timeZone: TEAM_HUB_TIMEZONE, month: "numeric", day: "numeric" });

/* ---------- the screen ---------- */

export default function CrewRoute({
  code,
  tab,
  name,
  onNameChange,
  translations,
  nightNote,
  queue,
  preview,
  onSent,
}: {
  code: string;
  tab: ChecklistTabDef;
  name: string;
  onNameChange: (name: string) => void;
  // The automatic Spanish, used only where the file has no "es".
  translations: ContentTranslations;
  /** Today's note from the day porter (shown unless this is the tab that writes it). */
  nightNote: NightNote | null;
  queue: PhotoQueue;
  /** Admin "See what the crew sees": nothing is sent. */
  preview: boolean;
  onSent: (tabId: number) => void;
}) {
  const [night] = useState(() => routeNightOf(new Date()));
  const storeKey = progressKey(code, tab.id, night.dateKey);
  const reqKey = requestsKey(code, tab.id);
  const [progress, setProgress] = useState<RouteProgress>(() => (preview ? EMPTY : readJson(storeKey, EMPTY)));
  const [requests, setRequests] = useState<UrgentRequest[]>(() => (preview ? [] : readJson<{ list: UrgentRequest[] }>(reqKey, { list: [] }).list));
  const [asking, setAsking] = useState("");
  const [photoBusy, setPhotoBusy] = useState("");
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [urgentOpen, setUrgentOpen] = useState(false);
  const camera = useRef<HTMLInputElement>(null);
  const cameraFor = useRef<ChecklistItemDef | null>(null);

  useEffect(() => {
    if (!preview) dropOldProgress(code, night.dateKey);
  }, [code, night.dateKey, preview]);

  const rows = useMemo(() => rowsForNight(tab.sections, night), [tab.sections, night]);
  const urgentRow = routeSpecialRow(tab.sections, "urgent");
  const noteRow = routeSpecialRow(tab.sections, "night_note");

  const spanish = (text: string, es?: string) => {
    if (es) return es;
    const auto = translated(translations, text, "es");
    return auto !== text ? auto : "";
  };

  function save(next: RouteProgress) {
    const withStart = { ...next, startedAt: next.startedAt ?? new Date().toISOString() };
    setProgress(withStart);
    if (!preview) writeJson(storeKey, withStart);
  }

  function saveRequests(next: UrgentRequest[]) {
    setRequests(next);
    if (!preview) writeJson(reqKey, { list: next });
  }

  const isDone = (item: ChecklistItemDef) =>
    item.choices?.length ? item.choices.every((choice) => progress.choices[item.key]?.[choice]) : progress.checked.includes(item.key);
  const handled = rows.filter((item) => isDone(item) || progress.skipped[item.key]).length;
  const left = rows.length - handled;
  const nameMissing = !name.trim();

  const withoutSkip = (key: string) => {
    const rest = { ...progress.skipped };
    delete rest[key];
    return rest;
  };

  function tapRow(item: ChecklistItemDef) {
    navigator.vibrate?.(10);
    setAsking("");
    if (progress.skipped[item.key]) return save({ ...progress, skipped: withoutSkip(item.key) });
    if (item.photo && !(progress.photos[item.key]?.length)) return openCamera(item);
    const checked = progress.checked.includes(item.key) ? progress.checked.filter((key) => key !== item.key) : [...progress.checked, item.key];
    save({ ...progress, checked });
  }

  function tapChoice(item: ChecklistItemDef, choice: string) {
    navigator.vibrate?.(10);
    const current = progress.choices[item.key] ?? {};
    const next: ChoiceState = current[choice] === "ok" ? "full" : "ok";
    save({ ...progress, skipped: withoutSkip(item.key), choices: { ...progress.choices, [item.key]: { ...current, [choice]: next } } });
  }

  function pickReason(item: ChecklistItemDef, reason: SkipReason) {
    navigator.vibrate?.(10);
    setAsking("");
    save({ ...progress, checked: progress.checked.filter((key) => key !== item.key), skipped: { ...progress.skipped, [item.key]: reason } });
  }

  function openCamera(item: ChecklistItemDef) {
    if (nameMissing) return setError(ROUTE_WORDS.yourName);
    setError("");
    cameraFor.current = item;
    camera.current?.click();
  }

  async function photoTaken(file: File) {
    const item = cameraFor.current;
    cameraFor.current = null;
    if (!item) return;
    setPhotoBusy(item.key);
    try {
      const ids = preview ? [`preview-${Date.now()}`] : await queue.add([file], name.trim(), "", item.label);
      if (ids.length === 0) {
        setError(ROUTE_WORDS.photoFailed);
        return;
      }
      setProgress((current) => {
        const next = {
          ...current,
          startedAt: current.startedAt ?? new Date().toISOString(),
          photos: { ...current.photos, [item.key]: [...(current.photos[item.key] ?? []), ...ids] },
          checked: current.checked.includes(item.key) ? current.checked : [...current.checked, item.key],
          skipped: Object.fromEntries(Object.entries(current.skipped).filter(([key]) => key !== item.key)),
        };
        if (!preview) writeJson(storeKey, next);
        return next;
      });
      navigator.vibrate?.(15);
    } finally {
      setPhotoBusy("");
    }
  }

  async function finish() {
    if (left > 0 || nameMissing || sending) return;
    if (preview) return onSent(tab.id);
    setSending(true);
    setError("");
    try {
      const tonight = new Set(rows.map((item) => item.key));
      const sections: ChecklistSubmissionSection[] = tab.sections
        .map((section) => ({
          key: section.key,
          title: section.title,
          items: section.items
            .filter((item) => tonight.has(item.key))
            .map((item) => {
              const skip = progress.skipped[item.key];
              const picks = progress.choices[item.key] ?? {};
              const photos = progress.photos[item.key] ?? [];
              return {
                key: item.key,
                label: item.time ? `${item.time} ${item.label}` : item.label,
                ...(item.subNote ? { subNote: item.subNote } : {}),
                checked: !skip && isDone(item),
                note: item.choices?.length && !skip ? item.choices.map((choice) => `${choice}: ${picks[choice] === "full" ? "Full" : "Not full"}`).join(" · ") : "",
                ...(skip ? { skipReason: skip } : {}),
                ...(photos.length ? { photos } : {}),
              };
            }),
        }))
        .filter((section) => section.items.length > 0);
      if (requests.length) {
        sections.push({
          key: "urgent-requests",
          title: "Urgent requests",
          items: requests.map((request, index) => ({
            key: `urgent-${index + 1}`,
            label: `${dayOf(request.at) === dayOf(new Date().toISOString()) ? "" : `${dayOf(request.at)} `}${timeOf(request.at)} ${request.what} · ${request.who}`,
            checked: true,
            note: request.text,
            info: true,
          })),
        });
      }
      const response = await fetch("/api/porter-checklist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "submit",
          code,
          tabId: tab.id,
          porterName: name.trim(),
          startedAt: progress.startedAt,
          generalNotes: noteRow ? progress.note.trim() : "",
          sections,
        }),
      });
      const data = (await response.json()) as { success?: boolean; error?: string };
      if (!response.ok || data.success === false) {
        setError(ROUTE_WORDS.notSent);
        return;
      }
      removeKey(storeKey);
      removeKey(reqKey);
      markSentToday(code, tab.id);
      navigator.vibrate?.([15, 60, 15]);
      onSent(tab.id);
    } catch {
      setError(ROUTE_WORDS.noSignal);
    } finally {
      setSending(false);
    }
  }

  /* ---------- pieces ---------- */

  const nameBox =
    nameMissing || editingName ? (
      <div className="space-y-2 rounded-2xl bg-white p-4 shadow-sm">
        <p className={`text-xl font-black ${nameMissing ? "text-amber-700" : "text-slate-700"}`}>{ROUTE_WORDS.yourName}</p>
        <div className="flex gap-2">
          <input
            value={name}
            onChange={(event) => onNameChange(event.target.value)}
            autoComplete="name"
            maxLength={80}
            className="min-h-[60px] min-w-0 flex-1 rounded-xl border-2 border-slate-300 px-3 text-2xl font-bold outline-none focus:border-blue-600"
          />
          {editingName && !nameMissing ? (
            <button type="button" onClick={() => setEditingName(false)} className="min-h-[60px] rounded-xl bg-blue-700 px-6 text-2xl font-black text-white active:bg-blue-800">
              {ROUTE_WORDS.ok}
            </button>
          ) : null}
        </div>
      </div>
    ) : (
      <button type="button" onClick={() => setEditingName(true)} className="min-h-[48px] rounded-xl px-2 text-left text-xl font-bold text-slate-600 active:bg-white">
        👤 {name} ✎
      </button>
    );

  const reasonPicker = (item: ChecklistItemDef) => (
    <div className="space-y-2 rounded-b-2xl bg-amber-50 p-3">
      <p className="text-xl font-black text-amber-900">{ROUTE_WORDS.why}</p>
      <div className="grid grid-cols-2 gap-2">
        {ROUTE_SKIP_REASONS.map((reason) => (
          <button key={reason} type="button" onClick={() => pickReason(item, reason)} className="min-h-[72px] rounded-2xl bg-white px-2 text-lg font-black text-slate-900 shadow-sm active:bg-amber-100">
            {ROUTE_WORDS.reasons[reason]}
          </button>
        ))}
      </div>
      <button type="button" onClick={() => setAsking("")} className="min-h-[52px] w-full rounded-2xl text-lg font-bold text-slate-600 active:bg-white">
        {ROUTE_WORDS.cancel}
      </button>
    </div>
  );

  const labelBlock = (item: ChecklistItemDef) => {
    const es = spanish(item.label, item.es);
    const subEs = item.subNote ? spanish(item.subNote, item.subNoteEs) : "";
    return (
      <span className="block min-w-0 flex-1">
        <span className="block text-2xl font-black leading-tight text-slate-900">
          {item.time ? <span className="mr-2 text-blue-800">{item.time}</span> : null}
          {item.label}
        </span>
        {es ? <span className="mt-1 block text-xl font-semibold leading-tight text-slate-600">{es}</span> : null}
        {item.subNote ? <span className="mt-1 block text-base leading-snug text-slate-500">{item.subNote}</span> : null}
        {subEs ? <span className="block text-base italic leading-snug text-slate-500">{subEs}</span> : null}
      </span>
    );
  };

  const skipLine = (item: ChecklistItemDef) =>
    progress.skipped[item.key] ? <span className="mt-1 block text-xl font-black text-amber-800">✕ {ROUTE_WORDS.reasons[progress.skipped[item.key]] ?? progress.skipped[item.key]}</span> : null;

  const couldntButton = (item: ChecklistItemDef) =>
    progress.skipped[item.key] ? null : (
      <div className="flex justify-end px-3 pb-3">
        <button
          type="button"
          onClick={() => setAsking(asking === item.key ? "" : item.key)}
          aria-expanded={asking === item.key}
          className="min-h-[48px] rounded-xl border-2 border-amber-400 bg-white px-4 text-lg font-bold text-amber-800 active:bg-amber-50"
        >
          {ROUTE_WORDS.couldnt}
        </button>
      </div>
    );

  const row = (item: ChecklistItemDef) => {
    const skipped = Boolean(progress.skipped[item.key]);
    const done = !skipped && isDone(item);
    const box = `rounded-2xl shadow-sm ${skipped ? "bg-amber-50 ring-4 ring-amber-400" : done ? "bg-green-50 ring-4 ring-green-500" : "bg-white"}`;

    if (item.choices?.length) {
      const picks = progress.choices[item.key] ?? {};
      return (
        <div key={item.key} className={box}>
          <button type="button" onClick={() => {
              // A skipped dumpster row: tap to undo the skip.
              if (skipped) tapRow(item);
            }} className="flex w-full items-start gap-3 p-4 text-left">
            <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border-4 text-3xl font-black ${done ? "border-green-600 bg-green-600 text-white" : "border-slate-300 bg-white"}`} aria-hidden="true">
              {done ? "✓" : ""}
            </span>
            <span className="block min-w-0 flex-1">
              {labelBlock(item)}
              {!done && !skipped ? <span className="mt-1 block text-lg font-bold text-blue-800">{ROUTE_WORDS.tapEach}</span> : null}
              {skipLine(item)}
            </span>
          </button>
          {!skipped ? (
            <div className="grid grid-cols-3 gap-2 px-3 pb-3">
              {item.choices.map((choice, index) => {
                const state = picks[choice];
                const choiceEs = item.choicesEs?.[index] ?? spanish(choice);
                return (
                  <button
                    key={choice}
                    type="button"
                    onClick={() => tapChoice(item, choice)}
                    aria-pressed={Boolean(state)}
                    className={`flex min-h-[96px] flex-col items-center justify-center rounded-2xl px-1 text-center shadow-sm ${state === "full" ? "bg-red-600 text-white" : state === "ok" ? "bg-green-600 text-white" : "bg-slate-200 text-slate-800 active:bg-slate-300"}`}
                  >
                    <span className="text-base font-black leading-tight">{choice}</span>
                    {choiceEs ? <span className="text-sm font-semibold leading-tight opacity-90">{choiceEs}</span> : null}
                    <span className="mt-1 text-sm font-black leading-tight">{state === "full" ? ROUTE_WORDS.full : state === "ok" ? ROUTE_WORDS.notFull : "?"}</span>
                  </button>
                );
              })}
            </div>
          ) : null}
          {asking === item.key ? reasonPicker(item) : couldntButton(item)}
        </div>
      );
    }

    const photos = progress.photos[item.key] ?? [];
    return (
      <div key={item.key} className={box}>
        <div className="flex items-stretch">
          <button type="button" onClick={() => tapRow(item)} aria-pressed={done} className="flex min-h-[96px] min-w-0 flex-1 items-center gap-3 p-4 text-left">
            <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border-4 text-3xl font-black ${done ? "border-green-600 bg-green-600 text-white" : skipped ? "border-amber-500 bg-white text-amber-600" : "border-slate-300 bg-white"}`} aria-hidden="true">
              {done ? "✓" : skipped ? "✕" : ""}
            </span>
            <span className="block min-w-0 flex-1">
              {labelBlock(item)}
              {item.photo && !photos.length && !skipped ? <span className="mt-1 block text-lg font-bold text-blue-800">📷 {ROUTE_WORDS.takePhoto}</span> : null}
              {skipLine(item)}
            </span>
          </button>
          {item.photo && !skipped ? (
            <button
              type="button"
              onClick={() => openCamera(item)}
              disabled={photoBusy === item.key}
              aria-label={ROUTE_WORDS.takePhoto}
              className={`flex w-20 shrink-0 flex-col items-center justify-center rounded-r-2xl text-4xl text-white ${photos.length ? "bg-green-600 active:bg-green-700" : "bg-blue-600 active:bg-blue-700"} disabled:opacity-60`}
            >
              {photoBusy === item.key ? "…" : "📷"}
              {photos.length ? <span className="text-lg font-black">✓ {photos.length}</span> : null}
            </button>
          ) : null}
        </div>
        {asking === item.key ? reasonPicker(item) : couldntButton(item)}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <input
        ref={camera}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) void photoTaken(file);
          else cameraFor.current = null;
        }}
      />

      {/* Progress, always in view. */}
      <div className="sticky top-0 z-20 -mx-4 bg-slate-100 px-4 pb-2 pt-2">
        <p className="text-2xl font-black text-slate-900">{ROUTE_WORDS.done(handled, rows.length)}</p>
        <div className="mt-2 h-6 w-full overflow-hidden rounded-full bg-slate-300" role="progressbar" aria-valuemin={0} aria-valuemax={rows.length} aria-valuenow={handled}>
          <div className="h-full rounded-full bg-green-600 transition-all" style={{ width: `${rows.length ? Math.round((handled / rows.length) * 100) : 0}%` }} />
        </div>
      </div>

      {nameBox}

      {nightNote && !noteRow ? (
        <div className="rounded-2xl border-4 border-yellow-400 bg-yellow-50 p-4">
          <p className="text-lg font-black text-yellow-900">
            📝 {ROUTE_WORDS.fromDay} — {nightNote.name}, {timeOf(nightNote.at)}
          </p>
          <p className="mt-1 whitespace-pre-wrap text-2xl font-bold text-slate-900">{nightNote.text}</p>
        </div>
      ) : null}

      {urgentRow ? (
        <UrgentBox
          row={urgentRow}
          open={urgentOpen}
          onOpen={setUrgentOpen}
          requests={requests}
          onAdd={(request) => saveRequests([...requests, request])}
          spanish={spanish}
        />
      ) : null}

      {rows.length === 0 ? <p className="rounded-2xl bg-white p-6 text-center text-2xl font-bold text-slate-600 shadow-sm">{ROUTE_WORDS.nothingTonight}</p> : null}
      <div className="space-y-3">{rows.map(row)}</div>

      {noteRow ? (
        <label className="block rounded-2xl bg-white p-4 shadow-sm">
          <span className="block text-xl font-black text-slate-900">📝 {noteRow.label}</span>
          {spanish(noteRow.label, noteRow.es) ? <span className="block text-lg font-semibold text-slate-600">{spanish(noteRow.label, noteRow.es)}</span> : null}
          <textarea
            value={progress.note}
            onChange={(event) => save({ ...progress, note: event.target.value })}
            rows={3}
            maxLength={500}
            className="mt-2 w-full rounded-xl border-2 border-slate-300 p-3 text-xl outline-none focus:border-blue-600"
          />
        </label>
      ) : null}

      {error ? <p className="rounded-2xl bg-amber-100 px-4 py-3 text-xl font-bold text-amber-900">{error}</p> : null}

      <SendBar
        label={ROUTE_WORDS.finish}
        busyLabel={ROUTE_WORDS.sending}
        busy={sending}
        disabled={left > 0 || nameMissing || rows.length === 0}
        onClick={() => void finish()}
        hint={nameMissing ? ROUTE_WORDS.yourName : left > 0 ? ROUTE_WORDS.left(left) : undefined}
      />
    </div>
  );
}

/* ---------- Urgent request ---------- */

function UrgentBox({
  row,
  open,
  onOpen,
  requests,
  onAdd,
  spanish,
}: {
  row: ChecklistItemDef;
  open: boolean;
  onOpen: (open: boolean) => void;
  requests: UrgentRequest[];
  onAdd: (request: UrgentRequest) => void;
  spanish: (text: string, es?: string) => string;
}) {
  const [what, setWhat] = useState("");
  const [who, setWho] = useState("");
  const [text, setText] = useState("");
  const labelEs = spanish(row.label, row.es);

  const close = () => {
    setWhat("");
    setWho("");
    setText("");
    onOpen(false);
  };

  const picks = (list: string[], listEs: string[] | undefined, value: string, onPick: (value: string) => void) => (
    <div className="grid grid-cols-2 gap-2">
      {list.map((option, index) => {
        const es = listEs?.[index] ?? spanish(option);
        return (
          <button
            key={option}
            type="button"
            aria-pressed={value === option}
            onClick={() => onPick(option)}
            className={`min-h-[72px] rounded-2xl px-2 text-center shadow-sm ${value === option ? "bg-orange-600 text-white" : "bg-white text-slate-900 active:bg-orange-50"}`}
          >
            <span className="block text-lg font-black leading-tight">{option}</span>
            {es ? <span className="block text-base font-semibold leading-tight opacity-80">{es}</span> : null}
          </button>
        );
      })}
    </div>
  );

  return (
    <div className="space-y-2">
      {!open ? (
        <button type="button" onClick={() => onOpen(true)} className="flex min-h-[88px] w-full items-center justify-center gap-3 rounded-3xl bg-orange-500 px-4 text-white shadow-lg active:bg-orange-600">
          <span className="text-4xl" aria-hidden="true">
            ⚡
          </span>
          <span className="text-left">
            <span className="block text-2xl font-black leading-tight">{row.label}</span>
            {labelEs ? <span className="block text-xl font-bold leading-tight">{labelEs}</span> : null}
          </span>
        </button>
      ) : (
        <div className="space-y-4 rounded-3xl border-4 border-orange-500 bg-orange-50 p-4">
          <p className="text-2xl font-black text-orange-900">⚡ {row.label}</p>
          <div className="space-y-2">
            <p className="text-xl font-black text-slate-800">{ROUTE_WORDS.what}</p>
            {picks(row.what ?? [], row.whatEs, what, setWhat)}
          </div>
          <div className="space-y-2">
            <p className="text-xl font-black text-slate-800">{ROUTE_WORDS.who}</p>
            {picks(row.who ?? [], row.whoEs, who, setWho)}
          </div>
          <label className="block">
            <span className="text-lg font-bold text-slate-700">{ROUTE_WORDS.details}</span>
            <input value={text} onChange={(event) => setText(event.target.value)} maxLength={300} className="mt-1 min-h-[60px] w-full rounded-xl border-2 border-slate-300 px-3 text-xl outline-none focus:border-orange-600" />
          </label>
          <button
            type="button"
            disabled={!what || !who}
            onClick={() => {
              navigator.vibrate?.(15);
              onAdd({ at: new Date().toISOString(), what, who, text: text.trim() });
              close();
            }}
            className="min-h-[72px] w-full rounded-3xl bg-orange-600 text-3xl font-black text-white shadow-lg active:bg-orange-700 disabled:bg-slate-300 disabled:text-slate-500"
          >
            {ROUTE_WORDS.ok}
          </button>
          <button type="button" onClick={close} className="min-h-[52px] w-full rounded-2xl text-lg font-bold text-slate-600 active:bg-white">
            {ROUTE_WORDS.cancel}
          </button>
        </div>
      )}
      {requests.length ? (
        <ul className="space-y-1 rounded-2xl bg-white p-3 shadow-sm">
          {requests.map((request, index) => (
            <li key={`${request.at}-${index}`} className="text-lg font-bold text-slate-800">
              ⚡ {timeOf(request.at)} · {request.what} · {request.who}
              {request.text ? <span className="block text-base font-normal text-slate-600">{request.text}</span> : null}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
