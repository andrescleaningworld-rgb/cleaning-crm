"use client";

// The office's "Sub to-dos": every CW Now task, by sub, account, status and
// date range. Tap one for its full card (history, notes, photos). Print one
// task for the crew, or a sub's list for a review meeting. Staff only.

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import AccountPickerField, { type PickedAccount } from "@/app/components/AccountPickerField";
import { BigButton, EmptyState, ErrorBox, Field, Screen, SelectField, Sheet, SkeletonList } from "@/app/ui";
import { CW_NOW_STATUS_LABEL, DUE_STYLE, DUE_WORDS, officeToday, taskDueState, taskDueText, type StaffTaskRow, type TaskListStatus } from "@/lib/cwNowTasks";
import type { TaskSubOption } from "@/lib/pg/cw-now-tasks";
import { CwNowTaskCard } from "../cw-now-task";

const STATUS_CHOICES: { value: TaskListStatus; label: string }[] = [
  { value: "open", label: "Open" },
  { value: "seen", label: "Seen" },
  { value: "overdue", label: "Overdue" },
  { value: "done", label: "Done" },
  { value: "all", label: "All" },
];

function SubTodos() {
  const params = useSearchParams();
  const [subId, setSubId] = useState(params.get("subId") ?? "");
  const [account, setAccount] = useState<PickedAccount | null>(null);
  const [status, setStatus] = useState<TaskListStatus>("open");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [tasks, setTasks] = useState<StaffTaskRow[] | null>(null);
  const [subs, setSubs] = useState<TaskSubOption[]>([]);
  const [state, setState] = useState<"loading" | "off" | "failed" | "ready">("loading");
  const [openId, setOpenId] = useState(Number(params.get("task") ?? 0) || 0);

  const query = useMemo(() => {
    const search = new URLSearchParams({ status });
    if (subId) search.set("subId", subId);
    if (account) search.set("accountId", account.id);
    if (from) search.set("from", from);
    if (to) search.set("to", to);
    return search.toString();
  }, [status, subId, account, from, to]);

  const [reload, setReload] = useState(0);
  const load = () => setReload((count) => count + 1);

  useEffect(() => {
    let alive = true;
    fetch(`/api/cw-now-tasks?view=list&${query}`, { cache: "no-store" })
      .then(async (response) => {
        const data = (await response.json()) as { success?: boolean; ready?: boolean; tasks?: StaffTaskRow[]; subs?: TaskSubOption[] };
        if (!alive) return;
        if (!response.ok || data.success !== true) return setState("failed");
        if (data.ready !== true) return setState("off");
        setTasks(data.tasks ?? []);
        setSubs(data.subs ?? []);
        setState("ready");
      })
      .catch(() => alive && setState("failed"));
    return () => {
      alive = false;
    };
  }, [query, reload]);

  const today = officeToday();
  const subName = subs.find((sub) => sub.id === subId)?.name ?? "";

  return (
    <Screen title="Sub to-dos" subtitle={subName || "Every CW Now task"} backHref="/board">
      <div className="ui-stack">
        <SelectField label="Sub" value={subId} onChange={(event) => setSubId(event.target.value)}>
          <option value="">All subs</option>
          {subs.map((sub) => (
            <option key={sub.id} value={sub.id}>
              {sub.name}{sub.inactive ? " (inactive)" : ""}
            </option>
          ))}
        </SelectField>
        <AccountPickerField label="Account (optional)" value={account} onChange={setAccount} />
        <SelectField label="Status" value={status} onChange={(event) => setStatus(event.target.value as TaskListStatus)}>
          {STATUS_CHOICES.map((choice) => (
            <option key={choice.value} value={choice.value}>{choice.label}</option>
          ))}
        </SelectField>
        <div className="ui-actions-row">
          <Field label="Due from" type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
          <Field label="Due to" type="date" value={to} onChange={(event) => setTo(event.target.value)} />
        </div>
        {tasks && tasks.length > 0 ? (
          <BigButton kind="second" href={`/board/sub-todos/print?${query}`}>🖨 Print this list</BigButton>
        ) : null}
      </div>

      {state === "loading" ? (
        <SkeletonList rows={3} />
      ) : state === "off" ? (
        <EmptyState title="Not turned on here yet" text="CW Now to-dos need their database update first." />
      ) : state === "failed" || !tasks ? (
        <ErrorBox title="The to-dos did not load." onRetry={() => void load()} />
      ) : tasks.length === 0 ? (
        <EmptyState title="No to-dos match" text="Try another sub, status or date." icon="check" />
      ) : (
        <ul className="ui-list-plain ui-stack" data-sub-todos>
          {tasks.map((task) => {
            const due = taskDueState(task.dueDate, task.status, today);
            return (
              <li key={task.id}>
                <button
                  type="button"
                  onClick={() => setOpenId(task.id)}
                  data-due-state={due}
                  style={{ width: "100%", textAlign: "left", background: "#fff", border: `3px solid ${DUE_STYLE[due].borderColor}`, borderRadius: 14, padding: 12, display: "grid", gap: 4 }}
                >
                  <span style={{ background: DUE_STYLE[due].background, color: DUE_STYLE[due].color, borderRadius: 8, padding: "4px 10px", fontWeight: 900, fontSize: 18 }}>
                    {DUE_WORDS.en[due]} · {taskDueText(task.dueDate, task.dueTime, "en")}
                  </span>
                  <span className="ui-strong">{task.accountName}{task.kind ? ` · ${task.kind === "extra" ? "Extra job" : "Complaint"}` : ""}{task.urgent && task.status !== "done" ? " ⚠ Urgent" : ""}</span>
                  <span className="ui-muted">{task.subName} · {CW_NOW_STATUS_LABEL[task.status]}</span>
                  <span style={{ whiteSpace: "pre-wrap", overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>{task.task}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <Sheet open={openId > 0} title="CW Now to-do" onClose={() => setOpenId(0)} closeLabel="Close">
        {openId > 0 ? (
          <div className="ui-stack">
            <CwNowTaskCard key={openId} taskId={openId} onChanged={() => void load()} onClosed={() => { setOpenId(0); void load(); }} />
            <BigButton kind="second" href={`/board/sub-todos/print?id=${openId}`}>🖨 Print this task</BigButton>
          </div>
        ) : null}
      </Sheet>
    </Screen>
  );
}

export default function SubTodosPage() {
  return (
    <Suspense fallback={null}>
      <SubTodos />
    </Suspense>
  );
}
