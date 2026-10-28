"use client";

// Crew Link "Send photos": the photos waiting on the phone. Each photo is
// made small first (lib/crewPhotos.ts sizes), kept in the phone's own storage
// (IndexedDB), and sent one at a time to app/api/porter-checklist/[code]/photos.
// When the signal drops it waits and tries again by itself (and right away
// when the phone says it is back online). Close the page and the photos stay
// on the phone: opening the link again sends the rest. A web page cannot send
// while it is closed (iPhones do not allow it), so the screen says
// "keep this page open" while photos are going.
//
// Without IndexedDB (some private windows) the list lives only while the
// page is open.

import { useCallback, useEffect, useRef, useState } from "react";
import { shrinkImage } from "@/lib/imageResize";
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
};

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

/** "sent": done. "drop": this photo can never go (not a photo, link off). "later": no signal or a server hiccup. */
async function sendOne(item: Waiting): Promise<"sent" | "drop" | "later"> {
  try {
    const form = new FormData();
    form.append("clientId", item.id);
    form.append("name", item.name);
    form.append("tag", item.tag);
    form.append("takenAt", item.takenAt);
    form.append("full", new File([item.full], "photo.jpg", { type: item.full.type || "image/jpeg" }));
    if (item.thumb) form.append("thumb", new File([item.thumb], "thumb.jpg", { type: "image/jpeg" }));
    const response = await fetch(`/api/porter-checklist/${encodeURIComponent(item.code)}/photos`, { method: "POST", body: form });
    if (response.ok) return "sent";
    // 404 (link off) and 400 (bad photo) will not change by trying again.
    if (response.status === 400 || response.status === 404 || response.status === 413) return "drop";
    return "later";
  } catch {
    return "later";
  }
}

export type PhotoQueueState = {
  /** Photos still on the phone. */
  waiting: number;
  /** Sent in this round (since the last time everything was sent). */
  sent: number;
  /** Photos that could never go (not a photo, or the link was turned off). */
  dropped: number;
  /** Getting photos ready (made small) before they go in the list. */
  preparing: number;
  /** Waiting for the signal to come back. */
  offline: boolean;
  /** Photos were already waiting when the page opened (shown once: "8 photos still sending"). */
  resumed: number;
};

export function usePhotoQueue(code: string) {
  const [state, setState] = useState<PhotoQueueState>({ waiting: 0, sent: 0, dropped: 0, preparing: 0, offline: false, resumed: 0 });
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
        const result = await sendOne(list[0]);
        if (result === "later") {
          setState((current) => ({ ...current, offline: true }));
          // Wait, longer each time (up to 30 seconds), or until the phone is back online.
          await Promise.race([sleep(delay), new Promise<void>((resolve) => (wake.current = resolve))]);
          wake.current = null;
          delay = Math.min(30_000, delay * 2);
          continue;
        }
        delay = 2000;
        await dropWaiting(list[0].id);
        setState((current) => ({ ...current, offline: false, sent: current.sent + (result === "sent" ? 1 : 0), dropped: current.dropped + (result === "drop" ? 1 : 0) }));
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

  /** The photos the crew picked: made small, put in the list, and sending starts. */
  const add = useCallback(
    async (files: File[], name: string, tag: CrewPhotoTag) => {
      // A new round starts when nothing is waiting.
      setState((current) => (current.waiting === 0 ? { ...current, sent: 0, dropped: 0, resumed: 0, preparing: files.length } : { ...current, preparing: current.preparing + files.length }));
      for (const file of files) {
        const full = (await shrinkImage(file, CREW_PHOTO_SIZE, CREW_PHOTO_QUALITY)) ?? file;
        const thumb = await shrinkImage(file, CREW_THUMB_SIZE, CREW_PHOTO_QUALITY);
        // The camera's own time when the phone gives it, else now.
        const takenAt = new Date(file.lastModified || Date.now()).toISOString();
        await saveWaiting({ id: newId(), code, name, tag, takenAt, full, thumb, addedAt: Date.now() });
        setState((current) => ({ ...current, preparing: Math.max(0, current.preparing - 1), waiting: current.waiting + 1 }));
        void pump();
      }
    },
    [code, pump]
  );

  return { state, add };
}
