"use client";

// "Send to team's CW Now" on a complaint or an extra job (the Pin Board popup,
// and the complaint's or the job's own page). It makes a task linked to that
// record, never a second complaint or job.
//   Complaint   Move: the pin leaves Complaints until the task ends. Duplicate: it stays.
//   Extra job   goes to the job's own sub (the pay report follows it), with the
//               job's words and date, or with no due date.
// Shows nothing while FEATURE_CW_NOW_LINKS is off. The office sees no price here.

import { useEffect, useState } from "react";
import SubPickerField from "@/app/components/SubPickerField";
import { BigButton, Field, Sheet, TextAreaField, showToast } from "@/app/ui";
import { TASK_MAX } from "@/lib/cwNowTasks";
import { dayLabel } from "@/lib/extraJobs";
import type { TaskSubOption } from "@/lib/pg/cw-now-tasks";
import type { TaskPage } from "@/lib/taskPage";
import TaskPageEditor from "@/app/board/task-page-editor";
import TaskSendPreview, { useTaskPreview } from "@/app/board/task-send-preview";

type Facts = {
  on: boolean;
  /** The AI task page is on: Send shows the preview first. */
  aiPageOn?: boolean;
  accountId?: string;
  accountName?: string;
  closed?: boolean;
  openTask?: { id: number; subName: string } | null;
  // A complaint
  issue?: string;
  assignedSubId?: string;
  subs?: TaskSubOption[];
  // An extra job
  jobNumber?: string;
  description?: string;
  jobDate?: string;
  subId?: string;
  subName?: string;
  inHouse?: boolean;
};

export default function SendToCwNow({ complaintKey, jobId, onSent }: { complaintKey?: string; jobId?: string; onSent?: () => void }) {
  const isJob = Boolean(jobId);
  const [facts, setFacts] = useState<Facts | null>(null);
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"move" | "duplicate">("move");
  const [subId, setSubId] = useState("");
  const [task, setTask] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [dueTime, setDueTime] = useState("");
  const [noDueDate, setNoDueDate] = useState(false);
  const [urgent, setUrgent] = useState(false);
  const [photosRequired, setPhotosRequired] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const preview = useTaskPreview();

  useEffect(() => {
    let alive = true;
    const query = jobId ? `view=job&id=${encodeURIComponent(jobId)}` : `view=complaint&key=${encodeURIComponent(complaintKey ?? "")}`;
    fetch(`/api/cw-now-tasks?${query}`, { cache: "no-store" })
      .then((response) => response.json())
      .then((data: Facts & { success?: boolean; ready?: boolean }) => {
        if (!alive || data.success !== true || data.ready !== true) return;
        setFacts(data);
        // Only active subs can be picked, so an inactive one does not fill in.
        const inactive = (data.subs ?? []).some((sub) => sub.id === data.assignedSubId && sub.inactive);
        setSubId(inactive ? "" : (data.assignedSubId ?? ""));
        setTask(data.issue ?? "");
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [complaintKey, jobId]);

  if (!facts?.on || facts.closed || facts.inHouse) return null;
  if (facts.openTask) return <p className="ui-muted" data-in-cw-now>In CW Now with {facts.openTask.subName}.</p>;
  if (isJob && !facts.subId) return <p className="ui-muted">Pick the sub on this job first, then it can go to CW Now.</p>;

  const assigned = facts.subs?.find((sub) => sub.id === facts.assignedSubId);
  const subHint = assigned?.inactive ? `This account's sub (${assigned.name}) is inactive. Pick another.` : facts.assignedSubId ? "This account's sub. You can pick another." : "This account has no linked sub. Pick one.";

  const taskWords = (isJob ? (facts.description ?? "") : task).trim();
  const page = preview.pageFor(taskWords);
  const previewAsk = () => ({
    words: taskWords,
    accountId: facts?.accountId ?? "",
    accountName: facts?.accountName ?? "",
    dueDate: isJob ? (noDueDate ? "" : (facts?.jobDate ?? "")) : dueDate,
    dueTime: isJob && noDueDate ? "" : dueTime,
    ...(isJob && jobId ? { jobId } : {}),
  });

  function formProblem(): string {
    if (isJob) return "";
    if (!subId) return "Pick the sub.";
    if (facts?.subs?.some((sub) => sub.id === subId && sub.inactive)) return "This sub is inactive. Pick an active sub.";
    if (!task.trim()) return "Write what needs fixing.";
    if (dueTime && !dueDate) return "Pick a due date for that time, or clear the time.";
    return "";
  }

  /** Send: the preview first while the AI page is on, otherwise straight out as before. */
  function trySend() {
    setError("");
    const problem = formProblem();
    if (problem) return setError(problem);
    if (facts?.aiPageOn) return void preview.make(previewAsk());
    void send(null);
  }

  /** "Make task page with AI": the same preview, any time. It sends nothing. */
  function makePage() {
    setError("");
    if (!taskWords) return setError("Write what needs fixing.");
    void preview.make(previewAsk());
  }

  async function send(chosenPage: TaskPage | null) {
    setError("");
    const problem = formProblem();
    if (problem) return setError(problem);
    setBusy(true);
    try {
      const pagePart = chosenPage ? { taskPage: chosenPage } : {};
      const body = isJob
        ? { action: "fromJob", jobId, dueTime: noDueDate ? "" : dueTime, noDueDate, urgent, photosRequired, ...pagePart }
        : { action: "fromComplaint", key: complaintKey, subId, mode, task: task.trim(), dueDate, dueTime, urgent, ...pagePart };
      const response = await fetch("/api/cw-now-tasks", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = (await response.json().catch(() => ({}))) as { success?: boolean; error?: string };
      if (!response.ok || data.success !== true) throw new Error(data.error || "That did not save. Try again.");
      showToast(isJob ? "Sent to CW Now." : mode === "move" ? "Moved to CW Now." : "Copied to CW Now.");
      setOpen(false);
      const name = isJob ? facts!.subName : facts!.subs?.find((sub) => sub.id === subId)?.name;
      setFacts({ ...facts!, openTask: { id: 0, subName: name || "the team" } });
      onSent?.();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "That did not save. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <BigButton kind="second" onClick={() => setOpen(true)} data-send-cw-now>
        Send to team&apos;s CW Now
      </BigButton>
      <TaskSendPreview preview={preview} urgent={urgent} kind={isJob ? "extra" : "complaint"} photosRequired={isJob ? photosRequired : false} onSend={(chosen) => void send(chosen)} />
      <Sheet
        open={open}
        title="Send to team's CW Now"
        text={isJob ? `${facts.jobNumber} · ${facts.accountName}` : facts.accountName}
        onClose={() => setOpen(false)}
        busy={busy}
        actions={
          <BigButton busy={busy} busyLabel="Sending…" onClick={trySend} data-send-confirm>
            Send
          </BigButton>
        }
      >
        <div className="ui-stack">
          {isJob ? (
            <>
              <p className="ui-strong" style={{ margin: 0 }}>{facts.description}</p>
              <p className="ui-muted" style={{ margin: 0 }}>{facts.jobDate ? dayLabel(facts.jobDate) : ""} · {facts.subName}</p>
              <p className="ui-muted" style={{ margin: 0 }}>The sub sees these words and their pay. To change them, edit the job first.</p>
              <label className="ui-strong" style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <input type="checkbox" checked={noDueDate} onChange={(event) => setNoDueDate(event.target.checked)} style={{ width: 24, height: 24 }} />
                Send with no due date
              </label>
            </>
          ) : (
            <>
              <div role="group" aria-label="Move or duplicate" className="ui-actions-row">
                <BigButton kind={mode === "move" ? "main" : "second"} aria-pressed={mode === "move"} onClick={() => setMode("move")}>Move</BigButton>
                <BigButton kind={mode === "duplicate" ? "main" : "second"} aria-pressed={mode === "duplicate"} onClick={() => setMode("duplicate")}>Duplicate</BigButton>
              </div>
              <p className="ui-muted">{mode === "move" ? "The pin leaves Complaints and goes to CW Now. It comes back for your review when the team is done." : "The pin stays in Complaints, and a copy goes to CW Now."}</p>
              <SubPickerField label="Sub" hint={subHint} subs={facts.subs ?? []} value={subId} onChange={setSubId} />
              <TextAreaField label="What needs fixing" rows={4} maxLength={TASK_MAX} value={task} onChange={(event) => setTask(event.target.value)} />
              <Field label="Due date (optional)" type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} />
            </>
          )}
          {isJob && noDueDate ? null : <Field label="Time (optional)" type="time" value={dueTime} onChange={(event) => setDueTime(event.target.value)} />}
          <label className="ui-strong" style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <input type="checkbox" checked={urgent} onChange={(event) => setUrgent(event.target.checked)} style={{ width: 24, height: 24 }} />
            Urgent
          </label>
          {isJob ? (
            <label className="ui-strong" style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <input type="checkbox" checked={photosRequired} onChange={(event) => setPhotosRequired(event.target.checked)} style={{ width: 24, height: 24 }} />
              Photos required before Done
            </label>
          ) : null}
          {facts.aiPageOn ? (
            <div className="ui-stack">
              <BigButton kind="second" onClick={makePage} data-ai-page>Make task page with AI</BigButton>
              {page ? <TaskPageEditor key={preview.pageKey} page={page} onChange={preview.setPage} onRemove={preview.removePage} /> : null}
            </div>
          ) : null}
          {error ? <p className="ui-field-error" role="alert">{error}</p> : null}
        </div>
      </Sheet>
    </>
  );
}
