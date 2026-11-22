"use client";

// "My to-dos" on the sub's simple home (FEATURE_MY_TODOS): one big button with
// how many are open, then the list. The due date is big and colored: today
// yellow, late red, done green. Tap a task to open its private page. Shows
// nothing at all while the switch is off.

import { useEffect, useState } from "react";
import { DUE_STYLE, DUE_WORDS, MY_TODO_WORDS, TASK_LINK_LABEL, isOpenTask, officeToday, taskDueState, taskDueText, type MyTodo } from "@/lib/cwNowTasks";
import { pageFor } from "@/lib/taskPage";
import type { UiLang } from "@/app/ui/words";

const titleOf = (task: MyTodo, lang: UiLang) => (task.pages ? pageFor(task.pages, lang).title : lang === "en" ? task.task : task.translations[lang] || task.task);

function TaskRow({ task, lang, today }: { task: MyTodo; lang: UiLang; today: string }) {
  const words = MY_TODO_WORDS[lang];
  const state = taskDueState(task.dueDate, task.status, today);
  const look = DUE_STYLE[state];
  return (
    <li className="ui-stack" style={{ border: `3px solid ${look.borderColor}`, borderRadius: 16, padding: 12, background: "#fff", gap: 8 }} data-due-state={state}>
      <div style={{ background: look.background, color: look.color, borderRadius: 10, padding: "8px 12px" }}>
        <div style={{ fontSize: 15, fontWeight: 800 }}>{DUE_WORDS[lang][state]}</div>
        <div style={{ fontSize: 24, fontWeight: 900, lineHeight: 1.15 }}>{taskDueText(task.dueDate, task.dueTime, lang)}</div>
      </div>
      <p className="ui-strong" style={{ margin: 0, fontSize: 19 }}>{task.accountName}</p>
      {task.kind ? <p style={{ margin: 0, color: "#003b7a", fontWeight: 900 }}>{TASK_LINK_LABEL[lang][task.kind]}</p> : null}
      {task.urgent && isOpenTask(task.status) ? <p style={{ margin: 0, color: "#b91c1c", fontWeight: 900 }}>⚠ {words.urgent}</p> : null}
      <p style={{ margin: 0, fontSize: 17, whiteSpace: "pre-wrap", display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{titleOf(task, lang)}</p>
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
    fetch("/api/subcontractor-portal/my-todos", { cache: "no-store" })
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
              {openTasks.map((task) => <TaskRow key={task.id} task={task} lang={lang} today={today} />)}
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
                    {finished.map((task) => <TaskRow key={task.id} task={task} lang={lang} today={today} />)}
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
