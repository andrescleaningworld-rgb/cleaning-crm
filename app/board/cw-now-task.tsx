"use client";

// The CW Now square on the Pin Board: the "Add to-do" form, and the card
// inside a to-do's opened paper (status, Share, the sub's notes and photos,
// Mark done, Cancel). The server side is app/api/cw-now-tasks.

import { upload } from "@vercel/blob/client";
import { useCallback, useEffect, useRef, useState } from "react";
import AccountPickerField, { type PickedAccount } from "@/app/components/AccountPickerField";
import { BigButton, CHEER, Field, SelectField, Sheet, TextAreaField, showToast } from "@/app/ui";
import { whatsappHref } from "@/lib/crewLinkPeople";
import { sizeText } from "@/lib/accountDocuments";
import {
  CW_NOW_STATUS_LABEL,
  TASK_FILE_ACCEPT,
  TASK_FILE_EXTENSIONS,
  TASK_FILE_MAX_BYTES,
  TASK_MAX,
  TASK_MAX_FILES,
  TASK_OFFICE_FOLDER,
  TASK_VIDEO_EXTENSIONS,
  TASK_VIDEO_MAX_BYTES,
  cwNowStepsLine,
  isOpenTask,
  taskDueText,
  type CwNowShareMethod,
  type StaffTask,
} from "@/lib/cwNowTasks";
import type { TaskSubOption } from "@/lib/pg/cw-now-tasks";
import ExtraJobForm from "../extra-jobs/new/form";
import type { ExtraJob } from "@/lib/extraJobs";
import { hasOfficeOnlyWords, type TaskPage } from "@/lib/taskPage";
import TaskPageEditor from "./task-page-editor";
import styles from "./board.module.css";

async function postTask(body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const response = await fetch("/api/cw-now-tasks", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok || data.success !== true) throw new Error(typeof data.error === "string" ? data.error : "That did not save. Try again.");
  return data;
}

const safeName = (name: string) => name.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+/, "").slice(-80) || "file";
const fileProblem = (file: File) => {
  if (!TASK_FILE_EXTENSIONS.test(file.name)) return `${file.name}: that kind of file cannot be attached.`;
  const max = TASK_VIDEO_EXTENSIONS.test(file.name) ? TASK_VIDEO_MAX_BYTES : TASK_FILE_MAX_BYTES;
  return file.size > max ? `${file.name} is too big (up to ${Math.round(max / (1024 * 1024))} MB).` : "";
};

/* ---------- Add to-do ---------- */

export function CwNowAddSheet({ open, onClose, onAdded }: { open: boolean; onClose: () => void; onAdded: () => void }) {
  const [opening, setOpening] = useState(0);
  const [ready, setReady] = useState<boolean | null>(null);
  const [subs, setSubs] = useState<TaskSubOption[]>([]);
  const [privateFiles, setPrivateFiles] = useState(false);
  const [linksOn, setLinksOn] = useState(false);
  const [account, setAccount] = useState<PickedAccount | null>(null);
  const [accountQuery, setAccountQuery] = useState("");
  const [subId, setSubId] = useState("");
  const [subNote, setSubNote] = useState("");
  const [task, setTask] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [dueTime, setDueTime] = useState("");
  const [urgent, setUrgent] = useState(false);
  // "This is an extra job": the account's jobs on Set up, from the real Extra Jobs page.
  const [cwLinksOn, setCwLinksOn] = useState(false);
  const [isExtra, setIsExtra] = useState(false);
  const extraSave = useRef<(() => Promise<ExtraJob | null>) | null>(null);
  // Saved but its task not sent yet: Save again sends it, and never makes a second job.
  const savedJob = useRef<ExtraJob | null>(null);
  const [extraFacts, setExtraFacts] = useState({ description: "", jobDate: "", inHouse: false });
  const [photosRequired, setPhotosRequired] = useState(false);
  // "Make task page with AI": a draft the office edits. Nothing goes out until Save and send.
  const [aiPageOn, setAiPageOn] = useState(false);
  const [page, setPage] = useState<TaskPage | null>(null);
  const [drafting, setDrafting] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setOpening((count) => count + 1);
    setAccount(null);
    setAccountQuery("");
    setSubId("");
    setSubNote("");
    setTask("");
    setDueDate("");
    setDueTime("");
    setUrgent(false);
    setIsExtra(false);
    savedJob.current = null;
    setExtraFacts({ description: "", jobDate: "", inHouse: false });
    setPhotosRequired(false);
    setPage(null);
    setFiles([]);
    setError("");
    setReady(null);
    let alive = true;
    fetch("/api/cw-now-tasks?view=form", { cache: "no-store" })
      .then((response) => response.json())
      .then((data: { success?: boolean; ready?: boolean; subs?: TaskSubOption[]; privateFiles?: boolean; linksOn?: boolean; cwLinksOn?: boolean; aiPageOn?: boolean }) => {
        if (!alive) return;
        if (data.success !== true) throw new Error("failed");
        setReady(data.ready === true);
        setSubs(data.subs ?? []);
        setPrivateFiles(data.privateFiles === true);
        setLinksOn(data.linksOn === true);
        setCwLinksOn(data.cwLinksOn === true);
        setAiPageOn(data.aiPageOn === true);
      })
      .catch(() => {
        if (alive) setError("The form did not load. Close it and try again.");
      });
    return () => {
      alive = false;
    };
  }, [open]);

  // The account's assigned sub fills in by itself. It can still be changed.
  const accountId = account?.id ?? "";
  useEffect(() => {
    if (!accountId) {
      setSubNote("");
      return;
    }
    let alive = true;
    fetch(`/api/cw-now-tasks?view=form&accountId=${encodeURIComponent(accountId)}`, { cache: "no-store" })
      .then((response) => response.json())
      .then((data: { assignedSubId?: string }) => {
        if (!alive) return;
        const id = data.assignedSubId ?? "";
        setSubId(id);
        setSubNote(id ? "This account's sub. You can pick another." : "This account has no linked sub. Pick one.");
      })
      .catch(() => {
        if (alive) setSubNote("Pick the sub.");
      });
    return () => {
      alive = false;
    };
  }, [accountId]);

  const sub = subs.find((entry) => entry.id === subId);

  function addFiles(list: FileList | null) {
    if (!list) return;
    const picked = Array.from(list);
    const problem = picked.map(fileProblem).find(Boolean);
    if (problem) return setError(problem);
    if (files.length + picked.length > TASK_MAX_FILES) return setError(`Up to ${TASK_MAX_FILES} files.`);
    setError("");
    setFiles((now) => [...now, ...picked]);
  }

  async function makePage() {
    setError("");
    const words = isExtra ? extraFacts.description : task;
    if (!words.trim()) return setError(isExtra ? "Write what the job is first." : "Write a few words in Task first.");
    setDrafting(true);
    try {
      const data = await postTask({ action: "aiPage", words: words.trim(), accountName: account?.name ?? "", dueDate: isExtra ? extraFacts.jobDate : dueDate, dueTime });
      setPage(data.page as TaskPage);
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : "The AI did not answer. Try again.");
    } finally {
      setDrafting(false);
    }
  }

  async function save() {
    setError("");
    if (!account?.id) return setError(accountQuery.trim() ? "Pick the account from the list." : "Pick the account.");
    if (!isExtra) {
      if (!subId) return setError("Pick the sub.");
      if (!task.trim()) return setError("Write the task.");
      if (!dueDate) return setError("Pick the due date.");
    } else if (hasOfficeOnlyWords(extraFacts.description)) {
      return setError("Take the price or office words out of \"What is the job?\". The sub reads it.");
    }
    try {
      // An extra job: first the REAL job (EJ-...), with its Sale and the office's email.
      let job = savedJob.current;
      if (isExtra && !job) {
        setBusy("Saving the extra job…");
        job = (await extraSave.current?.()) ?? null;
        if (!job) return;
        savedJob.current = job;
      }
      // In-house: our own crew. No task, no link and no text to a sub.
      if (job?.inHouse) {
        showToast(`Extra job ${job.jobNumber} saved.`);
        onAdded();
        onClose();
        return;
      }
      const uploaded: { url: string; name: string; size: number; contentType: string }[] = [];
      for (const [index, file] of files.entries()) {
        setBusy(`File ${index + 1} of ${files.length}…`);
        const blob = await upload(`${TASK_OFFICE_FOLDER}/${crypto.randomUUID()}-${safeName(file.name)}`, file, { access: "private", handleUploadUrl: "/api/cw-now-tasks/upload", contentType: file.type || undefined });
        uploaded.push({ url: blob.url, name: file.name, size: file.size, contentType: file.type });
      }
      setBusy("Saving…");
      await postTask({ action: "create", accountId: account.id, subId: job ? job.subId : subId, task: job ? job.description : task.trim(), dueDate: job ? job.jobDate : dueDate, dueTime, urgent, files: uploaded, ...(job ? { extraJobId: job.id, photosRequired } : {}), ...(page ? { taskPage: page } : {}) });
      showToast(linksOn ? CHEER.logged : "Saved. Open the pin and use Share to send the link.");
      onAdded();
      onClose();
    } catch (err) {
      const why = err instanceof Error && err.message ? err.message : "That did not save. Try again.";
      setError(savedJob.current ? `Extra job ${savedJob.current.jobNumber} is saved, but it did not go to the sub: ${why} Press Save again to send it.` : why);
    } finally {
      setBusy("");
    }
  }

  const inHouseJob = isExtra && extraFacts.inHouse;

  return (
    <Sheet
      open={open}
      title="New CW Now to-do"
      text="The sub gets it on their phone."
      onClose={onClose}
      busy={Boolean(busy)}
      actions={
        <BigButton busy={Boolean(busy)} busyLabel={busy} disabled={ready !== true} onClick={() => void save()}>
          {inHouseJob ? "Save extra job" : "Save and send"}
        </BigButton>
      }
    >
      <div className="ui-stack">
        {ready === false ? <p className="ui-field-error">CW Now to-dos turn on after database update 087.</p> : null}
        {open ? <AccountPickerField key={opening} label="Account" value={account} onChange={setAccount} onQueryChange={setAccountQuery} /> : null}
        {isExtra ? null : (
        <SelectField label="Sub" hint={subNote || undefined} value={subId} onChange={(event) => setSubId(event.target.value)}>
          <option value="">Pick a sub</option>
          {subs.map((entry) => (
            <option key={entry.id} value={entry.id}>
              {entry.name}
              {entry.inactive ? " (Inactive)" : ""}
            </option>
          ))}
        </SelectField>
        )}
        {!isExtra && sub && !sub.hasPhone ? <p className="ui-muted">No phone on file for this sub, so no text goes out. Use Share on the pin.</p> : null}
        {cwLinksOn ? (
          <div className="ui-stack">
            <label className="ui-strong" style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <input type="checkbox" checked={isExtra} onChange={(event) => setIsExtra(event.target.checked)} style={{ width: 24, height: 24 }} />
              This is an extra job
            </label>
            {isExtra ? (
              account ? (
                <ExtraJobForm key={account.id} accountId={account.id} embedded={{ accountName: account.name, saveRef: extraSave, onChange: setExtraFacts }} />
              ) : (
                <p className="ui-muted">Pick the account first.</p>
              )
            ) : null}
            {isExtra && !inHouseJob ? (
              <label className="ui-strong" style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <input type="checkbox" checked={photosRequired} onChange={(event) => setPhotosRequired(event.target.checked)} style={{ width: 24, height: 24 }} />
                Photos required before Done
              </label>
            ) : null}
            {inHouseJob ? <p className="ui-muted">In-house: no link and no text go to a sub.</p> : null}
          </div>
        ) : null}
        {isExtra ? null : <TextAreaField label="Task" rows={5} maxLength={TASK_MAX} value={task} onChange={(event) => setTask(event.target.value)} />}
        {aiPageOn && !inHouseJob ? (
          <div className="ui-stack">
            <BigButton kind="second" busy={drafting} busyLabel="Writing the page…" onClick={() => void makePage()} data-ai-page>
              {page ? "Make it again with AI" : "Make task page with AI"}
            </BigButton>
            {page ? <TaskPageEditor page={page} onChange={setPage} onRemove={() => setPage(null)} /> : null}
          </div>
        ) : null}
        {isExtra ? null : <Field label="Due date" type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} />}
        {inHouseJob ? null : <Field label="Time (optional)" type="time" value={dueTime} onChange={(event) => setDueTime(event.target.value)} />}
        {inHouseJob ? null : (
        <>
        <div>
          <p className="ui-label">Priority</p>
          <div className={styles.cwNowChoice} role="group" aria-label="Priority">
            <BigButton kind={urgent ? "second" : "main"} aria-pressed={!urgent} onClick={() => setUrgent(false)}>
              Normal
            </BigButton>
            <BigButton kind={urgent ? "main" : "second"} aria-pressed={urgent} onClick={() => setUrgent(true)}>
              Urgent
            </BigButton>
          </div>
        </div>
        <div>
          <p className="ui-label">{isExtra ? "Files for the sub (optional)" : "Files (optional)"}</p>
          {isExtra ? <p className="ui-muted">The sub can open these. Do not attach the estimate here: it has our prices.</p> : null}
          {privateFiles ? (
            <>
              <input type="file" multiple accept={TASK_FILE_ACCEPT} aria-label="Add files" onChange={(event) => { addFiles(event.target.files); event.target.value = ""; }} />
              {files.map((file, index) => (
                <p key={`${file.name}-${index}`} className={styles.cwNowFile}>
                  <span>{file.name} ({sizeText(file.size)})</span>
                  <button type="button" className="ui-link" onClick={() => setFiles((now) => now.filter((_, at) => at !== index))}>
                    Remove
                  </button>
                </p>
              ))}
            </>
          ) : (
            <p className="ui-muted">Files turn on once the private file store is connected.</p>
          )}
        </div>
        </>
        )}
        {error ? <p className="ui-field-error" role="alert">{error}</p> : null}
      </div>
    </Sheet>
  );
}

/* ---------- inside an opened paper ---------- */

const EVENT_WORDS: Record<string, string> = {
  created: "Created",
  text: "Text",
  share: "Link sent",
  seen: "Seen by the sub",
  note: "Note",
  photo: "Photo added",
  reminder: "Reminder",
  done: "Done",
  reopened: "Reopened",
  cancelled: "Cancelled",
};

export function CwNowTaskCard({ taskId, onChanged, onClosed }: { taskId: number; onChanged: () => void; onClosed: () => void }) {
  const [task, setTask] = useState<StaffTask | null>(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState("");
  const [confirmCancel, setConfirmCancel] = useState(false);

  const read = useCallback(async () => {
    try {
      const response = await fetch(`/api/cw-now-tasks?id=${taskId}`, { cache: "no-store" });
      const data = (await response.json()) as { success?: boolean; task?: StaffTask };
      if (!response.ok || !data.task) throw new Error("failed");
      setTask(data.task);
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, [taskId]);

  useEffect(() => {
    void read();
  }, [read]);

  async function logShare(method: CwNowShareMethod, message: string) {
    setBusy(method);
    try {
      await postTask({ action: "share", id: taskId, method });
      showToast(message);
      await read();
      onChanged();
    } catch (error) {
      showToast(error instanceof Error ? error.message : "That did not save.", "bad");
    } finally {
      setBusy("");
    }
  }

  async function copy() {
    if (!task) return;
    try {
      await navigator.clipboard.writeText(task.message);
    } catch {
      showToast("Copy did not work. Try WhatsApp or Email.", "bad");
      return;
    }
    await logShare("copy", "Copied. Paste it to the sub.");
  }

  function shareText() {
    if (!task) return;
    if (task.linksOn) return void logShare("text", "Text sent.");
    // Links are blocked in our own texts: this opens the phone's text app with the message filled in.
    window.location.href = `sms:${task.phone}?&body=${encodeURIComponent(task.message)}`;
    void logShare("text", "Send it in your text app.");
  }

  function shareWhatsapp() {
    if (!task) return;
    window.open(whatsappHref(task.phone, task.message), "_blank", "noopener");
    void logShare("whatsapp", "Send it in WhatsApp.");
  }

  async function close(action: "done" | "cancel") {
    setBusy(action);
    try {
      await postTask({ action, id: taskId });
      showToast(action === "done" ? "Done. It is in the Done tray." : "Cancelled. The sub's link is closed.");
      onChanged();
      onClosed();
    } catch (error) {
      showToast(error instanceof Error ? error.message : "That did not save.", "bad");
    } finally {
      setBusy("");
    }
  }

  if (failed) return <p className="ui-field-error">This to-do did not load.</p>;
  if (!task) return <p className="ui-muted">Loading…</p>;
  const open = isOpenTask(task.status);
  const notes = task.events.filter((event) => event.event === "note");
  const subFiles = task.files.filter((file) => file.source === "sub");
  const officeFiles = task.files.filter((file) => file.source === "office");

  return (
    <div className="ui-stack" data-cw-now-card>
      <p className={task.status === "needs_link" ? styles.cwNowNeeds : styles.cwNowSteps}>{task.status === "needs_link" ? "⚠ Needs link: use Share below" : cwNowStepsLine(task.status)}</p>
      <dl className={styles.bigFacts}>
        <dt>Sub</dt>
        <dd>{task.subName}</dd>
        <dt>Due</dt>
        <dd>
          {taskDueText(task.dueDate, task.dueTime, "en")}
          {task.urgent ? " · Urgent" : ""}
        </dd>
        <dt>Task</dt>
        <dd style={{ whiteSpace: "pre-wrap" }}>{task.task}</dd>
        <dt>By</dt>
        <dd>{task.createdBy}</dd>
      </dl>
      {task.calendarFailed ? <p className="ui-field-error">It did not reach Google Calendar.</p> : null}

      {officeFiles.length > 0 ? (
        <div>
          <p className="ui-label">Files</p>
          {officeFiles.map((file) => (
            <p key={file.id}>
              <a className="ui-link" href={file.url} target="_blank" rel="noopener">
                {file.name}
              </a>{" "}
              <span className="ui-muted">{sizeText(file.size)}</span>
            </p>
          ))}
        </div>
      ) : null}

      {notes.length > 0 || subFiles.length > 0 ? (
        <div>
          <p className="ui-label">From the sub</p>
          {notes.map((note) => (
            <p key={note.id}>
              <strong>{note.by || "Sub"}:</strong> {note.detailEn || note.detail}
              {note.detailEn ? <span className="ui-muted"> (Original: {note.detail})</span> : null}
            </p>
          ))}
          {subFiles.length > 0 ? (
            <div className={styles.cwNowPhotos}>
              {subFiles.map((file) => (
                <a key={file.id} href={file.url} target="_blank" rel="noopener" aria-label="Open photo">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={file.url} alt="" />
                </a>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      {open ? (
        <>
          <p className="ui-label">Share the link</p>
          <div className={styles.cwNowShare}>
            <BigButton kind={task.status === "needs_link" ? "main" : "second"} disabled={busy !== "" || !task.phone} onClick={shareWhatsapp}>WhatsApp</BigButton>
            <BigButton kind="second" disabled={busy !== "" || !task.phone} onClick={shareText}>Text</BigButton>
            <BigButton kind="second" disabled={busy !== ""} onClick={() => void copy()}>Copy</BigButton>
            <BigButton kind="second" disabled={busy !== "" || !task.email} onClick={() => void logShare("email", "Email sent.")}>Email</BigButton>
          </div>
          {!task.phone ? <p className="ui-muted">No phone on file for this sub.</p> : null}
          <div className={styles.sheetButtons}>
            <BigButton icon="check" disabled={busy !== ""} onClick={() => void close("done")}>Mark done</BigButton>
            {confirmCancel ? (
              <BigButton kind="second" disabled={busy !== ""} onClick={() => void close("cancel")}>Yes, cancel it</BigButton>
            ) : (
              <BigButton kind="quiet" disabled={busy !== ""} onClick={() => setConfirmCancel(true)}>Cancel to-do</BigButton>
            )}
          </div>
        </>
      ) : (
        <p className="ui-strong">{CW_NOW_STATUS_LABEL[task.status]}</p>
      )}

      <details>
        <summary className="ui-link">History</summary>
        {task.events.map((event) => (
          <p key={event.id} className="ui-muted">
            {new Date(event.at).toLocaleString("en-US", { timeZone: "America/New_York", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })} · {EVENT_WORDS[event.event] ?? event.event}
            {event.method && event.event === "share" ? ` (${event.method})` : ""}
            {event.detail && event.event !== "note" ? `: ${event.detail}` : ""}
            {event.by ? ` · ${event.by}` : ""}
          </p>
        ))}
      </details>
    </div>
  );
}
