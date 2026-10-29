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
};

export function usePhotoQueue(code: string) {
  const [state, setState] = useState<PhotoQueueState>({ waiting: 0, sent: 0, failed: [], preparing: 0, offline: false, resumed: 0 });
  const working = useRef(false);
  const wake = useRef<(() => void) | null>(null);

  const pump = useCallback(async () => {
    if (working.current || !code) return;
    working.current = true;
    let delay = 2000;
    try {
      for (;;) {
        const list = await listWaiting(code);
        setState((current) => ({ ...current, waiting: list.length }));
        if (list.length === 0) break;
        const outcome = await sendOne(list[0]);
        if (outcome.result === "later") {
          setState((current) => ({ ...current, offline: true }));
          // Wait, longer each time (up to 30 seconds), or until the phone is back online.
          await Promise.race([sleep(delay), new Promise<void>((resolve) => (wake.current = resolve))]);
          wake.current = null;
          delay = Math.min(30_000, delay * 2);
          continue;
        }
        delay = 2000;
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
    // A photo added just as the list ran out: send it too.
    if ((await listWaiting(code)).length > 0) void pumpRef.current();
  }, [code]);
  const pumpRef = useRef(pump);
  useEffect(() => {
    pumpRef.current = pump;
  });

  // Opening the link with photos still on the phone: say so, and send them.
  useEffect(() => {
    let alive = true;
    void listWaiting(code).then((list) => {
      if (!alive) return;
      setState((current) => ({ ...current, waiting: list.length, resumed: list.length }));
      if (list.length) void pump();
    });
    const online = () => {
      wake.current?.();
      void pump();
    };
    window.addEventListener("online", online);
    return () => {
      alive = false;
      window.removeEventListener("online", online);
    };
  }, [code, pump]);

  // Closing the page while photos are going: the phone asks "Leave?" first.
  useEffect(() => {
    if (state.waiting === 0 && state.preparing === 0) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [state.waiting, state.preparing]);

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

  return { state, add };
}

export type PhotoQueue = ReturnType<typeof usePhotoQueue>;
