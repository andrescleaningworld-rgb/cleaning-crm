"use client";

// The sub prints their own to-dos (FEATURE_MY_TODOS): ?id=<task> one task,
// ?list=open or ?list=done their list. The answer only ever holds this sub's
// tasks (app/api/subcontractor-portal/my-todos).

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { PrintedList, PrintedTask, TaskPrintStyles, type PrintTask } from "@/app/components/TaskPrintSheet";
import { MY_TODO_WORDS, isOpenTask, type MyTodo } from "@/lib/cwNowTasks";
import { isCrewLang, type CrewLang } from "@/lib/crewLinkPeople";
import { pageFor } from "@/lib/taskPage";
import TaskPageView from "@/app/components/TaskPageView";

function toPrint(task: MyTodo, lang: CrewLang): PrintTask {
  return { id: task.id, accountName: task.accountName, location: task.location, task: lang === "en" ? task.task : task.translations[lang] || task.task, dueDate: task.dueDate, dueTime: task.dueTime, urgent: task.urgent, status: task.status, kind: task.kind, contact: task.contact, photosRequired: task.photosRequired };
}

function Sheet() {
  const params = useSearchParams();
  const asked = params.get("lang");
  const lang: CrewLang = isCrewLang(asked) ? asked : "en";
  const words = MY_TODO_WORDS[lang];
  const id = Number(params.get("id") ?? 0);
  const list = params.get("list") === "done" ? "done" : "open";
  const [tasks, setTasks] = useState<MyTodo[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    fetch("/api/subcontractor-portal/my-todos?full=1", { cache: "no-store" })
      .then(async (response) => {
        const body = (await response.json()) as { success?: boolean; on?: boolean; tasks?: MyTodo[] };
        if (!response.ok || body.success !== true || body.on !== true) return setFailed(true);
        setTasks(body.tasks ?? []);
      })
      .catch(() => setFailed(true));
  }, []);

  if (failed) return <p style={{ padding: 24, fontSize: 18 }}>{words.failed}</p>;
  if (!tasks) return <p style={{ padding: 24, fontSize: 18 }}>{words.loading}</p>;

  const one = id ? tasks.find((task) => task.id === id) : undefined;
  if (id && !one) return <p style={{ padding: 24, fontSize: 18 }}>{words.failed}</p>;
  const shown = tasks.filter((task) => (list === "done" ? task.status === "done" : isOpenTask(task.status)));

  return (
    <>
      <TaskPrintStyles />
      <div className="no-print" style={{ display: "flex", gap: 10, justifyContent: "center", padding: 16 }}>
        <button type="button" className="ui-btn ui-btn-main" onClick={() => window.print()}>🖨 {words.print}</button>
        <button type="button" className="ui-btn ui-btn-second" onClick={() => window.close()}>{words.back}</button>
      </div>
      <div className="task-print-view">
        {one ? <PrintedTask task={toPrint(one, lang)} lang={lang}>{one.pages ? <TaskPageView page={pageFor(one.pages, lang)} lang={lang} /> : undefined}</PrintedTask> : <PrintedList title={words.title} subtitle={list === "done" ? words.finished : undefined} tasks={shown.map((task) => toPrint(task, lang))} lang={lang} />}
      </div>
    </>
  );
}

export default function MyTodosPrintPage() {
  return (
    <Suspense fallback={null}>
      <Sheet />
    </Suspense>
  );
}
