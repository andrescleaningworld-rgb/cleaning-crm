"use client";

// The office's "Sub to-dos": every CW Now task, by sub, account, status and
// date range. Tap one for its full card (history, notes, photos). Print one
// task for the crew, or a sub's list for a review meeting. Staff only.
//
// Opened for one account (?accountId=&account=, the account page's To-dos tile
// and "See all"): that account's team AND office to-dos on one list, with a
// search box, Open / Done / All and Team / Office / All. A team to-do opens its
// card here; an office one opens its card on the To-Do page.

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import AccountPickerField, { type PickedAccount } from "@/app/components/AccountPickerField";
import { AccountScopeBar, useAccountScope } from "@/app/components/account-scope";
import SubPickerField from "@/app/components/SubPickerField";
import { BigButton, EmptyState, ErrorBox, Field, Screen, SearchBar, SelectField, Sheet, SkeletonList } from "@/app/ui";
import { isOpenTask, officeToday, type StaffTaskRow, type TaskListStatus } from "@/lib/cwNowTasks";
import { dateOrNull } from "@/lib/dateUtils";
import type { TaskSubOption } from "@/lib/pg/cw-now-tasks";
import { CwNowAddSheet, CwNowTaskCard, StaffTaskButton } from "../cw-now-task";

const STATUS_CHOICES: { value: TaskListStatus; label: string }[] = [
  { value: "open", label: "Open" },
  { value: "seen", label: "Seen" },
  { value: "overdue", label: "Overdue" },
  { value: "done", label: "Done" },
  { value: "all", label: "All" },
];

type OfficeToDo = { id: string; dueDate: string; assignedTo: string; accountId?: string; accountName: string; taskType: string; why: string; status: string };
type AccountRow = { key: string; team: boolean; task: StaffTaskRow; statusText?: string; officeId?: string };

const OPEN_DONE = [["open", "Open"], ["done", "Done"], ["all", "All"]] as const;
const WHO = [["all", "All"], ["team", "Team"], ["office", "Office"]] as const;

const officeWord = (status: string) => status.trim().toLowerCase();
const officeDone = (status: string) => ["done", "completed"].includes(officeWord(status));
const officeCancelled = (status: string) => ["cancelled", "canceled"].includes(officeWord(status));

/** An office to-do in the same row the team's use. */
function officeRow(todo: OfficeToDo): AccountRow {
  const who = todo.assignedTo.trim();
  return {
    key: `office-${todo.id}`,
    team: false,
    officeId: todo.id,
    statusText: todo.status.trim() || "Open",
    task: {
      id: 0,
      accountId: todo.accountId ?? "",
      accountName: todo.accountName,
      location: "",
      subId: "",
      subName: who ? `Office · ${who}` : "Office",
      language: "en",
      task: [todo.taskType, todo.why].map((part) => part.trim()).filter(Boolean).join(": "),
      translations: {},
      dueDate: dateOrNull(todo.dueDate) ?? "",
      dueTime: "",
      urgent: false,
      status: officeDone(todo.status) ? "done" : "sent",
      doneAt: "",
    },
  };
}

function SubTodos() {
  const params = useSearchParams();
  const router = useRouter();
  // Opened for one account.
  const scopedId = (params.get("accountId") ?? "").trim();
  const scope = useAccountScope();
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
  const [officeTodos, setOfficeTodos] = useState<OfficeToDo[]>([]);
  const [officeFailed, setOfficeFailed] = useState(false);
  const [search, setSearch] = useState("");
  const [openDone, setOpenDone] = useState<(typeof OPEN_DONE)[number][0]>("open");
  const [who, setWho] = useState<(typeof WHO)[number][0]>("all");

  const query = useMemo(() => {
    if (scopedId) return new URLSearchParams({ status: "all", accountId: scopedId }).toString();
    const search = new URLSearchParams({ status });
    if (subId) search.set("subId", subId);
    if (account) search.set("accountId", account.id);
    if (from) search.set("from", from);
    if (to) search.set("to", to);
    return search.toString();
  }, [scopedId, status, subId, account, from, to]);

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

  // One account: its office to-dos too.
  useEffect(() => {
    if (!scopedId) return;
    let alive = true;
    fetch("/api/to-do", { cache: "no-store" })
      .then(async (response) => {
        const data = (await response.json()) as { success?: boolean; todos?: OfficeToDo[] };
        if (!alive) return;
        if (!response.ok || data.success !== true) return setOfficeFailed(true);
        setOfficeTodos(data.todos ?? []);
        setOfficeFailed(false);
      })
      .catch(() => alive && setOfficeFailed(true));
    return () => {
      alive = false;
    };
  }, [scopedId, reload]);

  const today = officeToday();
  const subName = subs.find((sub) => sub.id === subId)?.name ?? "";

  const accountRows = useMemo(() => {
    if (!scopedId) return [];
    const team: AccountRow[] = (tasks ?? []).map((task) => ({ key: `team-${task.id}`, team: true, task }));
    const office = officeTodos.filter((todo) => scope.matches(todo.accountId, todo.accountName) && !officeCancelled(todo.status)).map(officeRow);
    const words = search.trim().toLowerCase();
    const isOpen = (row: AccountRow) => isOpenTask(row.task.status);
    // Open first, soonest due first (no date last); then done, newest first.
    const order = (a: AccountRow, b: AccountRow) => {
      if (isOpen(a) !== isOpen(b)) return isOpen(a) ? -1 : 1;
      if (!isOpen(a)) return (b.task.doneAt || b.task.dueDate).localeCompare(a.task.doneAt || a.task.dueDate);
      return (a.task.dueDate || "9999").localeCompare(b.task.dueDate || "9999");
    };
    return [...team, ...office]
      .filter((row) => who === "all" || row.team === (who === "team"))
      .filter((row) => openDone === "all" || isOpen(row) === (openDone === "open"))
      .filter((row) => !words || `${row.task.task} ${row.task.subName}`.toLowerCase().includes(words))
      .sort(order);
  }, [scopedId, tasks, officeTodos, scope, search, who, openDone]);

  function openOffice(row: AccountRow) {
    const search = new URLSearchParams({ accountId: scope.accountId, account: scope.accountName, id: row.officeId ?? "" });
    if (row.task.status === "done") search.set("status", "Done");
    router.push(`/to-do?${search.toString()}`);
  }

  const choice = <T extends string,>(label: string, list: readonly (readonly [T, string])[], value: T, set: (next: T) => void) => (
    <div role="group" aria-label={label} className="ui-actions-row">
      {list.map(([key, word]) => (
        <BigButton key={key} kind={value === key ? "main" : "second"} aria-pressed={value === key} onClick={() => set(key)}>{word}</BigButton>
      ))}
    </div>
  );

  return (
    <Screen
      title={scopedId ? "To-dos" : "CW Now to-dos"}
      subtitle={scopedId ? scope.accountName || params.get("account") || "" : subName || "Every sub's to-dos"}
      backHref={scopedId ? `/accounts/${encodeURIComponent(scopedId)}` : "/board"}
    >
      <AccountScopeBar scope={scope} what="to-dos" />
      {scopedId ? (
        <div className="ui-stack">
          <SearchBar value={search} onChange={setSearch} label="Search to-dos" placeholder="Search task or sub" />
          {choice("Open or done", OPEN_DONE, openDone, setOpenDone)}
          {choice("Team or office", WHO, who, setWho)}
        </div>
      ) : (
        <>
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
        </>
      )}

      {scopedId && officeFailed ? <ErrorBox title="The office to-dos did not load." onRetry={() => void load()} /> : null}
      {scopedId && state === "failed" ? <ErrorBox title="The team to-dos did not load." onRetry={() => void load()} /> : null}

      {state === "loading" ? (
        <SkeletonList rows={3} />
      ) : scopedId ? (
        accountRows.length === 0 ? (
          <EmptyState title="No to-dos match" text="Try another search or filter." icon="check" />
        ) : (
          <ul className="ui-list-plain ui-stack" data-account-todos>
            {accountRows.map((row) => (
              <li key={row.key} data-todo-kind={row.team ? "team" : "office"}>
                <StaffTaskButton task={row.task} today={today} hideAccount statusText={row.statusText} onOpen={() => (row.team ? setOpenId(row.task.id) : openOffice(row))} />
              </li>
            ))}
          </ul>
        )
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
