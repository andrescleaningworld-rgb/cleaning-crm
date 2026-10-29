"use client";

// Photos -> "Import photos" for ONE account (staff only): old crew photos
// (WhatsApp, a Google Drive folder) in bulk, as "Crew" photos the customer
// sees in the customer portal, each under the day it was taken.
//   1. Pick many photos at once, or a .zip (a downloaded Drive folder).
//   2. The page reads each one: its date (lib/photoDate.ts: the camera's date,
//      else the file name's, else the file's date) and its fingerprint
//      (SHA-256), and asks which are already in (skipped).
//   3. Photos with no date get one date for all of them, picked here.
//   4. Import: made small here (1600px + 400px copy, one photo at a time,
//      lib/imageResize.ts preparePhoto), sent three at a time, "120 of 340
//      imported", then what was imported, skipped and failed, each with why.
//      A full-size original is never sent (Vercel refuses uploads over 4.5 MB).
// On a phone there are two buttons: "Choose photos" (the phone's photos or
// camera; an iPhone hands over JPEGs) and "Choose a .zip".
// Server: app/api/photo-index/import (lib/pg/crew-photos.ts addImportedPhoto).

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { BigButton, ErrorBox, Field, Sheet } from "@/app/ui";
import { readZip } from "@/lib/zipReader";
import { newYorkTime, photoDate, type PhotoDate, type PhotoDateSource } from "@/lib/photoDate";
import { photoProblemText, preparePhoto, readUploadReply } from "@/lib/imageResize";
import { CREW_PHOTO_QUALITY, CREW_PHOTO_SIZE, CREW_THUMB_SIZE } from "@/lib/crewPhotos";

type Item = { name: string; modified: number | null; read: () => Promise<Blob>; hash: string; date: PhotoDate; duplicate: boolean };
type Failed = { name: string; why: string };
type Stage = "pick" | "reading" | "review" | "importing" | "done";

const PHOTO_NAME = /\.(jpe?g|png|heic|heif|webp)$/i;
const AT_ONCE = 3;
const SOURCE_WORDS: Record<Exclude<PhotoDateSource, "">, string> = { photo: "the camera's date", name: "the file name", file: "the file's date" };

async function fingerprint(blob: Blob): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", await blob.arrayBuffer());
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// A phone: the photo picker takes photos only (with .heic on the list an iPhone
// hands over HEIC files instead of JPEGs, and Android opens its Files app).
const onPhone = () => window.matchMedia?.("(pointer: coarse)").matches === true;
const noChange = () => () => {};

export default function ImportPhotos({ accountId, accountName, onImported }: { accountId: string; accountName: string; onImported: () => void }) {
  const [open, setOpen] = useState(false);
  const [stage, setStage] = useState<Stage>("pick");
  const [items, setItems] = useState<Item[]>([]);
  const [notPhotos, setNotPhotos] = useState(0);
  const [read, setRead] = useState({ done: 0, total: 0 });
  const [batchDay, setBatchDay] = useState("");
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [result, setResult] = useState({ imported: 0, duplicates: 0, failed: [] as Failed[] });
  const [error, setError] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const zipInput = useRef<HTMLInputElement>(null);
  const phone = useSyncExternalStore(noChange, onPhone, () => false);

  // Closing the page mid-import: the browser asks first.
  useEffect(() => {
    if (stage !== "importing" && stage !== "reading") return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [stage]);

  const reset = () => {
    setStage("pick");
    setItems([]);
    setNotPhotos(0);
    setRead({ done: 0, total: 0 });
    setBatchDay("");
    setProgress({ done: 0, total: 0 });
    setResult({ imported: 0, duplicates: 0, failed: [] });
    setError("");
  };

  /** Reads what was picked: the photos in it, their dates and fingerprints, and which are already in. */
  async function readPicked(files: File[]) {
    setError("");
    setStage("reading");
    try {
      const found: { name: string; modified: number | null; read: () => Promise<Blob> }[] = [];
      let others = 0;
      for (const file of files) {
        if (/\.zip$/i.test(file.name) || file.type === "application/zip" || file.type === "application/x-zip-compressed") {
          for (const entry of await readZip(file)) {
            if (PHOTO_NAME.test(entry.name)) found.push({ name: entry.name, modified: entry.modified, read: entry.read });
            else others++;
          }
        } else if (file.type.startsWith("image/") || PHOTO_NAME.test(file.name)) {
          found.push({ name: file.name, modified: file.lastModified || null, read: async () => file });
        } else others++;
      }
      setNotPhotos(others);
      setRead({ done: 0, total: found.length });

      const list: Item[] = [];
      const seen = new Set<string>();
      for (const [i, each] of found.entries()) {
        try {
          const blob = await each.read();
          const hash = await fingerprint(blob);
          const date = await photoDate(blob, each.name, each.modified);
          // The same file twice in what was picked: the second is a duplicate.
          list.push({ ...each, hash, date, duplicate: seen.has(hash) });
          seen.add(hash);
        } catch (err) {
          // Shown as "could not be read" in the review, and as failed after the import.
          list.push({ ...each, hash: "", date: { at: "", source: "" }, duplicate: false });
          console.error("[import photos] could not read", each.name, err);
        }
        setRead({ done: i + 1, total: found.length });
      }

      // Already in this account from an earlier import: skipped.
      const hashes = [...seen];
      const already = new Set<string>();
      for (let i = 0; i < hashes.length; i += 500) {
        const response = await fetch("/api/photo-index/import", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "check", accountId, hashes: hashes.slice(i, i + 500) }) });
        const reply = await readUploadReply<{ success?: boolean; error?: string; already?: string[] }>(response);
        if (!reply.ok) throw new Error(`Could not check which photos are already in: ${reply.error}`);
        for (const hash of reply.data.already ?? []) already.add(hash);
      }
      setItems(list.map((item) => (already.has(item.hash) ? { ...item, duplicate: true } : item)));
      setStage("review");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Those files could not be read.");
      setStage("pick");
    }
  }

  const toImport = items.filter((item) => !item.duplicate);
  const unreadable = toImport.filter((item) => !item.hash);
  const noDate = toImport.filter((item) => item.hash && !item.date.at);
  const bySource = (source: PhotoDateSource) => toImport.filter((item) => item.hash && item.date.source === source).length;
  const needDay = noDate.length > 0;
  const dayOk = !needDay || /^\d{4}-\d{2}-\d{2}$/.test(batchDay);

  /** One photo: made small, sent, tried again on a bad connection. "" = done; "dup" = already in; else why it failed. */
  async function importOne(item: Item): Promise<"" | "dup" | string> {
    if (!item.hash) return "This file could not be read.";
    const blob = await item.read();
    const prepared = await preparePhoto(blob, item.name, { fullSide: CREW_PHOTO_SIZE, thumbSide: CREW_THUMB_SIZE, quality: CREW_PHOTO_QUALITY });
    if (!prepared.ok) return photoProblemText(prepared.problem);
    const { full, thumb } = prepared;
    const [y, m, d] = batchDay.split("-").map(Number);
    const takenAt = item.date.at || newYorkTime(y, m, d);
    for (let attempt = 1; ; attempt++) {
      try {
        const form = new FormData();
        form.append("accountId", accountId);
        form.append("accountName", accountName);
        form.append("hash", item.hash);
        form.append("takenAt", takenAt);
        form.append("full", new File([full], "photo.jpg", { type: "image/jpeg" }));
        if (thumb) form.append("thumb", new File([thumb], "thumb.jpg", { type: "image/jpeg" }));
        const response = await fetch("/api/photo-index/import", { method: "POST", body: form });
        const reply = await readUploadReply<{ success?: boolean; error?: string; already?: boolean }>(response);
        if (reply.ok) return reply.data.already ? "dup" : "";
        // Trying again will not change these: say why now.
        if (response.status < 500) return reply.error;
        if (attempt >= 4) return reply.error;
      } catch {
        if (attempt >= 4) return "No connection. Check the signal and import again (photos already in are skipped).";
      }
      await sleep(1500 * attempt);
    }
  }

  async function runImport() {
    if (!dayOk) return;
    setStage("importing");
    const queue = [...toImport];
    const duplicatesBefore = items.length - toImport.length;
    let imported = 0;
    let duplicates = duplicatesBefore;
    const failed: Failed[] = [];
    let done = 0;
    setProgress({ done: 0, total: queue.length });
    const worker = async () => {
      for (let item = queue.shift(); item; item = queue.shift()) {
        let outcome: string;
        try {
          outcome = await importOne(item);
        } catch (err) {
          outcome = err instanceof Error ? err.message : "It did not save.";
        }
        if (outcome === "") imported++;
        else if (outcome === "dup") duplicates++;
        else failed.push({ name: item.name.split("/").pop() ?? item.name, why: outcome });
        done++;
        setProgress({ done, total: toImport.length });
      }
    };
    await Promise.all(Array.from({ length: AT_ONCE }, worker));
    setResult({ imported, duplicates, failed });
    setStage("done");
    if (imported > 0) onImported();
  }

  const busy = stage === "reading" || stage === "importing";

  return (
    <>
      <BigButton kind="second" onClick={() => setOpen(true)}>
        ⬆ Import photos
      </BigButton>
      {/* On a phone: photos only (gallery or camera). On a computer: photos, iPhone HEIC files or a .zip. */}
      <input
        ref={input}
        type="file"
        multiple
        accept={phone ? "image/*" : "image/*,.heic,.heif,.zip,application/zip"}
        className="hidden"
        style={{ display: "none" }}
        onChange={(event) => {
          const files = Array.from(event.target.files ?? []);
          event.target.value = "";
          if (files.length) void readPicked(files);
        }}
      />
      <input
        ref={zipInput}
        type="file"
        accept=".zip,application/zip,application/x-zip-compressed"
        className="hidden"
        style={{ display: "none" }}
        onChange={(event) => {
          const files = Array.from(event.target.files ?? []);
          event.target.value = "";
          if (files.length) void readPicked(files);
        }}
      />
      <Sheet
        open={open}
        title="Import photos"
        text={`${accountName}: old crew photos, as Crew photos the customer sees in the portal, each under the day it was taken.`}
        busy={busy}
        onClose={() => {
          if (busy) return;
          setOpen(false);
          reset();
        }}
        actions={
          stage === "pick" ? (
            phone ? (
              <>
                <BigButton onClick={() => input.current?.click()}>Choose photos</BigButton>
                <BigButton kind="second" onClick={() => zipInput.current?.click()}>
                  Choose a .zip
                </BigButton>
              </>
            ) : (
              <BigButton onClick={() => input.current?.click()}>Choose photos or a .zip</BigButton>
            )
          ) : stage === "review" ? (
            <>
              <BigButton disabled={toImport.length === 0 || !dayOk} onClick={() => void runImport()}>
                {toImport.length === 0 ? "Nothing new to import" : `Import ${toImport.length} photo${toImport.length === 1 ? "" : "s"}`}
              </BigButton>
              <BigButton kind="second" onClick={reset}>
                Choose other files
              </BigButton>
            </>
          ) : stage === "done" ? (
            <BigButton
              onClick={() => {
                setOpen(false);
                reset();
              }}
            >
              Done
            </BigButton>
          ) : null
        }
      >
        <div className="ui-stack">
          {stage === "pick" ? <p>Pick as many photos as you want (hundreds is fine), or the .zip of a Google Drive folder. Doing it again later is safe: photos already here are skipped.</p> : null}

          {stage === "reading" ? (
            <>
              <p className="ui-strong">
                Reading {read.done} of {read.total || "…"}
              </p>
              <Bar done={read.done} total={read.total} />
              <p className="ui-muted">Keep this page open.</p>
            </>
          ) : null}

          {stage === "review" ? (
            <>
              <p className="ui-strong">
                {items.length} photo{items.length === 1 ? "" : "s"} found{notPhotos ? ` · ${notPhotos} other file${notPhotos === 1 ? "" : "s"} left out (videos, documents)` : ""}.
              </p>
              <ul className="ui-stack" style={{ paddingLeft: 18, listStyle: "disc" }}>
                <li>{toImport.length} new, to import</li>
                {items.length - toImport.length ? <li>{items.length - toImport.length} already here (skipped)</li> : null}
                {(["photo", "name", "file"] as const).map((source) => (bySource(source) ? <li key={source}>{bySource(source)} dated from {SOURCE_WORDS[source]}</li> : null))}
                {noDate.length ? <li>{noDate.length} with no date</li> : null}
                {unreadable.length ? <li>{unreadable.length} could not be read (they will show as failed)</li> : null}
              </ul>
              {needDay ? (
                <Field
                  label={`Date for the ${noDate.length} photo${noDate.length === 1 ? "" : "s"} with no date`}
                  hint="They go under this day in the customer's Photos."
                  type="date"
                  value={batchDay}
                  max={new Date().toISOString().slice(0, 10)}
                  onChange={(event) => setBatchDay(event.target.value)}
                />
              ) : null}
            </>
          ) : null}

          {stage === "importing" ? (
            <>
              <p className="ui-strong">
                {progress.done} of {progress.total} imported
              </p>
              <Bar done={progress.done} total={progress.total} />
              <p className="ui-muted">Keep this page open until it is done.</p>
            </>
          ) : null}

          {stage === "done" ? (
            <>
              <p className="ui-strong">Done.</p>
              <ul className="ui-stack" style={{ paddingLeft: 18, listStyle: "disc" }}>
                <li>✓ {result.imported} imported</li>
                <li>{result.duplicates} skipped (already here)</li>
                <li>{result.failed.length} failed</li>
              </ul>
              {result.failed.length ? (
                <div className="ui-stack">
                  <p className="ui-muted">Failed:</p>
                  {result.failed.slice(0, 30).map((each, i) => (
                    <p key={`${each.name}-${i}`} className="ui-muted">
                      {each.name}: {each.why}
                    </p>
                  ))}
                  {result.failed.length > 30 ? <p className="ui-muted">…and {result.failed.length - 30} more.</p> : null}
                </div>
              ) : null}
            </>
          ) : null}

          {error ? <ErrorBox title="That did not work" text={error} /> : null}
        </div>
      </Sheet>
    </>
  );
}

function Bar({ done, total }: { done: number; total: number }) {
  return (
    <div style={{ height: 12, borderRadius: 999, background: "#e2e8f0", overflow: "hidden" }} aria-hidden="true">
      <div style={{ height: "100%", width: `${total ? Math.round((done / total) * 100) : 0}%`, background: "#16a34a", transition: "width 0.2s" }} />
    </div>
  );
}
