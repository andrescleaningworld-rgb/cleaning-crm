"use client";

// The office's "Sub to-dos": every CW Now task, by sub, account, status and
// date range. Tap one for its full card (history, notes, photos). Print one
// task for the crew, or a sub's list for a review meeting. Staff only.

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import AccountPickerField, { type PickedAccount } from "@/app/components/AccountPickerField";
import SubPickerField from "@/app/components/SubPickerField";
import { BigButton, EmptyState, ErrorBox, Field, Screen, SelectField, Sheet, SkeletonList } from "@/app/ui";
import { officeToday, type StaffTaskRow, type TaskListStatus } from "@/lib/cwNowTasks";
import type { TaskSubOption } from "@/lib/pg/cw-now-tasks";
import { CwNowAddSheet, CwNowTaskCard, StaffTaskButton } from "../cw-now-task";

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
  const [adding, setAdding] = useState(false);

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
    <Screen title="CW Now to-dos" subtitle={subName || "Every sub's to-dos"} backHref="/board">
      <BigButton onClick={() => setAdding(true)} data-new-todo>+ New to-do</BigButton>
      <CwNowAddSheet open={adding} onClose={() => setAdding(false)} onAdded={load} />
      <div className="ui-stack">
        <SubPickerField label="Sub" hint="Leave empty for all subs." subs={subs} value={subId} onChange={setSubId} includeInactive loading={state === "loading"} />
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
          {tasks.map((task) => (
            <li key={task.id}>
              <StaffTaskButton task={task} today={today} onOpen={() => setOpenId(task.id)} />
            </li>
          ))}
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
