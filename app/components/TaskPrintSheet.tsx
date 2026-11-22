"use client";

// The Cleaning World printout of CW Now to-dos, for the Sub Portal and the
// office: one task per page, or a list. It only ever shows what the sub may
// see: account, address, the task, the due date. Never prices, sub pay or
// office notes, so give it nothing else.
//
// globals.css hides everything when printing and re-shows a page's own
// container: .task-print-view is this one.

import type { CSSProperties, ReactNode } from "react";
import { DUE_STYLE, DUE_WORDS, MY_TODO_WORDS, officeToday, taskDueState, taskDueText, type CwNowStatus } from "@/lib/cwNowTasks";
import type { CrewLang } from "@/lib/crewLinkPeople";

export type PrintTask = {
  id: number;
  accountName: string;
  location: string;
  /** The task in the reader's language. */
  task: string;
  dueDate: string;
  dueTime: string;
  urgent: boolean;
  status: CwNowStatus;
};

export function TaskPrintStyles() {
  return (
    <style>{`
      .task-print-view { max-width: 8in; margin: 0 auto; background: #fff; color: #0f172a; padding: 16px; }
      .task-print-page { padding-bottom: 24px; }
      @media print {
        @page { margin: 0.5in; }
        .task-print-view { position: absolute; left: 0; top: 0; width: 100%; max-width: none; padding: 0; }
        .task-print-view, .task-print-view * { visibility: visible; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        .task-print-page { break-after: page; }
        .task-print-page:last-child { break-after: auto; }
        .task-print-row { break-inside: avoid; }
      }
    `}</style>
  );
}

function Brand({ title, right }: { title: string; right?: ReactNode }) {
  return (
    <header style={{ display: "flex", alignItems: "center", gap: 14, borderBottom: "4px solid #005bbb", paddingBottom: 10, marginBottom: 16 }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/cw-logo.jpg" alt="Cleaning World" style={{ height: 52, width: "auto" }} />
      <span style={{ flex: 1, fontSize: 22, fontWeight: 900, color: "#003b7a" }}>{title}</span>
      {right ? <span style={{ fontSize: 13, color: "#475569" }}>{right}</span> : null}
    </header>
  );
}

function dueBox(task: PrintTask, lang: CrewLang, today: string): { style: CSSProperties; word: string; when: string } {
  const state = taskDueState(task.dueDate, task.status, today);
  return { style: { ...DUE_STYLE[state], borderWidth: 3, borderStyle: "solid", borderRadius: 12 }, word: DUE_WORDS[lang][state], when: taskDueText(task.dueDate, task.dueTime, lang) };
}

/** One task on its own page, for the crew to carry. `children`: what goes under the task (the AI task page). */
export function PrintedTask({ task, lang, children }: { task: PrintTask; lang: CrewLang; children?: ReactNode }) {
  const words = MY_TODO_WORDS[lang];
  const due = dueBox(task, lang, officeToday());
  return (
    <article className="task-print-page">
      <Brand title="CW Now" />
      <h1 style={{ fontSize: 28, fontWeight: 900, margin: 0 }}>{task.accountName}</h1>
      {task.location ? <p style={{ fontSize: 18, margin: "4px 0 0" }}>{task.location}</p> : null}
      {task.urgent && task.status !== "done" ? <p style={{ margin: "12px 0 0", fontSize: 20, fontWeight: 900, color: "#b91c1c" }}>⚠ {words.urgent}</p> : null}
      <div style={{ ...due.style, padding: "12px 16px", margin: "16px 0" }}>
        <div style={{ fontSize: 16, fontWeight: 800 }}>{due.word}</div>
        <div style={{ fontSize: 30, fontWeight: 900 }}>{due.when}</div>
      </div>
      {children ?? (
        <>
          <h2 style={{ fontSize: 16, color: "#475569", margin: "0 0 4px" }}>{words.task}</h2>
          <p style={{ fontSize: 22, fontWeight: 700, lineHeight: 1.35, whiteSpace: "pre-wrap", margin: 0 }}>{task.task}</p>
        </>
      )}
    </article>
  );
}

/** A list of tasks on one sheet: for a sub, or a review meeting with a sub. */
export function PrintedList({ title, subtitle, tasks, lang }: { title: string; subtitle?: string; tasks: PrintTask[]; lang: CrewLang }) {
  const words = MY_TODO_WORDS[lang];
  const today = officeToday();
  const cell: CSSProperties = { border: "1px solid #cbd5e1", padding: "7px 8px", textAlign: "left", verticalAlign: "top", fontSize: 13 };
  return (
    <article className="task-print-page">
      <Brand title={title} right={`${words.printedOn} ${taskDueText(today, "", lang)}`} />
      {subtitle ? <p style={{ fontSize: 16, fontWeight: 700, margin: "0 0 10px" }}>{subtitle}</p> : null}
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ background: "#e0f2fe" }}>
            <th style={cell}>{words.due}</th>
            <th style={cell}>{words.account}</th>
            <th style={cell}>{words.task}</th>
            <th style={cell}>{words.status}</th>
          </tr>
        </thead>
        <tbody>
          {tasks.map((task) => {
            const due = dueBox(task, lang, today);
            return (
              <tr key={task.id} className="task-print-row">
                <td style={{ ...cell, fontWeight: 800, whiteSpace: "nowrap" }}>{due.when}</td>
                <td style={{ ...cell, fontWeight: 700 }}>{task.accountName}</td>
                <td style={{ ...cell, whiteSpace: "pre-wrap" }}>{task.urgent && task.status !== "done" ? `⚠ ${words.urgent}: ` : ""}{task.task}</td>
                <td style={{ ...cell, background: DUE_STYLE[taskDueState(task.dueDate, task.status, today)].background, fontWeight: 800, whiteSpace: "nowrap" }}>
                  {task.status === "done" || due.word !== DUE_WORDS[lang].later ? due.word : words.openStatus}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </article>
  );
}
