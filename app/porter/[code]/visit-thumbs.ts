"use client";

// Photo Checklist: the small stamped copy of each photo, kept on the phone
// (IndexedDB) so a tile still shows its photos after the page is closed and
// opened again, with no signal. The photo itself is in the sending list
// (photo-queue.ts) until it is sent. Removed with the visit. Without
// IndexedDB (some private windows) they live only while the page is open.

import { useEffect, useState } from "react";

const DB_NAME = "crew-photo-checklist";
const STORE = "thumbs";
const memory = new Map<string, Blob>();

function openDb(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    try {
      if (typeof indexedDB === "undefined") return resolve(null);
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE);
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

export async function saveThumb(id: string, thumb: Blob | null): Promise<void> {
  if (!thumb || thumb.size === 0) return;
  memory.set(id, thumb);
  await run("readwrite", (store) => store.put(thumb, id));
}

export async function dropThumbs(ids: string[]): Promise<void> {
  for (const id of ids) {
    memory.delete(id);
    await run("readwrite", (store) => store.delete(id));
  }
}

async function readThumb(id: string): Promise<Blob | null> {
  const kept = memory.get(id);
  if (kept) return kept;
  const stored = await run("readonly", (store) => store.get(id) as IDBRequest<Blob | undefined>);
  return stored instanceof Blob ? stored : null;
}

/** id → a picture address for the screen ("" while loading or when none). Freed when the screen goes. */
export function useThumbs(ids: string[]): Record<string, string> {
  const [urls, setUrls] = useState<Record<string, string>>({});
  const key = ids.join("|");
  useEffect(() => {
    let alive = true;
    const made: string[] = [];
    void (async () => {
      const next: Record<string, string> = {};
      for (const id of key ? key.split("|") : []) {
        const blob = await readThumb(id);
        if (!blob) continue;
        const url = URL.createObjectURL(blob);
        made.push(url);
        next[id] = url;
      }
      if (alive) setUrls(next);
    })();
    return () => {
      alive = false;
      for (const url of made) URL.revokeObjectURL(url);
    };
  }, [key]);
  return urls;
}
