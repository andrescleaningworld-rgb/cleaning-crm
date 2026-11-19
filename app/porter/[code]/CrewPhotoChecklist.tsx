"use client";

// CW Now "Photo Checklist" crew screen (lib/photoChecklist.ts), for accounts
// whose CW Now card says "Crew screen: Photo Checklist". The checklist and the
// photos are the same thing: a photo of an item checks it off.
//   - first time only: "What's your name?" (page.tsx), then, when the account
//     has more than one checklist tab (one per person) and the link does not
//     say which, "Which one is yours?" (remembered on the phone)
//   - each item is a big tile with two big buttons: Take Photo (the camera
//     opens directly) and From Gallery (many at once; the photo's own date is
//     used). The tile turns green with ✓ and the photos, each with its time.
//   - an item the office set "Photo required: No" is checked with one tap
//   - "Can't do" (or a long press on the tile): the usual reasons (Locked /
//     Occupied / No time / Other)
//   - "+ Extra Photo" for anything not on the list
//   - "7 of 12 done" on top, the big green Finish at the bottom ("5 not done.
//     Finish anyway?" once)
// Everything is saved on the phone first (photos and thumbnails in IndexedDB,
// the checks in localStorage) and sent by the page's one sender
// (photo-queue.ts) whenever there is signal, so closing the page or having no
// signal loses nothing. Finish works with no signal too.
// After Finish the visit stays open for photos the rest of that day and the
// next day ("Add photos to last visit"), for pictures taken with the phone's
// own camera and sent later. Crews only see the place name and their items.

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ROUTE_SKIP_REASONS,
  noticeSections,
  routeNightOf,
  rowsForNight,
  taskSections,
  type ChecklistItemDef,
  type ChecklistSubmissionSection,
  type ChecklistTabDef,
  type SkipReason,
} from "@/lib/checklistTemplate";
import { translated, type ContentTranslations } from "@/lib/translationKey";
import { TEAM_HUB_TIMEZONE } from "@/lib/teamHubTimezone";
import { EXTRA_ITEM_KEY, VISIT_ID_PREFIX, photoRequired, type PhotoTimeSource } from "@/lib/photoChecklist";
import type { TeamHubLang } from "@/app/team-hub/teamHubStrings";
import type { PhotoQueue } from "./photo-queue";
import { NoticeBox, PhotoPlaceNotes } from "./ui";
import { splitName } from "./CrewRoute";
import { dropThumbs, saveThumb, useThumbs } from "./visit-thumbs";

/* ---------- words (EN / ES / PT) ---------- */

const WORDS = {
  en: {
    whichIsYours: "Which one is yours?",
    change: "Change",
    done: (d: number, t: number) => `${d} of ${t} done`,
    takePhoto: "Take Photo",
    fromGallery: "From Gallery",
    tapWhenDone: "Tap when done",
    cantDo: "Can't do",
    why: "Why?",
    reasons: { blocked: "Locked", occupied: "Occupied", no_time: "No time", other: "Other" } as Record<string, string>,
    cancel: "Cancel",
    undo: "Undo",
    extra: "+ Extra Photo",
    extraHint: "Anything not on the list",
    finish: "Finish",
    notDoneAsk: (n: number) => `${n} not done. Finish anyway?`,
    yesFinish: "Yes, finish",
    goBack: "Go back",
    allSent: "✓ All sent",
    waiting: (n: number) => `⏳ ${n} waiting for signal`,
    sending: (n: number) => `⏳ Sending ${n}…`,
    keepOpen: "Keep this page open to send",
    couldNotSend: (n: number) => `${n} could not be sent. Tell the office.`,
    tryAgain: "Try again",
    finished: (time: string) => `Finished ✓ ${time}`,
    finishedNote: "You can still add photos to this visit.",
    newVisit: "Start a new visit",
    lastVisit: (day: string) => `Add photos to last visit (${day})`,
    backToToday: "Back to today",
    addingTo: (day: string) => `Adding photos to the visit of ${day}`,
    preparing: "Getting photos ready…",
    photoFailed: "The photo didn't work. Try again.",
    nothing: "Nothing on this list. Ask your office.",
    earlier: "taken earlier",
    addedLater: "added later",
  },
  es: {
    whichIsYours: "¿Cuál es la tuya?",
    change: "Cambiar",
    done: (d: number, t: number) => `${d} de ${t} listos`,
    takePhoto: "Sacar foto",
    fromGallery: "De la galería",
    tapWhenDone: "Toca cuando termines",
    cantDo: "No se pudo",
    why: "¿Por qué?",
    reasons: { blocked: "Cerrado", occupied: "Ocupado", no_time: "Sin tiempo", other: "Otro" } as Record<string, string>,
    cancel: "Cancelar",
    undo: "Deshacer",
    extra: "+ Foto extra",
    extraHint: "Algo que no está en la lista",
    finish: "Terminar",
    notDoneAsk: (n: number) => `Faltan ${n}. ¿Terminar igual?`,
    yesFinish: "Sí, terminar",
    goBack: "Volver",
    allSent: "✓ Todo enviado",
    waiting: (n: number) => `⏳ ${n} esperando señal`,
    sending: (n: number) => `⏳ Enviando ${n}…`,
    keepOpen: "Deja esta página abierta para enviar",
    couldNotSend: (n: number) => `${n} no se pudo enviar. Avisa a la oficina.`,
    tryAgain: "Intentar de nuevo",
    finished: (time: string) => `Terminado ✓ ${time}`,
    finishedNote: "Todavía puedes agregar fotos a esta visita.",
    newVisit: "Empezar otra visita",
    lastVisit: (day: string) => `Agregar fotos a la última visita (${day})`,
    backToToday: "Volver a hoy",
    addingTo: (day: string) => `Agregando fotos a la visita del ${day}`,
    preparing: "Preparando fotos…",
    photoFailed: "La foto no funcionó. Prueba otra vez.",
    nothing: "No hay nada en esta lista. Pregunta a la oficina.",
    earlier: "tomada antes",
    addedLater: "agregada después",
  },
  pt: {
    whichIsYours: "Qual é a sua?",
    change: "Trocar",
    done: (d: number, t: number) => `${d} de ${t} feitos`,
    takePhoto: "Tirar foto",
    fromGallery: "Da galeria",
    tapWhenDone: "Toque quando terminar",
    cantDo: "Não deu",
    why: "Por quê?",
    reasons: { blocked: "Trancado", occupied: "Ocupado", no_time: "Sem tempo", other: "Outro" } as Record<string, string>,
    cancel: "Cancelar",
    undo: "Desfazer",
    extra: "+ Foto extra",
    extraHint: "Algo que não está na lista",
    finish: "Terminar",
    notDoneAsk: (n: number) => `Faltam ${n}. Terminar mesmo assim?`,
    yesFinish: "Sim, terminar",
    goBack: "Voltar",
    allSent: "✓ Tudo enviado",
    waiting: (n: number) => `⏳ ${n} esperando sinal`,
    sending: (n: number) => `⏳ Enviando ${n}…`,
    keepOpen: "Deixe esta página aberta para enviar",
    couldNotSend: (n: number) => `${n} não foi enviado. Avise o escritório.`,
    tryAgain: "Tentar novamente",
    finished: (time: string) => `Terminado ✓ ${time}`,
    finishedNote: "Você ainda pode adicionar fotos a esta visita.",
    newVisit: "Começar outra visita",
    lastVisit: (day: string) => `Adicionar fotos à última visita (${day})`,
    backToToday: "Voltar para hoje",
    addingTo: (day: string) => `Adicionando fotos à visita de ${day}`,
    preparing: "Preparando fotos…",
    photoFailed: "A foto não funcionou. Tente de novo.",
    nothing: "Nada nesta lista. Pergunte ao escritório.",
    earlier: "tirada antes",
    addedLater: "adicionada depois",
  },
};
type Words = (typeof WORDS)["en"];

/* ---------- the visit, kept on the phone ---------- */

type TilePhoto = { id: string; takenAt: string; source: PhotoTimeSource };

type Visit = {
  /** "pc-…": the checklist's id once finished; every photo carries it. */
  id: string;
  tabId: number;
  /** The first tap or photo. */
  startedAt: string | null;
  createdAt: string;
  /** "Photo required: No" items tapped done. */
  done: string[];
  skipped: Record<string, SkipReason>;
  /** Per item key (and EXTRA_ITEM_KEY). */
  photos: Record<string, TilePhoto[]>;
  finishedAt: string | null;
  lastAt: string;
};

type Kept = { current: Visit | null; previous: Visit | null };

const keptKey = (code: string, tabId: number) => `crew-photo-checklist:${code}:${tabId}`;
const tabChoiceKey = (code: string) => `crew-photo-checklist-tab:${code}`;

const newVisitId = () => `${VISIT_ID_PREFIX}${typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2, 12)}`}`;

function freshVisit(tabId: number): Visit {
  const now = new Date().toISOString();
  return { id: newVisitId(), tabId, startedAt: null, createdAt: now, done: [], skipped: {}, photos: {}, finishedAt: null, lastAt: now };
}

function readKept(code: string, tabId: number): Kept {
  try {
    const raw = localStorage.getItem(keptKey(code, tabId));
    const parsed = raw ? (JSON.parse(raw) as Partial<Kept>) : {};
    return { current: parsed.current ?? null, previous: parsed.previous ?? null };
  } catch {
    return { current: null, previous: null };
  }
}

function writeKept(code: string, tabId: number, kept: Kept) {
  try {
    localStorage.setItem(keptKey(code, tabId), JSON.stringify(kept));
  } catch {
    // best-effort: the screen still works while it is open
  }
}

export function readTabChoice(code: string): number | null {
  try {
    const id = Number(localStorage.getItem(tabChoiceKey(code)));
    return Number.isInteger(id) && id > 0 ? id : null;
  } catch {
    return null;
  }
}

function storeTabChoice(code: string, tabId: number | null) {
  try {
    if (tabId) localStorage.setItem(tabChoiceKey(code), String(tabId));
    else localStorage.removeItem(tabChoiceKey(code));
  } catch {
    // best-effort
  }
}

/** The office day (YYYY-MM-DD) of a moment. */
const dayKey = (iso: string) => routeNightOf(new Date(iso)).dateKey;
const daysBetween = (fromKey: string, toKey: string) => Math.round((Date.parse(`${toKey}T12:00:00Z`) - Date.parse(`${fromKey}T12:00:00Z`)) / 86_400_000);
const visitDay = (visit: Visit) => dayKey(visit.startedAt ?? visit.createdAt);
const allPhotoIds = (visit: Visit) => Object.values(visit.photos).flatMap((list) => list.map((photo) => photo.id));

const timeOf = (iso: string) => new Date(iso).toLocaleTimeString("en-US", { timeZone: TEAM_HUB_TIMEZONE, hour: "numeric", minute: "2-digit" });
const shortDay = (iso: string, lang: TeamHubLang) =>
  new Date(iso).toLocaleDateString(lang === "es" ? "es-US" : lang === "pt" ? "pt-BR" : "en-US", { timeZone: TEAM_HUB_TIMEZONE, weekday: "short", month: "short", day: "numeric" });

/* ---------- the screen ---------- */

export default function CrewPhotoChecklist({
  code,
  tabs,
  linkTabId,
  name,
  lang,
  placeName,
  translations,
  queue,
  preview,
  onFinished,
}: {
  code: string;
  tabs: ChecklistTabDef[];
  /** A person's own link (?tab=): their tab, no question. */
  linkTabId: number | null;
  name: string;
  lang: TeamHubLang;
  /** The place name the crew sees (and the stamp). */
  placeName: string;
  translations: ContentTranslations;
  queue: PhotoQueue;
  /** Admin "See what the crew sees": nothing is kept or sent. */
  preview: boolean;
  onFinished: () => void;
}) {
  const w = WORDS[lang] ?? WORDS.en;
  const [chosenTab, setChosenTab] = useState<number | null>(() => (preview ? null : readTabChoice(code)));
  const tab =
    tabs.length === 1
      ? tabs[0]
      : (tabs.find((t) => t.id === linkTabId) ?? tabs.find((t) => t.id === chosenTab) ?? null);

  if (!tab) {
    return (
      <div className="space-y-4">
        <p className="text-3xl font-black text-slate-900">👤 {w.whichIsYours}</p>
        <div className="grid gap-4">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => {
                if (!preview) storeTabChoice(code, t.id);
                setChosenTab(t.id);
              }}
              className="min-h-[110px] rounded-3xl bg-white px-6 text-left text-3xl font-black leading-tight text-slate-900 shadow-sm active:bg-gray-100"
            >
              {lang === "en" ? t.name : translated(translations, t.name, lang)}
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <VisitScreen
      key={tab.id}
      code={code}
      tab={tab}
      canChangeTab={tabs.length > 1 && !tabs.some((t) => t.id === linkTabId)}
      onChangeTab={() => {
        if (!preview) storeTabChoice(code, null);
        setChosenTab(null);
      }}
      name={name}
      lang={lang}
      w={w}
      placeName={placeName}
      translations={translations}
      queue={queue}
      preview={preview}
      onFinished={onFinished}
    />
  );
}

function VisitScreen({
  code,
  tab,
  canChangeTab,
  onChangeTab,
  name,
  lang,
  w,
  placeName,
  translations,
  queue,
  preview,
  onFinished,
}: {
  code: string;
  tab: ChecklistTabDef;
  canChangeTab: boolean;
  onChangeTab: () => void;
  name: string;
  lang: TeamHubLang;
  w: Words;
  placeName: string;
  translations: ContentTranslations;
  queue: PhotoQueue;
  preview: boolean;
  onFinished: () => void;
}) {
  const [kept, setKept] = useState<Kept>(() => {
    const loaded = preview ? { current: null, previous: null } : readKept(code, tab.id);
    return { ...loaded, current: loaded.current ?? freshVisit(tab.id) };
  });
  // Showing the last visit (to add photos to it) instead of today's.
  const [onPrevious, setOnPrevious] = useState(false);
  const [asking, setAsking] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [confirmFinish, setConfirmFinish] = useState(false);
  const camera = useRef<HTMLInputElement>(null);
  const gallery = useRef<HTMLInputElement>(null);
  const pickFor = useRef<{ key: string; label: string; from: "camera" | "gallery" } | null>(null);
  const press = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressed = useRef(false);

  const tasks = useMemo(() => taskSections(tab.sections), [tab.sections]);
  const notices = noticeSections(tab.sections);

  function save(next: Kept) {
    setKept(next);
    if (!preview) writeKept(code, tab.id, next);
  }

  // Opening the link: a visit finished on an earlier day becomes "last
  // visit" (photos can still be added the day after it); an older last visit
  // is let go; a visit never finished and older than yesterday is finished by
  // itself (sent with what was done), so nothing taken is lost.
  useEffect(() => {
    if (preview) return;
    const today = dayKey(new Date().toISOString());
    let { current, previous } = readKept(code, tab.id);
    const gone: Visit[] = [];
    if (current && !current.finishedAt && daysBetween(visitDay(current), today) > 1 && (current.startedAt || allPhotoIds(current).length)) {
      sendVisit(current, current.lastAt);
      current = { ...current, finishedAt: current.lastAt };
    }
    if (current?.finishedAt && daysBetween(visitDay(current), today) >= 1) {
      if (previous) gone.push(previous);
      previous = current;
      current = null;
    }
    if (previous && daysBetween(visitDay(previous), today) > 1) {
      gone.push(previous);
      previous = null;
    }
    void dropThumbs(gone.flatMap(allPhotoIds));
    // Today's visit: the one already going, or a new one (kept, so its id stays the same).
    save({ current: current ?? kept.current ?? freshVisit(tab.id), previous });
    // Once, when the screen opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code, tab.id, preview]);

  const visit: Visit = (onPrevious ? kept.previous : kept.current) ?? freshVisit(tab.id);
  const night = useMemo(() => routeNightOf(new Date(visit.startedAt ?? visit.createdAt)), [visit.startedAt, visit.createdAt]);
  const items = useMemo(() => rowsForNight(tasks, night), [tasks, night]);
  const thumbs = useThumbs(allPhotoIds(visit));

  function updateVisit(change: (v: Visit) => Visit) {
    setKept((current) => {
      const base = (onPrevious ? current.previous : current.current) ?? visit;
      const now = new Date().toISOString();
      const changed = { ...change(base), lastAt: now };
      if (!changed.startedAt) changed.startedAt = now;
      const next = onPrevious ? { ...current, previous: changed } : { ...current, current: changed };
      if (!preview) writeKept(code, tab.id, next);
      return next;
    });
  }

  const label = (text: string, es?: string) => (lang === "es" && es ? es : lang === "en" ? text : translated(translations, text, lang));

  const isDone = (item: ChecklistItemDef) => (photoRequired(item) ? (visit.photos[item.key]?.length ?? 0) > 0 : visit.done.includes(item.key));
  const handled = items.filter((item) => visit.skipped[item.key] || isDone(item)).length;
  const left = items.length - handled;

  function openPicker(key: string, itemLabel: string, from: "camera" | "gallery") {
    // A long press (= "Can't do") that ended on a photo button is not a tap.
    if (longPressed.current) {
      longPressed.current = false;
      return;
    }
    navigator.vibrate?.(10);
    setError("");
    setAsking("");
    pickFor.current = { key, label: itemLabel, from };
    (from === "camera" ? camera : gallery).current?.click();
  }

  async function photosPicked(files: File[]) {
    const target = pickFor.current;
    pickFor.current = null;
    if (!target || files.length === 0) return;
    setBusy(target.key);
    try {
      const added = preview
        ? files.map((file, index) => ({ id: `preview-${Date.now()}-${index}`, takenAt: new Date().toISOString(), timeSource: "camera" as PhotoTimeSource, thumb: file as Blob }))
        : await queue.addVisitPhotos(files, name, { visitId: visit.id, itemKey: target.key, from: target.from, placeName, itemLabel: target.label });
      if (added.length === 0) {
        setError(w.photoFailed);
        return;
      }
      for (const photo of added) await saveThumb(photo.id, photo.thumb);
      updateVisit((v) => {
        const skipped = { ...v.skipped };
        delete skipped[target.key];
        return {
          ...v,
          skipped,
          photos: { ...v.photos, [target.key]: [...(v.photos[target.key] ?? []), ...added.map((photo) => ({ id: photo.id, takenAt: photo.takenAt, source: photo.timeSource }))] },
        };
      });
      navigator.vibrate?.(15);
    } finally {
      setBusy("");
    }
  }

  function toggleDone(item: ChecklistItemDef) {
    navigator.vibrate?.(10);
    updateVisit((v) => ({ ...v, done: v.done.includes(item.key) ? v.done.filter((key) => key !== item.key) : [...v.done, item.key] }));
  }

  function skip(item: ChecklistItemDef, reason: SkipReason | null) {
    navigator.vibrate?.(10);
    setAsking("");
    updateVisit((v) => {
      const skipped = { ...v.skipped };
      if (reason) skipped[item.key] = reason;
      else delete skipped[item.key];
      return { ...v, skipped, done: reason ? v.done.filter((key) => key !== item.key) : v.done };
    });
  }

  /** Saves the visit as a normal CW Now checklist (on the phone first; photo-queue sends it). */
  function sendVisit(v: Visit, finishedAt: string) {
    const visitNight = routeNightOf(new Date(v.startedAt ?? v.createdAt));
    const visitItems = new Set(rowsForNight(tasks, visitNight).map((item) => item.key));
    const done = (item: ChecklistItemDef) => (photoRequired(item) ? (v.photos[item.key]?.length ?? 0) > 0 : v.done.includes(item.key));
    const sections: ChecklistSubmissionSection[] = tasks
      .map((section) => ({
        key: section.key,
        title: section.title,
        items: section.items
          .filter((item) => visitItems.has(item.key))
          .map((item) => {
            const reason = v.skipped[item.key];
            const photos = (v.photos[item.key] ?? []).map((photo) => photo.id).slice(0, 10);
            return {
              key: item.key,
              label: item.label,
              ...(item.subNote ? { subNote: item.subNote } : {}),
              checked: !reason && done(item),
              note: "",
              ...(reason ? { skipReason: reason } : {}),
              ...(photos.length ? { photos } : {}),
            };
          }),
      }))
      .filter((section) => section.items.length > 0);
    const extra = (v.photos[EXTRA_ITEM_KEY] ?? []).map((photo) => photo.id);
    if (extra.length) {
      sections.push({
        key: "extra-photos",
        title: "Extra photos",
        items: [{ key: EXTRA_ITEM_KEY, label: `${extra.length} extra photo${extra.length === 1 ? "" : "s"}`, checked: true, note: "", info: true, photos: extra.slice(0, 10) }],
      });
    }
    queue.addChecklist(tab.id, { action: "submit", porterName: name.trim(), startedAt: v.startedAt, generalNotes: "", sections }, { id: v.id, finishedAt });
  }

  function finish() {
    setConfirmFinish(false);
    const at = new Date().toISOString();
    if (!preview) sendVisit(visit, at);
    updateVisit((v) => ({ ...v, finishedAt: at }));
    navigator.vibrate?.([15, 60, 15]);
    window.scrollTo({ top: 0 });
    onFinished();
  }

  function startNewVisit() {
    // The finished one stays as "last visit" (photos can still be added to it).
    const finished = kept.current;
    const gone = kept.previous && finished ? allPhotoIds(kept.previous) : [];
    void dropThumbs(gone);
    save({ current: freshVisit(tab.id), previous: finished ?? kept.previous });
    setOnPrevious(false);
    window.scrollTo({ top: 0 });
  }

  /* ---------- pieces ---------- */

  const photoButtons = (key: string, itemLabel: string, small: boolean) => (
    <div className="grid grid-cols-2 gap-2">
      <button
        type="button"
        onClick={() => openPicker(key, itemLabel, "camera")}
        disabled={Boolean(busy)}
        className={`flex flex-col items-center justify-center rounded-2xl bg-blue-700 px-2 font-black text-white shadow-sm active:bg-blue-800 disabled:opacity-60 ${small ? "min-h-[64px] text-lg" : "min-h-[96px] text-xl"}`}
      >
        <span className={small ? "text-2xl" : "text-4xl"} aria-hidden="true">
          📷
        </span>
        {w.takePhoto}
      </button>
      <button
        type="button"
        onClick={() => openPicker(key, itemLabel, "gallery")}
        disabled={Boolean(busy)}
        className={`flex flex-col items-center justify-center rounded-2xl bg-white px-2 font-black text-blue-900 shadow-sm ring-4 ring-blue-700 active:bg-blue-50 disabled:opacity-60 ${small ? "min-h-[64px] text-lg" : "min-h-[96px] text-xl"}`}
      >
        <span className={small ? "text-2xl" : "text-4xl"} aria-hidden="true">
          🖼️
        </span>
        {w.fromGallery}
      </button>
    </div>
  );

  const photoStrip = (key: string) => {
    const list = visit.photos[key] ?? [];
    if (!list.length) return null;
    const started = visit.startedAt ? new Date(visit.startedAt).getTime() : NaN;
    return (
      <div className="flex gap-2 overflow-x-auto pb-1">
        {list.map((photo) => {
          const earlier = photo.source === "exif" && (new Date(photo.takenAt).getTime() < started - 10 * 60_000 || Date.now() - new Date(photo.takenAt).getTime() > 86_400_000);
          return (
            <figure key={photo.id} className="w-24 shrink-0">
              {thumbs[photo.id] ? (
                // eslint-disable-next-line @next/next/no-img-element -- a picture kept on the phone (blob:), not a site image
                <img src={thumbs[photo.id]} alt="" className="h-24 w-24 rounded-xl object-cover" />
              ) : (
                <div className="flex h-24 w-24 items-center justify-center rounded-xl bg-slate-200 text-3xl">📷</div>
              )}
              {/* The photo's own time, so the right ones can be picked from the gallery. */}
              <figcaption className="mt-0.5 text-center text-sm font-bold leading-tight text-slate-700">
                {dayKey(photo.takenAt) === dayKey(new Date().toISOString()) ? timeOf(photo.takenAt) : `${shortDay(photo.takenAt, lang)} ${timeOf(photo.takenAt)}`}
                {earlier ? <span className="block text-xs text-amber-700">⚠️ {w.earlier}</span> : null}
                {photo.source === "added_later" ? <span className="block text-xs text-slate-500">{w.addedLater}</span> : null}
              </figcaption>
            </figure>
          );
        })}
      </div>
    );
  };

  const reasonPicker = (item: ChecklistItemDef) => (
    <div className="space-y-2 rounded-2xl bg-amber-50 p-3">
      <p className="text-xl font-black text-amber-900">{w.why}</p>
      <div className="grid grid-cols-2 gap-2">
        {ROUTE_SKIP_REASONS.map((reason) => (
          <button key={reason} type="button" onClick={() => skip(item, reason)} className="min-h-[72px] rounded-2xl bg-white px-2 text-xl font-black text-slate-900 shadow-sm active:bg-amber-100">
            {w.reasons[reason]}
          </button>
        ))}
      </div>
      <button type="button" onClick={() => setAsking("")} className="min-h-[52px] w-full rounded-2xl text-lg font-bold text-slate-600 active:bg-white">
        {w.cancel}
      </button>
    </div>
  );

  // Long press on a tile = "Can't do".
  const longPress = (item: ChecklistItemDef) => ({
    onPointerDown: () => {
      longPressed.current = false;
      press.current = setTimeout(() => {
        longPressed.current = true;
        navigator.vibrate?.(30);
        setAsking(item.key);
      }, 650);
    },
    onPointerUp: () => {
      if (press.current) clearTimeout(press.current);
      // The tap that ends a long press is ignored; the next one counts.
      setTimeout(() => (longPressed.current = false), 400);
    },
    onPointerLeave: () => press.current && clearTimeout(press.current),
    onPointerCancel: () => press.current && clearTimeout(press.current),
    onContextMenu: (event: React.MouseEvent) => event.preventDefault(),
  });

  const tile = (item: ChecklistItemDef, index: number) => {
    const reason = visit.skipped[item.key];
    const done = !reason && isDone(item);
    const needsPhoto = photoRequired(item);
    const text = label(item.label, item.es);
    const [main, detail] = splitName(text);
    const head = (
      <div className="flex items-start gap-3">
        <span
          className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl text-3xl font-black ${done ? "bg-green-600 text-white" : reason ? "bg-amber-500 text-white" : "bg-slate-200 text-slate-600"}`}
          aria-hidden="true"
        >
          {done ? "✓" : reason ? "✕" : index + 1}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-2xl font-black leading-tight text-slate-900">{main}</span>
          {detail ? <span className="mt-0.5 block text-lg font-semibold leading-snug text-slate-600">{detail}</span> : null}
          {item.subNote ? <span className="mt-1 block text-base leading-snug text-slate-500">{label(item.subNote, item.subNoteEs)}</span> : null}
        </span>
      </div>
    );
    return (
      <div
        key={item.key}
        {...longPress(item)}
        className={`space-y-3 rounded-3xl p-4 shadow-sm select-none ${reason ? "bg-amber-50 ring-4 ring-amber-400" : done ? "bg-green-50 ring-4 ring-green-500" : "bg-white"}`}
      >
        {needsPhoto || reason ? (
          head
        ) : (
          // No photo needed: the whole top is one tap.
          <button
            type="button"
            onClick={() => {
              if (!longPressed.current) toggleDone(item);
            }}
            aria-pressed={done}
            className="block w-full text-left"
          >
            {head}
            {!done ? <span className="mt-3 flex min-h-[72px] items-center justify-center rounded-2xl bg-green-600 text-2xl font-black text-white">✓ {w.tapWhenDone}</span> : null}
          </button>
        )}
        {reason ? (
          <div className="flex items-center justify-between gap-2">
            <p className="text-xl font-black text-amber-800">✕ {w.reasons[reason] ?? reason}</p>
            <button type="button" onClick={() => skip(item, null)} className="min-h-[52px] rounded-xl border-2 border-amber-500 bg-white px-4 text-lg font-black text-amber-800">
              {w.undo}
            </button>
          </div>
        ) : null}
        {photoStrip(item.key)}
        {needsPhoto && !reason ? (busy === item.key ? <p className="text-center text-xl font-black text-blue-800">{w.preparing}</p> : photoButtons(item.key, item.label, done)) : null}
        {asking === item.key ? (
          reasonPicker(item)
        ) : !reason && !done ? (
          <div className="flex justify-end">
            <button type="button" onClick={() => setAsking(item.key)} className="min-h-[48px] rounded-xl border-2 border-amber-400 bg-white px-4 text-base font-bold text-amber-800 active:bg-amber-50">
              {w.cantDo}
            </button>
          </div>
        ) : null}
      </div>
    );
  };

  const { state } = queue;
  const waiting = state.checklists + state.waiting + state.preparing + state.stuck;
  const failed = state.checklistsFailed + state.failed.length;
  const anySent = state.checklistsSent + state.sent > 0;
  const finished = Boolean(visit.finishedAt);
  const previous = kept.previous;

  return (
    <div className="space-y-4">
      <input
        ref={camera}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(event) => {
          const files = Array.from(event.target.files ?? []);
          event.target.value = "";
          void photosPicked(files);
        }}
      />
      {/* From the phone's gallery: many at once, no camera. */}
      <input
        ref={gallery}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(event) => {
          const files = Array.from(event.target.files ?? []).filter((file) => file.type.startsWith("image/") || /\.(heic|heif|jpe?g|png|webp)$/i.test(file.name));
          event.target.value = "";
          void photosPicked(files);
        }}
      />

      {/* Sending: "✓ All sent" or "12 waiting for signal". */}
      {!preview && (waiting > 0 || anySent || failed > 0) ? (
        <div className="space-y-2" role="status" aria-live="polite">
          {waiting > 0 ? (
            <div className={`rounded-2xl border-4 p-3 text-center ${state.offline ? "border-amber-500 bg-amber-50 text-amber-900" : "border-blue-600 bg-blue-50 text-blue-900"}`}>
              <p className="text-2xl font-black leading-tight">{state.offline ? w.waiting(waiting) : w.sending(waiting)}</p>
              <p className="mt-1 text-base font-semibold">{w.keepOpen}</p>
            </div>
          ) : anySent ? (
            <div className="rounded-2xl bg-green-600 p-3 text-center text-2xl font-black text-white">{w.allSent}</div>
          ) : null}
          {failed > 0 ? <p className="rounded-2xl border-4 border-red-600 bg-red-50 p-3 text-center text-lg font-black text-red-800">{w.couldNotSend(failed)}</p> : null}
          {state.stuck > 0 ? (
            <button type="button" onClick={queue.retry} className="min-h-[72px] w-full rounded-2xl bg-green-600 text-2xl font-black text-white shadow active:bg-green-700">
              ↻ {w.tryAgain}
            </button>
          ) : null}
        </div>
      ) : null}

      {/* The last visit (finished yesterday or earlier today): photos can still be added to it. */}
      {onPrevious && previous ? (
        <div className="space-y-2 rounded-2xl bg-indigo-700 p-4 text-white">
          <p className="text-xl font-black">{w.addingTo(shortDay(previous.startedAt ?? previous.createdAt, lang))}</p>
          <button type="button" onClick={() => setOnPrevious(false)} className="min-h-[56px] w-full rounded-2xl bg-white text-xl font-black text-indigo-800">
            {w.backToToday}
          </button>
        </div>
      ) : previous && !preview ? (
        <button type="button" onClick={() => setOnPrevious(true)} className="min-h-[64px] w-full rounded-2xl border-4 border-indigo-600 bg-white px-3 text-lg font-black text-indigo-800 active:bg-indigo-50">
          🖼️ {w.lastVisit(shortDay(previous.startedAt ?? previous.createdAt, lang))}
        </button>
      ) : null}

      {finished ? (
        <div className="space-y-3 rounded-3xl bg-green-600 p-5 text-center text-white shadow-lg">
          <p className="text-4xl font-black">{w.finished(timeOf(visit.finishedAt!))}</p>
          <p className="text-lg font-bold">{w.finishedNote}</p>
          {!onPrevious ? (
            <button type="button" onClick={startNewVisit} className="min-h-[64px] w-full rounded-2xl bg-white text-xl font-black text-green-800">
              {w.newVisit}
            </button>
          ) : null}
        </div>
      ) : null}

      {/* Progress, always in view. */}
      <div className="sticky top-0 z-20 -mx-4 bg-slate-100 px-4 pb-2 pt-2">
        <div className="flex items-center justify-between gap-2">
          <p className="text-3xl font-black leading-tight text-slate-900">{w.done(handled, items.length)}</p>
          {canChangeTab && !onPrevious ? (
            <button type="button" onClick={onChangeTab} className="min-h-[44px] shrink-0 rounded-xl px-2 text-base font-bold text-slate-600 active:bg-white">
              👤 {tab.name} · {w.change}
            </button>
          ) : null}
        </div>
        <div className="mt-2 h-6 w-full overflow-hidden rounded-full bg-slate-300" role="progressbar" aria-valuemin={0} aria-valuemax={items.length} aria-valuenow={handled}>
          <div className="h-full rounded-full bg-green-600 transition-all" style={{ width: `${items.length ? Math.round((handled / items.length) * 100) : 0}%` }} />
        </div>
      </div>

      <PhotoPlaceNotes otherAccount={queue.state.otherAccount} onDismiss={queue.dismissOtherAccount} />

      <NoticeBox sections={notices} line={(text) => ({ text: label(text) })} />

      {items.length === 0 ? <p className="rounded-2xl bg-white p-6 text-center text-2xl font-bold text-slate-600 shadow-sm">{w.nothing}</p> : null}
      <div className="space-y-4">{items.map(tile)}</div>

      {/* Anything not on the list. */}
      <div className="space-y-3 rounded-3xl bg-white p-4 shadow-sm ring-4 ring-slate-300">
        <p className="text-2xl font-black text-slate-900">{w.extra}</p>
        <p className="text-lg font-semibold text-slate-600">{w.extraHint}</p>
        {photoStrip(EXTRA_ITEM_KEY)}
        {busy === EXTRA_ITEM_KEY ? <p className="text-center text-xl font-black text-blue-800">{w.preparing}</p> : photoButtons(EXTRA_ITEM_KEY, "Extra photo", false)}
      </div>

      {error ? <p className="rounded-2xl bg-amber-100 px-4 py-3 text-xl font-bold text-amber-900">{error}</p> : null}

      {/* Finish: works with no signal (sent when signal comes back). */}
      {!finished ? (
        <div className="sticky bottom-0 z-20 -mx-4 border-t-2 border-slate-300 bg-slate-100 px-4 pb-4 pt-3">
          {confirmFinish ? (
            <div className="space-y-2">
              <p className="text-center text-2xl font-black text-amber-900">{w.notDoneAsk(left)}</p>
              <div className="grid grid-cols-2 gap-2">
                <button type="button" onClick={() => setConfirmFinish(false)} className="min-h-[72px] rounded-3xl bg-white text-xl font-black text-slate-800 shadow ring-2 ring-slate-300">
                  {w.goBack}
                </button>
                <button type="button" onClick={finish} className="min-h-[72px] rounded-3xl bg-green-600 text-xl font-black text-white shadow-lg active:bg-green-700">
                  {w.yesFinish}
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => (left > 0 ? setConfirmFinish(true) : finish())}
              disabled={items.length === 0 || Boolean(busy) || !name.trim()}
              className="min-h-[80px] w-full rounded-3xl bg-green-600 text-3xl font-black text-white shadow-lg active:bg-green-700 disabled:bg-slate-300 disabled:text-slate-500 disabled:shadow-none"
            >
              ✓ {w.finish}
            </button>
          )}
        </div>
      ) : null}
    </div>
  );
}
