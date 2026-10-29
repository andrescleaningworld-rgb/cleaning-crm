"use client";

// Crew Link "Send photos": the photos waiting on the phone. Each photo is
// made small first (lib/crewPhotos.ts sizes, lib/imageResize.ts preparePhoto,
// one photo at a time), kept in the phone's own storage
// (IndexedDB), and sent one at a time to app/api/porter-checklist/[code]/photos.
// When the signal drops it waits and tries again by itself (and right away
// when the phone says it is back online). Close the page and the photos stay
// on the phone: opening the link again sends the rest. A web page cannot send
// while it is closed (iPhones do not allow it), so the screen says
// "keep this page open" while photos are going.
//
// Without IndexedDB (some private windows) the list lives only while the
// page is open.
//
// The full-size original is never sent (Vercel refuses uploads over 4.5 MB).
// A photo that cannot be made small, or that the server refuses, is not
// sent, and the screen says why (state.failed, words in strings.ts photoWhy).
//
// Route screen Finish (no signal inside the building is normal): the whole
// checklist is put in the same waiting list first (the phone's localStorage,
// it is small), with an id made here and the moment Finish was tapped. The
// same sender sends checklists first, then photos. The server keeps a
// checklist once even if it arrives twice (migration 066, client_id), and
// keeps the Finish time as the submitted time.

import { useCallback, useEffect, useRef, useState } from "react";
import { preparePhoto, type PhotoProblem } from "@/lib/imageResize";
import { CREW_PHOTO_QUALITY, CREW_PHOTO_SIZE, CREW_THUMB_SIZE, type CrewPhotoTag } from "@/lib/crewPhotos";

type Waiting = {
  id: string;
  code: string;
  name: string;
  tag: CrewPhotoTag;
  takenAt: string;
  full: Blob;
  thumb: Blob | null;
  addedAt: number;
  /** Route rows: the row it was taken on. */
  caption?: string;
};

/** Why a photo was not sent: it could not be made small, the server refused it, or the link is off. */
export type CrewPhotoFail = PhotoProblem | "refused" | "linkOff";

/* ---------- the phone's storage ---------- */

const DB_NAME = "crew-link-photos";
const STORE = "waiting";
let memory: Waiting[] = [];

function openDb(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    try {
      if (typeof indexedDB === "undefined") return resolve(null);
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE, { keyPath: "id" });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
      request.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function run<T>(mode: IDBTransactionMode, work: (store: IDBObjectStore) => IDBRequest<T>): Promise<T | null> {
  const db = await openDb();
  if (!db) return null;
  return new Promise((resolve) => {
    try {
      const request = work(db.transaction(STORE, mode).objectStore(STORE));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function saveWaiting(item: Waiting): Promise<void> {
  const ok = await run("readwrite", (store) => store.put(item));
  if (ok === null) memory = [...memory.filter((each) => each.id !== item.id), item];
}

async function dropWaiting(id: string): Promise<void> {
  await run("readwrite", (store) => store.delete(id));
  memory = memory.filter((each) => each.id !== id);
}

async function listWaiting(code: string): Promise<Waiting[]> {
  const stored = ((await run("readonly", (store) => store.getAll() as IDBRequest<Waiting[]>)) ?? []) as Waiting[];
  const all = [...stored, ...memory.filter((each) => !stored.some((s) => s.id === each.id))];
  return all.filter((each) => each.code === code).sort((a, b) => a.addedAt - b.addedAt);
}

/* ---------- checklists waiting (route screen Finish) ---------- */

type WaitingChecklist = {
  id: string;
  code: string;
  tabId: number;
  /** When the crew tapped Finish. */
  finishedAt: string;
  /** What the route screen sends to /api/porter-checklist (action, tabId, porterName, sections…). */
  body: Record<string, unknown>;
  addedAt: number;
};

const checklistsKey = (code: string) => `crew-outbox:${code}`;
// Only when the phone's storage cannot be used (some private windows).
let memoryChecklists: WaitingChecklist[] = [];

function listChecklists(code: string): WaitingChecklist[] {
  try {
    const raw = localStorage.getItem(checklistsKey(code));
    const list = raw ? (JSON.parse(raw) as unknown) : [];
    const stored = Array.isArray(list) ? (list as WaitingChecklist[]).filter((each) => each && typeof each.id === "string") : [];
    return [...stored, ...memoryChecklists.filter((each) => each.code === code && !stored.some((s) => s.id === each.id))].sort((a, b) => a.addedAt - b.addedAt);
  } catch {
    return memoryChecklists.filter((each) => each.code === code);
  }
}

function writeChecklists(code: string, list: WaitingChecklist[]) {
  try {
    if (list.length) localStorage.setItem(checklistsKey(code), JSON.stringify(list));
    else localStorage.removeItem(checklistsKey(code));
    memoryChecklists = memoryChecklists.filter((each) => each.code !== code);
  } catch {
    memoryChecklists = [...memoryChecklists.filter((each) => each.code !== code), ...list];
  }
}

/** Same answers as a photo: "sent", "later" (no signal / server hiccup), or "drop" (will never go). */
async function sendChecklist(item: WaitingChecklist): Promise<{ result: "sent" | "later" } | { result: "drop"; why: CrewPhotoFail }> {
  try {
    const response = await fetch("/api/porter-checklist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...item.body, code: item.code, tabId: item.tabId, clientId: item.id, finishedAt: item.finishedAt }),
    });
    // A Wi-Fi sign-in page can answer 200 with a web page: only a real "success" counts.
    const data = (await response.json().catch(() => null)) as { success?: boolean } | null;
    if (response.ok && data?.success === true) return { result: "sent" };
    // 404 (link off) and 403 (checklist turned off) will not change by trying again; 400 = refused.
    if (response.status === 404 || response.status === 403) return { result: "drop", why: "linkOff" };
    if (response.status === 400) return { result: "drop", why: "refused" };
    return { result: "later" };
  } catch {
    return { result: "later" };
  }
}

/* ---------- sending ---------- */

const newId = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2, 12)}`);
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** "sent": done. "drop": this photo can never go (and why). "later": no signal or a server hiccup. */
async function sendOne(item: Waiting): Promise<{ result: "sent" | "later" } | { result: "drop"; why: CrewPhotoFail }> {
  try {
    const form = new FormData();
    form.append("clientId", item.id);
    form.append("name", item.name);
    form.append("tag", item.tag);
    form.append("takenAt", item.takenAt);
    if (item.caption) form.append("caption", item.caption);
    form.append("full", new File([item.full], "photo.jpg", { type: item.full.type || "image/jpeg" }));
    if (item.thumb) form.append("thumb", new File([item.thumb], "thumb.jpg", { type: "image/jpeg" }));
    const response = await fetch(`/api/porter-checklist/${encodeURIComponent(item.code)}/photos`, { method: "POST", body: form });
    if (response.ok) return { result: "sent" };
    // 404 (link off), 413 (too big) and 400 (bad photo) will not change by trying again.
    if (response.status === 404) return { result: "drop", why: "linkOff" };
    if (response.status === 413) return { result: "drop", why: "tooBig" };
    if (response.status === 400) return { result: "drop", why: "refused" };
    return { result: "later" };
  } catch {
    return { result: "later" };
  }
}

export type PhotoQueueState = {
  /** Photos still on the phone. */
  waiting: number;
  /** Sent in this round (since the last time everything was sent). */
  sent: number;
  /** Photos that could not go in this round, each with why. */
  failed: CrewPhotoFail[];
  /** Getting photos ready (made small) before they go in the list. */
  preparing: number;
  /** Waiting for the signal to come back. */
  offline: boolean;
  /** Photos were already waiting when the page opened (shown once: "8 photos still sending"). */
  resumed: number;
  /** Route checklists (Finish) still on the phone, and the tabs they are for. */
  checklists: number;
  checklistTabs: number[];
  /** Route checklists sent since the page opened. */
  checklistsSent: number;
  /** Route checklists that can never go (link turned off, refused). */
  checklistsFailed: number;
};

const sleepOrWake = (ms: number, wake: { current: (() => void) | null }) =>
  Promise.race([sleep(ms), new Promise<void>((resolve) => (wake.current = resolve))]).finally(() => {
    wake.current = null;
  });

export function usePhotoQueue(code: string) {
  const [state, setState] = useState<PhotoQueueState>({
    waiting: 0,
    sent: 0,
    failed: [],
    preparing: 0,
    offline: false,
    resumed: 0,
    checklists: 0,
    checklistTabs: [],
    checklistsSent: 0,
    checklistsFailed: 0,
  });
  const working = useRef(false);
  const wake = useRef<(() => void) | null>(null);

  const showChecklists = useCallback((list: WaitingChecklist[]) => {
    setState((current) => ({ ...current, checklists: list.length, checklistTabs: [...new Set(list.map((each) => each.tabId))] }));
  }, []);

  const pump = useCallback(async () => {
    if (working.current || !code) return;
    working.current = true;
    let delay = 2000;
    try {
      for (;;) {
        // Checklists first: small, and what the office waits for.
        const checklists = listChecklists(code);
        showChecklists(checklists);
        const list = checklists.length ? [] : await listWaiting(code);
        if (!checklists.length) setState((current) => ({ ...current, waiting: list.length }));
        if (checklists.length === 0 && list.length === 0) break;

        const outcome = checklists.length ? await sendChecklist(checklists[0]) : await sendOne(list[0]);
        if (outcome.result === "later") {
          setState((current) => ({ ...current, offline: true }));
          // Wait, longer each time (up to 30 seconds), or until the phone is back online / the page is looked at again.
          await sleepOrWake(delay, wake);
          delay = Math.min(30_000, delay * 2);
          continue;
        }
        delay = 2000;
        if (checklists.length) {
          const sentId = checklists[0].id;
          const rest = listChecklists(code).filter((each) => each.id !== sentId);
          writeChecklists(code, rest);
          showChecklists(rest);
          setState((current) => ({
            ...current,
            offline: false,
            checklistsSent: current.checklistsSent + (outcome.result === "sent" ? 1 : 0),
            checklistsFailed: current.checklistsFailed + (outcome.result === "drop" ? 1 : 0),
          }));
          continue;
        }
        await dropWaiting(list[0].id);
        setState((current) => ({
          ...current,
          offline: false,
          sent: current.sent + (outcome.result === "sent" ? 1 : 0),
          failed: outcome.result === "drop" ? [...current.failed, outcome.why] : current.failed,
        }));
      }
    } finally {
      working.current = false;
    }
    // Something added just as the list ran out: send it too.
    if (listChecklists(code).length > 0 || (await listWaiting(code)).length > 0) void pumpRef.current();
  }, [code, showChecklists]);
  const pumpRef = useRef(pump);
  useEffect(() => {
    pumpRef.current = pump;
  });

  // Opening the link with photos or checklists still on the phone: say so, and send them.
  useEffect(() => {
    if (!code) return;
    let alive = true;
    const checklists = listChecklists(code);
    showChecklists(checklists);
    void listWaiting(code).then((list) => {
      if (!alive) return;
      setState((current) => ({ ...current, waiting: list.length, resumed: list.length, offline: navigator.onLine === false }));
      if (list.length || checklists.length) void pump();
    });
    // Signal back, or the crew looks at the page again (phone unlocked, back from another app): try right away.
    const tryNow = () => {
      if (document.visibilityState === "hidden") return;
      wake.current?.();
      void pump();
    };
    window.addEventListener("online", tryNow);
    document.addEventListener("visibilitychange", tryNow);
    return () => {
      alive = false;
      window.removeEventListener("online", tryNow);
      document.removeEventListener("visibilitychange", tryNow);
    };
  }, [code, pump, showChecklists]);

  // Closing the page while things are still on the phone: the phone asks "Leave?" first.
  useEffect(() => {
    if (state.waiting === 0 && state.preparing === 0 && state.checklists === 0) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [state.waiting, state.preparing, state.checklists]);

  /**
   * The photos the crew picked: made small, put in the list, and sending
   * starts. Returns the ids of the photos now on the phone (a route row
   * keeps them; a photo that could not be made small is not among them).
   */
  const add = useCallback(
    async (files: File[], name: string, tag: CrewPhotoTag, caption?: string): Promise<string[]> => {
      const ids: string[] = [];
      // A new round starts when nothing is waiting.
      setState((current) => (current.waiting === 0 ? { ...current, sent: 0, failed: [], resumed: 0, preparing: files.length } : { ...current, preparing: current.preparing + files.length }));
      for (const file of files) {
        const prepared = await preparePhoto(file, file.name, { fullSide: CREW_PHOTO_SIZE, thumbSide: CREW_THUMB_SIZE, quality: CREW_PHOTO_QUALITY });
        if (!prepared.ok) {
          setState((current) => ({ ...current, preparing: Math.max(0, current.preparing - 1), failed: [...current.failed, prepared.problem] }));
          continue;
        }
        const { full, thumb } = prepared;
        // The camera's own time when the phone gives it, else now.
        const takenAt = new Date(file.lastModified || Date.now()).toISOString();
        const id = newId();
        await saveWaiting({ id, code, name, tag, takenAt, full, thumb, addedAt: Date.now(), ...(caption ? { caption } : {}) });
        ids.push(id);
        setState((current) => ({ ...current, preparing: Math.max(0, current.preparing - 1), waiting: current.waiting + 1 }));
        void pump();
      }
      return ids;
    },
    [code, pump]
  );

  /**
   * Route screen Finish: the checklist is saved on the phone right away
   * (with its own id and the Finish time), then sent as soon as there is
   * signal. Works with no signal at all.
   */
  const addChecklist = useCallback(
    (tabId: number, body: Record<string, unknown>) => {
      if (!code) return;
      const item: WaitingChecklist = { id: newId(), code, tabId, finishedAt: new Date().toISOString(), body, addedAt: Date.now() };
      const list = [...listChecklists(code), item];
      writeChecklists(code, list);
      showChecklists(list);
      if (navigator.onLine === false) setState((current) => ({ ...current, offline: true }));
      // Try right away, even if the sender is waiting out a no-signal pause.
      wake.current?.();
      void pump();
    },
    [code, pump, showChecklists]
  );

  return { state, add, addChecklist };
}

export type PhotoQueue = ReturnType<typeof usePhotoQueue>;
