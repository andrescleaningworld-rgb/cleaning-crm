"use client";

// The office's printouts of CW Now to-dos: ?id=<task> one task, in the sub's
// language, for the crew to carry. Otherwise the filtered list, for a review
// meeting with a sub. Only the sub-safe fields: never prices, pay or notes.

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { PrintedList, PrintedTask, TaskPrintStyles, type PrintTask } from "@/app/components/TaskPrintSheet";
import { taskDueText, type StaffTaskRow } from "@/lib/cwNowTasks";
import type { CrewLang } from "@/lib/crewLinkPeople";
import { pageFor } from "@/lib/taskPage";
import TaskPageView from "@/app/components/TaskPageView";

const toPrint = (task: StaffTaskRow, lang: CrewLang): PrintTask => ({
  id: task.id,
  accountName: task.accountName,
  location: task.location,
  task: lang === "en" ? task.task : task.translations[lang] || task.task,
  dueDate: task.dueDate,
  dueTime: task.dueTime,
  urgent: task.urgent,
  status: task.status,
  kind: task.kind,
  contact: task.contact,
  photosRequired: task.photosRequired,
});

function Sheet() {
  const params = useSearchParams();
  const id = Number(params.get("id") ?? 0);
  const from = params.get("from") ?? "";
  const to = params.get("to") ?? "";
  const [tasks, setTasks] = useState<StaffTaskRow[] | null>(null);
  const [failed, setFailed] = useState(false);
  const query = params.toString();

  useEffect(() => {
    fetch(`/api/cw-now-tasks?view=list&full=1&${query}`, { cache: "no-store" })
      .then(async (response) => {
        const body = (await response.json()) as { success?: boolean; ready?: boolean; tasks?: StaffTaskRow[] };
        if (!response.ok || body.success !== true || body.ready !== true) return setFailed(true);
        setTasks(body.tasks ?? []);
      })
      .catch(() => setFailed(true));
  }, [query]);

  if (failed) return <p style={{ padding: 24, fontSize: 18 }}>It did not load. Try again.</p>;
  if (!tasks) return <p style={{ padding: 24, fontSize: 18 }}>Loading…</p>;
  const one = id ? tasks[0] : undefined;
  if (id && !one) return <p style={{ padding: 24, fontSize: 18 }}>That task was not found.</p>;

  const subs = [...new Set(tasks.map((task) => task.subName))];
  const dates = from || to ? `${from ? taskDueText(from, "", "en") : "Start"} to ${to ? taskDueText(to, "", "en") : "now"}` : "";
  const subtitle = [subs.length === 1 ? subs[0] : "", dates].filter(Boolean).join(" · ");

  return (
    <>
      <TaskPrintStyles />
      <div className="no-print" style={{ display: "flex", gap: 10, justifyContent: "center", padding: 16 }}>
        <button type="button" className="ui-btn ui-btn-main" onClick={() => window.print()}>🖨 Print</button>
        <a className="ui-btn ui-btn-second" href="/board/sub-todos">Back</a>
      </div>
      <div className="task-print-view">
        {one ? <PrintedTask task={toPrint(one, one.language)} lang={one.language}>{one.pages ? <TaskPageView page={pageFor(one.pages, one.language)} lang={one.language} /> : undefined}</PrintedTask> : <PrintedList title="Sub to-dos" subtitle={subtitle} tasks={tasks.map((task) => toPrint(task, "en"))} lang="en" />}
      </div>
    </>
  );
}

export default function SubTodosPrintPage() {
  return (
    <Suspense fallback={null}>
      <Sheet />
    </Suspense>
  );
}
