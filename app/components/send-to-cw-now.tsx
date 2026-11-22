"use client";

// "Send to team's CW Now" on a complaint or an extra job (the Pin Board popup,
// and the complaint's or the job's own page). It makes a task linked to that
// record, never a second complaint or job.
//   Complaint   Move: the pin leaves Complaints until the task ends. Duplicate: it stays.
//   Extra job   goes to the job's own sub, with the job's words and date.
// Shows nothing while FEATURE_CW_NOW_LINKS is off. The office sees no price here.

import { useEffect, useState } from "react";
import { BigButton, Field, SelectField, Sheet, TextAreaField, showToast } from "@/app/ui";
import { TASK_MAX } from "@/lib/cwNowTasks";
import { dayLabel } from "@/lib/extraJobs";
import type { TaskSubOption } from "@/lib/pg/cw-now-tasks";

type Facts = {
  on: boolean;
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
  const [urgent, setUrgent] = useState(false);
  const [photosRequired, setPhotosRequired] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    const query = jobId ? `view=job&id=${encodeURIComponent(jobId)}` : `view=complaint&key=${encodeURIComponent(complaintKey ?? "")}`;
    fetch(`/api/cw-now-tasks?${query}`, { cache: "no-store" })
      .then((response) => response.json())
      .then((data: Facts & { success?: boolean; ready?: boolean }) => {
        if (!alive || data.success !== true || data.ready !== true) return;
        setFacts(data);
        setSubId(data.assignedSubId ?? "");
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

  async function send() {
    setError("");
    if (!isJob) {
      if (!subId) return setError("Pick the sub.");
      if (!task.trim()) return setError("Write what needs fixing.");
      if (!dueDate) return setError("Pick the due date.");
    }
    setBusy(true);
    try {
      const body = isJob
        ? { action: "fromJob", jobId, dueTime, urgent, photosRequired }
        : { action: "fromComplaint", key: complaintKey, subId, mode, task: task.trim(), dueDate, dueTime, urgent };
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
      <Sheet
        open={open}
        title="Send to team's CW Now"
        text={isJob ? `${facts.jobNumber} · ${facts.accountName}` : facts.accountName}
        onClose={() => setOpen(false)}
        busy={busy}
        actions={
          <BigButton busy={busy} busyLabel="Sending…" onClick={() => void send()} data-send-confirm>
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
            </>
          ) : (
            <>
              <div role="group" aria-label="Move or duplicate" className="ui-actions-row">
                <BigButton kind={mode === "move" ? "main" : "second"} aria-pressed={mode === "move"} onClick={() => setMode("move")}>Move</BigButton>
                <BigButton kind={mode === "duplicate" ? "main" : "second"} aria-pressed={mode === "duplicate"} onClick={() => setMode("duplicate")}>Duplicate</BigButton>
              </div>
              <p className="ui-muted">{mode === "move" ? "The pin leaves Complaints and goes to CW Now. It comes back for your review when the team is done." : "The pin stays in Complaints, and a copy goes to CW Now."}</p>
              <SelectField label="Sub" hint={facts.assignedSubId ? "This account's sub. You can pick another." : "This account has no linked sub. Pick one."} value={subId} onChange={(event) => setSubId(event.target.value)}>
                <option value="">Pick a sub</option>
                {(facts.subs ?? []).map((sub) => (
                  <option key={sub.id} value={sub.id}>
                    {sub.name}{sub.inactive ? " (Inactive)" : ""}
                  </option>
                ))}
              </SelectField>
              <TextAreaField label="What needs fixing" rows={4} maxLength={TASK_MAX} value={task} onChange={(event) => setTask(event.target.value)} />
              <Field label="Due date" type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} />
            </>
          )}
          <Field label="Time (optional)" type="time" value={dueTime} onChange={(event) => setDueTime(event.target.value)} />
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
          {error ? <p className="ui-field-error" role="alert">{error}</p> : null}
        </div>
      </Sheet>
    </>
  );
}
