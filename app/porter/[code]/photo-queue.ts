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
// Every photo and short video the phone gives goes:
//   photo   made small here (a JPEG under 4 MB) and sent to the photos route.
//   raw     a photo this phone cannot make small (an iPhone HEIC photo on an
//           Android phone, a photo too big for the phone's memory): sent as it
//           is, straight to file storage (@vercel/blob/client upload, the
//           permission from ./photos/upload), then the photos route is told
//           (uploadedUrl) and turns it into a JPEG.
//   video   up to ~1 minute / 100 MB, straight to file storage the same way,
//           with a still made here when the phone can.
// Once a big file is in storage the phone forgets it (uploadedUrl): a retry
// only tells the server again.
//
// No signal: each one is tried 3 times by itself (2 s, then 4 s). After that
// it waits for "Try again" (retry(), state.stuck) or for the signal to come
// back. Nothing already sent is sent again; the stuck ones stay on the phone.
// state.items: each file of this round with its status (spinner, ✓, !).
// Only a file that can never go (not a photo or video, a video too long) is
// dropped, with why in plain words (state.failed, strings.ts photoWhy).
//
// Route screen Finish (no signal inside the building is normal): the whole
// checklist is put in the same waiting list first (the phone's localStorage,
// it is small), with an id made here and the moment Finish was tapped. The
// same sender sends checklists first, then photos. The server keeps a
// checklist once even if it arrives twice (migration 066, client_id), and
// keeps the Finish time as the submitted time.
//
// Where the photo was taken: when photos are added, the phone is asked for
// its location once (high accuracy, about 10 seconds; lib/photoLocation.ts).
// It goes with each photo, so a photo sent later (no signal) still says
// where it was taken. Denied or too slow: the photos still go. Never
// tracked: only at that moment. If the phone looks to be at another account
// ("You seem to be at…"), state.otherAccount says which; the photos still go.

import { useCallback, useEffect, useRef, useState } from "react";
import { upload } from "@vercel/blob/client";
import { preparePhoto, type PhotoProblem } from "@/lib/imageResize";
import {
  CREW_PHOTO_QUALITY,
  CREW_PHOTO_SIZE,
  CREW_RAW_PHOTO_MAX_BYTES,
  CREW_THUMB_SIZE,
  CREW_VIDEO_MAX_BYTES,
  CREW_VIDEO_MAX_SECONDS,
  crewUploadExt,
  crewUploadPath,
  isVideoFile,
  uploadContentType,
  type CrewPhotoTag,
} from "@/lib/crewPhotos";
import { phoneLocation, type PhoneLocation } from "@/lib/photoLocation";
import { exifDate } from "@/lib/photoDate";
import { photoStampLines, type PhotoTimeSource } from "@/lib/photoChecklist";
import { stampOnPhone } from "@/lib/photoStampPhone";

/** Tries by itself before "Try again" shows. */
const AUTO_TRIES = 3;

/** Set once the phone was asked for its location (the bilingual note shows only before that). */
export const LOCATION_ASKED_KEY = "crew-link-location-asked";

type Waiting = {
  id: string;
  code: string;
  name: string;
  tag: CrewPhotoTag;
  takenAt: string;
  /** "photo" (made small here; also every photo saved before videos came), "raw" (a photo sent as it is) or "video". */
  kind?: "photo" | "raw" | "video";
  /** photo: the small JPEG. raw / video: the file as picked (emptied once it is in storage). */
  full: Blob;
  thumb: Blob | null;
  /** raw / video: the file's extension ("heic", "mp4"…) and, once uploaded, its address in storage. */
  ext?: string;
  uploadedUrl?: string;
  addedAt: number;
  /** Route rows: the row it was taken on. */
  caption?: string;
  /** Where the phone was when the photo was added (null: not allowed / not found). */
  location?: PhoneLocation | null;
  /** Photo Checklist only (CrewPhotoChecklist.tsx): the visit and item, and the stamp. */
  visit?: WaitingVisit;
};

type WaitingVisit = { visitId: string; itemKey: string; timeSource: PhotoTimeSource; addedAt: string; stamped: boolean; stampLine: string };

/** Photo Checklist: what a tile adds (addVisitPhotos). */
export type VisitPhotoOptions = {
  visitId: string;
  itemKey: string;
  /** Taken now in the app, or picked from the gallery (the photo's own date then). */
  from: "camera" | "gallery";
  /** For the stamp. */
  placeName: string;
  itemLabel: string;
};

/** One photo a Photo Checklist tile now holds: its id, its time (and where that came from), a small copy for the tile. */
export type AddedVisitPhoto = { id: string; takenAt: string; timeSource: PhotoTimeSource; thumb: Blob | null };

/** Why a file can never be sent: not a photo, too big, a video too long, the server refused it, or the link is off. */
export type CrewPhotoFail = PhotoProblem | "videoTooLong" | "refused" | "linkOff";

/** One file of this round, for the screen: a spinner, then ✓ (or ! when it waits for Try again). */
export type SendItem = {
  id: string;
  video: boolean;
  /** A small picture of it ("" = none: a plain 📷 / 🎬 tile). */
  preview: string;
  status: "waiting" | "sending" | "sent" | "stuck" | "failed";
  /** Big files only: how much is up (0-100). */
  percent: number | null;
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

/** The other account the phone seems to be at (the server decides), or null. No signal: null. */
async function checkOtherAccount(code: string, at: PhoneLocation): Promise<string | null> {
  try {
    const response = await fetch(`/api/porter-checklist/${encodeURIComponent(code)}/photos/where`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lat: at.lat, lng: at.lng }),
    });
    const data = (await response.json().catch(() => null)) as { otherAccount?: string | null } | null;
    return typeof data?.otherAccount === "string" && data.otherAccount ? data.otherAccount : null;
  } catch {
    return null;
  }
}

/* ---------- sending ---------- */

const newId = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2, 12)}`);
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Which file store the phone uploads big files to (asked once). */
let storeAccess: Promise<"public" | "private"> | null = null;
function uploadAccess(code: string): Promise<"public" | "private"> {
  storeAccess ??= fetch(`/api/porter-checklist/${encodeURIComponent(code)}/photos/upload`, { cache: "no-store" })
    .then((response) => response.json())
    .then((data: { success?: boolean; private?: boolean }) => {
      if (!data.success) throw new Error("no answer");
      return data.private ? ("private" as const) : ("public" as const);
    })
    .catch((error: unknown) => {
      storeAccess = null;
      throw error;
    });
  return storeAccess;
}

/**
 * "sent": done. "drop": this file can never go (and why). "later": no signal
 * or a server hiccup. A raw photo or a video first goes straight to file
 * storage (once: the address is kept on the phone), then the server is told.
 */
async function sendOne(item: Waiting, onPercent: (percent: number) => void): Promise<{ result: "sent" | "later" } | { result: "drop"; why: CrewPhotoFail }> {
  try {
    const direct = item.kind === "raw" || item.kind === "video";
    if (direct && !item.uploadedUrl) {
      const ext = item.ext || (item.kind === "video" ? "mp4" : "jpg");
      try {
        const blob = await upload(crewUploadPath(item.id, ext), item.full, {
          access: await uploadAccess(item.code),
          handleUploadUrl: `/api/porter-checklist/${encodeURIComponent(item.code)}/photos/upload`,
          contentType: uploadContentType(ext),
          multipart: item.full.size > 8 * 1024 * 1024,
          onUploadProgress: (progress) => onPercent(Math.round(progress.percentage)),
        });
        item.uploadedUrl = blob.url;
      } catch (error) {
        // The link was turned off: trying again will not help. Anything else: no signal.
        if (error instanceof Error && /not active/i.test(error.message)) return { result: "drop", why: "linkOff" };
        return { result: "later" };
      }
      // In storage: the phone keeps only its address (a retry does not upload it again).
      await saveWaiting({ ...item, full: new Blob([]) });
    }
    const form = new FormData();
    form.append("clientId", item.id);
    form.append("name", item.name);
    form.append("tag", item.tag);
    form.append("takenAt", item.takenAt);
    if (item.caption) form.append("caption", item.caption);
    if (direct) form.append("uploadedUrl", item.uploadedUrl ?? "");
    else form.append("full", new File([item.full], "photo.jpg", { type: item.full.type || "image/jpeg" }));
    if (item.thumb) form.append("thumb", new File([item.thumb], "thumb.jpg", { type: "image/jpeg" }));
    if (item.visit) {
      form.append("visitId", item.visit.visitId);
      form.append("itemKey", item.visit.itemKey);
      form.append("timeSource", item.visit.timeSource);
      form.append("addedAt", item.visit.addedAt);
      form.append("stamped", item.visit.stamped ? "1" : "0");
      form.append("stampLine", item.visit.stampLine);
    }
    if (item.location) {
      form.append("lat", String(item.location.lat));
      form.append("lng", String(item.location.lng));
      form.append("accuracy", String(Math.round(item.location.accuracyM)));
    }
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

const withTimeout = <T,>(work: Promise<T>, ms: number) => Promise.race([work, sleep(ms).then(() => Promise.reject(new Error("timeout")))]);

/** A video's length in seconds (null = the phone cannot tell) and a small still of it (null = could not make one). */
async function videoInfo(file: Blob): Promise<{ seconds: number | null; still: Blob | null }> {
  const url = URL.createObjectURL(file);
  const video = document.createElement("video");
  video.preload = "auto";
  video.muted = true;
  video.playsInline = true;
  try {
    const loaded = new Promise<void>((resolve, reject) => {
      video.onloadedmetadata = () => resolve();
      video.onerror = () => reject(new Error("unreadable"));
    });
    video.src = url;
    await withTimeout(loaded, 8000);
    const seconds = Number.isFinite(video.duration) ? video.duration : null;
    let still: Blob | null = null;
    try {
      const seeked = new Promise<void>((resolve) => (video.onseeked = () => resolve()));
      video.currentTime = Math.min(0.5, (seconds ?? 1) / 2);
      await withTimeout(seeked, 5000);
      const scale = Math.min(1, CREW_THUMB_SIZE / Math.max(video.videoWidth || 1, video.videoHeight || 1));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round((video.videoWidth || CREW_THUMB_SIZE) * scale));
      canvas.height = Math.max(1, Math.round((video.videoHeight || CREW_THUMB_SIZE) * scale));
      canvas.getContext("2d")?.drawImage(video, 0, 0, canvas.width, canvas.height);
      still = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.75));
      canvas.width = 0;
      canvas.height = 0;
    } catch {
      still = null;
    }
    return { seconds, still };
  } catch {
    return { seconds: null, still: null };
  } finally {
    video.removeAttribute("src");
    video.load();
    URL.revokeObjectURL(url);
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
  /** "You seem to be at <this account>": the phone is near another account and far from this link's. */
  otherAccount: string | null;
  /** Files tried 3 times with no luck: still on the phone, waiting for "Try again". */
  stuck: number;
  /** Each file of this round, for the screen. */
  items: SendItem[];
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
    otherAccount: null,
    stuck: 0,
    items: [],
  });
  const working = useRef(false);
  const wake = useRef<(() => void) | null>(null);
  // Tries so far, and the files that used up their 3 (they wait for Try again).
  const tries = useRef(new Map<string, number>());
  const stuck = useRef(new Set<string>());
  // The small pictures on screen, freed when a new round starts or the page closes.
  const previews = useRef<string[]>([]);

  const showChecklists = useCallback((list: WaitingChecklist[]) => {
    setState((current) => ({ ...current, checklists: list.length, checklistTabs: [...new Set(list.map((each) => each.tabId))] }));
  }, []);

  const setItem = useCallback((id: string, patch: Partial<SendItem>) => {
    setState((current) => ({ ...current, items: current.items.map((each) => (each.id === id ? { ...each, ...patch } : each)) }));
  }, []);

  /** A tile for the screen. */
  const itemOf = useCallback((item: Pick<Waiting, "id" | "kind" | "thumb">, status: SendItem["status"]): SendItem => {
    let preview = "";
    if (item.thumb && item.thumb.size > 0) {
      preview = URL.createObjectURL(item.thumb);
      previews.current.push(preview);
    }
    return { id: item.id, video: item.kind === "video", preview, status, percent: null };
  }, []);

  useEffect(
    () => () => {
      for (const url of previews.current) URL.revokeObjectURL(url);
    },
    []
  );

  const pump = useCallback(async () => {
    if (working.current || !code) return;
    working.current = true;
    let delay = 2000;
    try {
      for (;;) {
        // Checklists first: small, and what the office waits for.
        const checklists = listChecklists(code);
        showChecklists(checklists);
        const list = checklists.length ? [] : (await listWaiting(code)).filter((each) => !stuck.current.has(each.id));
        if (!checklists.length) setState((current) => ({ ...current, waiting: list.length, stuck: stuck.current.size }));
        if (checklists.length === 0 && list.length === 0) break;

        if (checklists.length) {
          const outcome = await sendChecklist(checklists[0]);
          if (outcome.result === "later") {
            setState((current) => ({ ...current, offline: true }));
            // Wait, longer each time (up to 30 seconds), or until the phone is back online / the page is looked at again.
            await sleepOrWake(delay, wake);
            delay = Math.min(30_000, delay * 2);
            continue;
          }
          delay = 2000;
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

        const item = list[0];
        setItem(item.id, { status: "sending" });
        const outcome = await sendOne(item, (percent) => setItem(item.id, { percent }));
        if (outcome.result === "later") {
          const tried = (tries.current.get(item.id) ?? 0) + 1;
          tries.current.set(item.id, tried);
          setState((current) => ({ ...current, offline: true }));
          if (tried >= AUTO_TRIES) {
            // 3 tries: it stays on the phone and waits for Try again (or the signal coming back).
            stuck.current.add(item.id);
            setItem(item.id, { status: "stuck", percent: null });
            setState((current) => ({ ...current, stuck: stuck.current.size }));
            continue;
          }
          setItem(item.id, { status: "waiting" });
          await sleepOrWake(2000 * tried, wake);
          continue;
        }
        tries.current.delete(item.id);
        await dropWaiting(item.id);
        setItem(item.id, { status: outcome.result === "sent" ? "sent" : "failed", percent: null });
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
    if (listChecklists(code).length > 0 || (await listWaiting(code)).some((each) => !stuck.current.has(each.id))) void pumpRef.current();
  }, [code, showChecklists, setItem]);
  const pumpRef = useRef(pump);
  useEffect(() => {
    pumpRef.current = pump;
  });

  /** "Try again": the files that used up their 3 tries go again (only those; the sent ones stay sent). */
  const retry = useCallback(() => {
    if (stuck.current.size === 0) return;
    const again = new Set(stuck.current);
    stuck.current.clear();
    for (const id of again) tries.current.delete(id);
    setState((current) => ({
      ...current,
      stuck: 0,
      offline: false,
      items: current.items.map((each) => (again.has(each.id) ? { ...each, status: "waiting" as const } : each)),
    }));
    wake.current?.();
    void pump();
  }, [pump]);
  const retryRef = useRef(retry);
  useEffect(() => {
    retryRef.current = retry;
  });

  // Opening the link with photos or checklists still on the phone: say so, and send them.
  useEffect(() => {
    if (!code) return;
    let alive = true;
    const checklists = listChecklists(code);
    showChecklists(checklists);
    void listWaiting(code).then((list) => {
      if (!alive) return;
      setState((current) => ({
        ...current,
        waiting: list.length,
        resumed: list.length,
        offline: navigator.onLine === false,
        items: list.map((each) => itemOf(each, "waiting")),
      }));
      if (list.length || checklists.length) void pump();
    });
    // Signal back: everything goes again (also the ones waiting for Try again).
    const online = () => {
      retryRef.current();
      wake.current?.();
      void pump();
    };
    // The crew looks at the page again (phone unlocked, back from another app): try right away.
    const visible = () => {
      if (document.visibilityState === "hidden") return;
      wake.current?.();
      void pump();
    };
    window.addEventListener("online", online);
    document.addEventListener("visibilitychange", visible);
    return () => {
      alive = false;
      window.removeEventListener("online", online);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [code, pump, showChecklists, itemOf]);

  // Closing the page while things are still on the phone: the phone asks "Leave?" first.
  useEffect(() => {
    if (state.waiting === 0 && state.preparing === 0 && state.checklists === 0 && state.stuck === 0) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [state.waiting, state.preparing, state.checklists, state.stuck]);

  /**
   * The photos and videos the crew picked: made ready, put in the list, and
   * sending starts. Returns the ids now on the phone (a route row keeps them;
   * a file that can never go is not among them).
   */
  const addFiles = useCallback(
    async (files: File[], name: string, tag: CrewPhotoTag, caption?: string, visitOptions?: VisitPhotoOptions): Promise<AddedVisitPhoto[]> => {
      const added: AddedVisitPhoto[] = [];
      // A new round starts when nothing is waiting (nor waiting for Try again).
      setState((current) => {
        if (current.waiting === 0 && current.stuck === 0) {
          for (const url of previews.current) URL.revokeObjectURL(url);
          previews.current = [];
          return { ...current, sent: 0, failed: [], resumed: 0, items: [], preparing: files.length };
        }
        return { ...current, preparing: current.preparing + files.length };
      });
      // Where the phone is, once for the batch, while the first photo is made ready.
      const where = phoneLocation().then((location) => {
        try {
          localStorage.setItem(LOCATION_ASKED_KEY, "1");
        } catch {
          // best-effort: the note may show once more
        }
        if (location && code) void checkOtherAccount(code, location).then((otherAccount) => setState((current) => ({ ...current, otherAccount })));
        return location;
      });
      const never = (why: CrewPhotoFail) => setState((current) => ({ ...current, preparing: Math.max(0, current.preparing - 1), failed: [...current.failed, why] }));
      for (const file of files) {
        const id = newId();
        // The camera's own time when the phone gives it, else now.
        let takenAt = new Date(file.lastModified || Date.now()).toISOString();
        // Photo Checklist: the time saved inside the photo (read before it is
        // made small, which drops it). A gallery photo without one gets the
        // moment it was added, marked "added later".
        let timeSource: PhotoTimeSource = "camera";
        const addedAt = new Date().toISOString();
        if (visitOptions) {
          const inside = isVideoFile(file) ? null : await exifDate(file).catch(() => null);
          if (visitOptions.from === "camera") takenAt = inside ?? addedAt;
          else if (inside) {
            takenAt = inside;
            timeSource = "exif";
          } else {
            takenAt = addedAt;
            timeSource = "added_later";
          }
        }
        const stampLines = visitOptions ? photoStampLines({ at: takenAt, timeSource, placeName: visitOptions.placeName, itemLabel: visitOptions.itemLabel, personName: name }) : [];
        let stamped = false;
        let ready: Pick<Waiting, "kind" | "full" | "thumb" | "ext">;
        if (isVideoFile(file)) {
          // mp4 / mov only.
          const ext = crewUploadExt(file);
          if (ext !== "mp4" && ext !== "mov") {
            never("unreadable");
            continue;
          }
          const info = await videoInfo(file);
          if (file.size > CREW_VIDEO_MAX_BYTES || (info.seconds !== null && info.seconds > CREW_VIDEO_MAX_SECONDS)) {
            never("videoTooLong");
            continue;
          }
          ready = { kind: "video", full: file, thumb: info.still, ext };
        } else {
          const prepared = await preparePhoto(file, file.name, { fullSide: CREW_PHOTO_SIZE, thumbSide: CREW_THUMB_SIZE, quality: CREW_PHOTO_QUALITY });
          if (prepared.ok) {
            ready = { kind: "photo", full: prepared.full, thumb: prepared.thumb };
            // Photo Checklist: the stamp is burned in here, on the phone (no signal needed).
            if (visitOptions) {
              const withStamp = await stampOnPhone(prepared.full, stampLines, CREW_THUMB_SIZE);
              if (withStamp) {
                ready = { kind: "photo", full: withStamp.full, thumb: withStamp.thumb };
                stamped = true;
              }
            }
          } else {
            // This phone cannot make it small (an iPhone photo on Android, not enough memory): it goes as it is, the server makes it a JPEG.
            const ext = crewUploadExt(file);
            if (!ext) {
              never("unreadable");
              continue;
            }
            if (file.size > CREW_RAW_PHOTO_MAX_BYTES) {
              never("tooBig");
              continue;
            }
            ready = { kind: "raw", full: file, thumb: null, ext };
          }
        }
        const location = await where;
        const visit: WaitingVisit | undefined = visitOptions
          ? { visitId: visitOptions.visitId, itemKey: visitOptions.itemKey, timeSource, addedAt, stamped, stampLine: [visitOptions.itemLabel.trim(), name.trim()].filter(Boolean).join(" · ") }
          : undefined;
        const waiting: Waiting = { id, code, name, tag, takenAt, ...ready, addedAt: Date.now(), location, ...(caption ? { caption } : {}), ...(visit ? { visit } : {}) };
        await saveWaiting(waiting);
        added.push({ id, takenAt, timeSource, thumb: ready.thumb });
        const tile = itemOf(waiting, "waiting");
        setState((current) => ({ ...current, preparing: Math.max(0, current.preparing - 1), waiting: current.waiting + 1, items: [...current.items, tile] }));
        void pump();
      }
      return added;
    },
    [code, pump, itemOf]
  );

  /** Send photos and the route rows: the ids now on the phone (a file that can never go is not among them). */
  const add = useCallback(
    async (files: File[], name: string, tag: CrewPhotoTag, caption?: string): Promise<string[]> => (await addFiles(files, name, tag, caption)).map((each) => each.id),
    [addFiles]
  );

  /**
   * Photo Checklist tiles: the photos are timed (the camera, the photo's own
   * date, or "added later"), stamped on the phone, kept with the visit and
   * item, and sent like every other crew photo.
   */
  const addVisitPhotos = useCallback(
    (files: File[], name: string, options: VisitPhotoOptions): Promise<AddedVisitPhoto[]> => addFiles(files, name, "", options.itemLabel, options),
    [addFiles]
  );

  /**
   * Route screen Finish: the checklist is saved on the phone right away
   * (with its own id and the Finish time), then sent as soon as there is
   * signal. Works with no signal at all.
   */
  const addChecklist = useCallback(
    // Photo Checklist: the visit's own id (its photos carry it too) and the moment Finish was tapped.
    (tabId: number, body: Record<string, unknown>, options: { id?: string; finishedAt?: string } = {}) => {
      if (!code) return;
      const item: WaitingChecklist = { id: options.id || newId(), code, tabId, finishedAt: options.finishedAt || new Date().toISOString(), body, addedAt: Date.now() };
      const list = [...listChecklists(code).filter((each) => each.id !== item.id), item];
      writeChecklists(code, list);
      showChecklists(list);
      if (navigator.onLine === false) setState((current) => ({ ...current, offline: true }));
      // Try right away, even if the sender is waiting out a no-signal pause.
      wake.current?.();
      void pump();
    },
    [code, pump, showChecklists]
  );

  const dismissOtherAccount = useCallback(() => setState((current) => ({ ...current, otherAccount: null })), []);

  return { state, add, addVisitPhotos, addChecklist, dismissOtherAccount, retry };
}

export type PhotoQueue = ReturnType<typeof usePhotoQueue>;
