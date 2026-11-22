"use client";

// The Cleaning World printout of CW Now to-dos, for the Sub Portal and the
// office: one task per page (the same TaskSheet as the sub's link), or a list.
// It only ever shows what a crew may carry: account, address, the task, the due
// date, who to call. Never prices, pay or office notes, so give it nothing else.
//
// globals.css hides everything when printing and re-shows a page's own
// container: .task-print-view is this one.

import type { CSSProperties, ReactNode } from "react";
import { DUE_STYLE, DUE_WORDS, MY_TODO_WORDS, officeToday, taskDueState, taskDueText, type CwNowStatus, type TaskContact, type TaskLinkKind } from "@/lib/cwNowTasks";
import { WELCOME_COLORS as C, WELCOME_LOGO_URL } from "@/lib/welcomePacket";
import type { CrewLang } from "@/lib/crewLinkPeople";
import { PlainTask, TaskSheet } from "./TaskPageView";

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
  kind?: TaskLinkKind;
  contact?: TaskContact | null;
  photosRequired?: boolean;
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
    <header style={{ marginBottom: 16 }}>
      <div style={{ textAlign: "center", padding: "6px 0 12px" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={WELCOME_LOGO_URL} alt="Cleaning World Inc." style={{ width: 220, maxWidth: "70%", height: "auto" }} />
      </div>
      <div style={{ display: "flex", alignItems: "center", background: C.header, borderBottom: `4px solid ${C.accent}`, color: "#fff", padding: "10px 14px" }}>
        <span style={{ flex: 1, fontSize: 22, fontWeight: 800 }}>{title}</span>
        {right ? <span style={{ fontSize: 13, color: C.tagline }}>{right}</span> : null}
      </div>
    </header>
  );
}

/** One task on its own page, for the crew to carry. `children`: the AI task page, when it has one. */
export function PrintedTask({ task, lang, children }: { task: PrintTask; lang: CrewLang; children?: ReactNode }) {
  return (
    <div className="task-print-page">
      <TaskSheet accountName={task.accountName} location={task.location} dueDate={task.dueDate} dueTime={task.dueTime} status={task.status} urgent={task.urgent} lang={lang} kind={task.kind} contact={task.contact} photosRequired={task.photosRequired}>
        {children ?? <PlainTask text={task.task} lang={lang} />}
      </TaskSheet>
    </div>
  );
}

/** A list of tasks on one sheet: for a sub, or a review meeting with a sub. */
export function PrintedList({ title, subtitle, tasks, lang }: { title: string; subtitle?: string; tasks: PrintTask[]; lang: CrewLang }) {
  const words = MY_TODO_WORDS[lang];
  const today = officeToday();
  const cell: CSSProperties = { border: `1px solid ${C.border}`, padding: "7px 8px", textAlign: "left", verticalAlign: "top", fontSize: 13 };
  return (
    <article className="task-print-page">
      <Brand title={title} right={`${words.printedOn} ${taskDueText(today, "", lang)}`} />
      {subtitle ? <p style={{ fontSize: 16, fontWeight: 700, margin: "0 0 10px" }}>{subtitle}</p> : null}
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ background: "#e0f2fe", color: C.label }}>
            <th style={cell}>{words.due}</th>
            <th style={cell}>{words.account}</th>
            <th style={cell}>{words.task}</th>
            <th style={cell}>{words.status}</th>
          </tr>
        </thead>
        <tbody>
          {tasks.map((task) => {
            const state = taskDueState(task.dueDate, task.status, today);
            const word = DUE_WORDS[lang][state];
            return (
              <tr key={task.id} className="task-print-row">
                <td style={{ ...cell, fontWeight: 800, whiteSpace: "nowrap" }}>{taskDueText(task.dueDate, task.dueTime, lang)}</td>
                <td style={{ ...cell, fontWeight: 700 }}>{task.accountName}</td>
                <td style={{ ...cell, whiteSpace: "pre-wrap" }}>{task.urgent && task.status !== "done" ? `⚠ ${words.urgent}: ` : ""}{task.task}</td>
                <td style={{ ...cell, background: DUE_STYLE[state].background, fontWeight: 800, whiteSpace: "nowrap" }}>{state === "later" ? words.openStatus : word}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </article>
  );
}
