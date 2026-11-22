"use client";

// "Send to team's CW Now" on a complaint (Pin Board popup and the complaint's
// page). Move: the pin leaves Complaints until the task ends. Duplicate: it
// stays there too. Either way it is ONE complaint with a linked task, so it
// never counts twice. Shows nothing while FEATURE_CW_NOW_LINKS is off.

import { useEffect, useState } from "react";
import { BigButton, Field, SelectField, Sheet, TextAreaField, showToast } from "@/app/ui";
import { TASK_MAX } from "@/lib/cwNowTasks";
import type { TaskSubOption } from "@/lib/pg/cw-now-tasks";

type Facts = { on: boolean; accountName?: string; issue?: string; closed?: boolean; assignedSubId?: string; openTask?: { id: number; subName: string } | null; subs?: TaskSubOption[] };

export default function SendToCwNow({ complaintKey, onSent }: { complaintKey: string; onSent?: () => void }) {
  const [facts, setFacts] = useState<Facts | null>(null);
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"move" | "duplicate">("move");
  const [subId, setSubId] = useState("");
  const [task, setTask] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [dueTime, setDueTime] = useState("");
  const [urgent, setUrgent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    fetch(`/api/cw-now-tasks?view=complaint&key=${encodeURIComponent(complaintKey)}`, { cache: "no-store" })
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
  }, [complaintKey]);

  if (!facts?.on || facts.closed) return null;
  if (facts.openTask) return <p className="ui-muted">In CW Now with {facts.openTask.subName}.</p>;

  async function send() {
    setError("");
    if (!subId) return setError("Pick the sub.");
    if (!task.trim()) return setError("Write what needs fixing.");
    if (!dueDate) return setError("Pick the due date.");
    setBusy(true);
    try {
      const response = await fetch("/api/cw-now-tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "fromComplaint", key: complaintKey, subId, mode, task: task.trim(), dueDate, dueTime, urgent }),
      });
      const data = (await response.json().catch(() => ({}))) as { success?: boolean; error?: string };
      if (!response.ok || data.success !== true) throw new Error(data.error || "That did not save. Try again.");
      showToast(mode === "move" ? "Moved to CW Now." : "Copied to CW Now.");
      setOpen(false);
      setFacts({ ...facts!, openTask: { id: 0, subName: facts!.subs?.find((sub) => sub.id === subId)?.name ?? "the team" } });
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
        text={facts.accountName}
        onClose={() => setOpen(false)}
        busy={busy}
        actions={
          <BigButton busy={busy} busyLabel="Sending…" onClick={() => void send()}>
            Send
          </BigButton>
        }
      >
        <div className="ui-stack">
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
          <Field label="Time (optional)" type="time" value={dueTime} onChange={(event) => setDueTime(event.target.value)} />
          <label className="ui-strong" style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <input type="checkbox" checked={urgent} onChange={(event) => setUrgent(event.target.checked)} style={{ width: 24, height: 24 }} />
            Urgent
          </label>
          {error ? <p className="ui-field-error" role="alert">{error}</p> : null}
        </div>
      </Sheet>
    </>
  );
}
