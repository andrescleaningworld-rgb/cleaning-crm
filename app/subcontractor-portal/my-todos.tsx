"use client";

// "My to-dos" on the sub's simple home (FEATURE_MY_TODOS): one big button with
// how many are open, then the list. The due date is big and colored: today
// yellow, late red, done green. Tap a task to open its private page. Shows
// nothing at all while the switch is off.

import { useEffect, useState } from "react";
import { DUE_STYLE, DUE_WORDS, MY_TODO_WORDS, isOpenTask, officeToday, taskDueState, type MyTodo } from "@/lib/cwNowTasks";
import { pageFor } from "@/lib/taskPage";
import { WELCOME_COLORS } from "@/lib/welcomePacket";
import { TaskSheet } from "@/app/components/TaskPageView";
import type { UiLang } from "@/app/ui/words";

const titleOf = (task: MyTodo, lang: UiLang) => (task.pages ? pageFor(task.pages, lang).title : lang === "en" ? task.task : task.translations[lang] || task.task);

function TaskRow({ task, lang }: { task: MyTodo; lang: UiLang }) {
  const words = MY_TODO_WORDS[lang];
  return (
    <li className="ui-stack" style={{ gap: 8 }}>
      <TaskSheet compact accountName={task.accountName} location={task.location} dueDate={task.dueDate} dueTime={task.dueTime} status={task.status} urgent={task.urgent} lang={lang} kind={task.kind} contact={task.contact} youGetPaid={task.youGetPaid} photosRequired={task.photosRequired}>
        {task.pages ? <h3 style={{ fontSize: 23, fontWeight: 900, margin: 0, color: WELCOME_COLORS.header }}>{pageFor(task.pages, lang).title}</h3> : <p style={{ margin: 0, fontSize: 18, fontWeight: 700, whiteSpace: "pre-wrap", display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{titleOf(task, lang)}</p>}
      </TaskSheet>
      <div className="ui-actions-row">
        <a className="ui-btn ui-btn-main" href={`${task.href}?lang=${lang}`}>{words.open}</a>
        <a className="ui-btn ui-btn-second" href={`/subcontractor-portal/my-todos/print?id=${task.id}&lang=${lang}`} target="_blank" rel="noopener">{words.print}</a>
      </div>
    </li>
  );
}

export default function MyTodos({ lang }: { lang: UiLang }) {
  const words = MY_TODO_WORDS[lang];
  const [tasks, setTasks] = useState<MyTodo[] | null>(null);
  const [on, setOn] = useState(false);
  const [failed, setFailed] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let alive = true;
    fetch("/api/subcontractor-portal/my-todos?full=1", { cache: "no-store" })
      .then(async (response) => {
        const body = (await response.json()) as { success?: boolean; on?: boolean; tasks?: MyTodo[] };
        if (!alive) return;
        if (!response.ok || body.success !== true) return setFailed(true);
        setOn(body.on === true);
        setTasks(body.tasks ?? []);
      })
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, []);

  if (!on && !failed) return null;
  if (failed) return null;

  const today = officeToday();
  const list = tasks ?? [];
  const openTasks = list.filter((task) => isOpenTask(task.status));
  const finished = list.filter((task) => task.status === "done").sort((a, b) => b.doneAt.localeCompare(a.doneAt));
  const late = openTasks.filter((task) => taskDueState(task.dueDate, task.status, today) === "overdue").length;
  const dueToday = openTasks.filter((task) => taskDueState(task.dueDate, task.status, today) === "today").length;

  return (
    <section className="ui-stack" data-my-todos>
      <button type="button" className="sub-row" onClick={() => setOpen((now) => !now)} aria-expanded={open} style={{ fontSize: 20, fontWeight: 800 }}>
        <span>✅ {words.title} ({openTasks.length})</span>
        {late > 0 ? <span className="ui-pill" style={{ background: DUE_STYLE.overdue.background, color: DUE_STYLE.overdue.color }}>{DUE_WORDS[lang].overdue}: {late}</span> : null}
        {dueToday > 0 ? <span className="ui-pill" style={{ background: DUE_STYLE.today.background, color: DUE_STYLE.today.color }}>{DUE_WORDS[lang].today}: {dueToday}</span> : null}
        <span aria-hidden="true">{open ? "⌄" : "›"}</span>
      </button>

      {open ? (
        <div className="ui-stack">
          {openTasks.length === 0 ? (
            <p className="ui-muted">{words.none}</p>
          ) : (
            <ul className="ui-list-plain ui-stack">
              {openTasks.map((task) => <TaskRow key={task.id} task={task} lang={lang} />)}
            </ul>
          )}
          {openTasks.length > 0 ? (
            <a className="ui-btn ui-btn-second" href={`/subcontractor-portal/my-todos/print?list=open&lang=${lang}`} target="_blank" rel="noopener">🖨 {words.printList}</a>
          ) : null}

          <details>
            <summary className="ui-link" style={{ fontSize: 18 }}>{words.finished} ({finished.length})</summary>
            <div className="ui-stack" style={{ marginTop: 10 }}>
              {finished.length === 0 ? (
                <p className="ui-muted">{words.noneFinished}</p>
              ) : (
                <>
                  <ul className="ui-list-plain ui-stack">
                    {finished.map((task) => <TaskRow key={task.id} task={task} lang={lang} />)}
                  </ul>
                  <a className="ui-btn ui-btn-second" href={`/subcontractor-portal/my-todos/print?list=done&lang=${lang}`} target="_blank" rel="noopener">🖨 {words.printFinished}</a>
                </>
              )}
            </div>
          </details>
        </div>
      ) : null}
    </section>
  );
}
