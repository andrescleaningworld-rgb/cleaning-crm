"use client";

// The CW Now task page, in the Welcome Packet's look (lib/welcomePacket.ts: its
// logo and title bar, its colors and its white footer). One design for the
// sub's private link, My to-dos and the printout.
//
//   TaskSheet      the page around a task: account, address, big due date, who to call
//   TaskPageView   the AI page's steps inside it (blank parts do not show)
//
// Only give it what the sub may see: never a customer price, margin or office note.

import type { ReactNode } from "react";
import { DUE_STYLE, DUE_WORDS, TASK_LINK_LABEL, TASK_SHEET_WORDS, taskDueState, taskDueText, type CwNowStatus, type TaskContact, type TaskLinkKind } from "@/lib/cwNowTasks";
import { TASK_PAGE_WORDS, type TaskPage } from "@/lib/taskPage";
import { WELCOME_COLORS as C, welcomeFooterHtml, welcomeTopHtml } from "@/lib/welcomePacket";
import type { CrewLang } from "@/lib/crewLinkPeople";

const heading = { fontSize: 16, fontWeight: 800, color: C.label, margin: "18px 0 6px", borderBottom: `2px solid ${C.border}`, paddingBottom: 4 } as const;
const body = { fontSize: 21, fontWeight: 700, lineHeight: 1.35, margin: 0, color: C.text } as const;
const dollars = (value: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);
const dial = (phone: string) => phone.replace(/[^\d+]/g, "");
/** "2017445906" as "201-744-5906". Anything that is not a plain US number stays as typed. */
const phoneText = (phone: string) => {
  const digits = phone.replace(/\D/g, "").replace(/^1(?=\d{10}$)/, "");
  return digits.length === 10 ? `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}` : phone;
};

export type TaskSheetProps = {
  accountName: string;
  location: string;
  dueDate: string;
  dueTime: string;
  status: CwNowStatus;
  urgent: boolean;
  lang: CrewLang;
  kind?: TaskLinkKind;
  contact?: TaskContact | null;
  /** An extra job: what THIS sub is paid. Left out on printouts. */
  youGetPaid?: number | null;
  photosRequired?: boolean;
  /** My to-dos: one card in a list, without the logo and the footer. */
  compact?: boolean;
  /** Under the title bar, before the due date: the language switch. */
  top?: ReactNode;
  children: ReactNode;
};

export function TaskSheet({ accountName, location, dueDate, dueTime, status, urgent, lang, kind, contact, youGetPaid, photosRequired, compact = false, top, children }: TaskSheetProps) {
  const words = TASK_SHEET_WORDS[lang];
  const state = taskDueState(dueDate, status);
  return (
    <article style={{ background: "#ffffff", color: C.text, border: compact ? `2px solid ${C.border}` : undefined, borderRadius: compact ? 12 : undefined, overflow: "hidden" }} data-task-sheet data-due-state={state}>
      {compact ? (
        <div style={{ background: C.header, borderBottom: `4px solid ${C.accent}`, padding: "10px 14px", color: "#ffffff", fontSize: 20, fontWeight: 800 }}>{accountName}</div>
      ) : (
        // The Welcome Packet's own logo and title bar. welcomeTopHtml escapes the name.
        <div className="[&_img]:mx-auto" dangerouslySetInnerHTML={{ __html: welcomeTopHtml(accountName) }} />
      )}
      <div style={{ padding: compact ? 12 : "14px 16px" }}>
        {top}
        {location ? <p style={{ fontSize: 18, fontWeight: 600, color: C.muted, margin: "0 0 10px" }}>📍 {location}</p> : null}
        {kind ? <p style={{ display: "inline-block", background: "#e0f2fe", color: C.label, fontSize: 17, fontWeight: 800, borderRadius: 8, padding: "4px 12px", margin: "0 0 10px" }}>{TASK_LINK_LABEL[lang][kind]}</p> : null}
        {urgent && status !== "done" ? <p style={{ background: "#fee2e2", color: "#991b1b", border: "2px solid #dc2626", borderRadius: 10, textAlign: "center", fontSize: 21, fontWeight: 900, padding: "6px 10px", margin: "0 0 10px" }}>⚠ {words.urgent}</p> : null}
        <div style={{ ...DUE_STYLE[state], borderWidth: 3, borderStyle: "solid", borderRadius: 12, padding: "10px 14px", marginBottom: 14 }}>
          <div style={{ fontSize: 16, fontWeight: 800 }}>{DUE_WORDS[lang][state]}</div>
          <div style={{ fontSize: compact ? 26 : 32, fontWeight: 900, lineHeight: 1.1 }}>{taskDueText(dueDate, dueTime, lang)}</div>
        </div>
        {children}
        {typeof youGetPaid === "number" ? (
          <p style={{ background: "#dcfce7", color: "#14532d", border: "2px solid #16a34a", borderRadius: 10, fontSize: 22, fontWeight: 900, padding: "8px 12px", margin: "16px 0 0" }} data-you-get-paid>
            {words.youGetPaid}: {dollars(youGetPaid)}
          </p>
        ) : null}
        {photosRequired ? <p style={{ ...body, fontSize: 18, margin: "14px 0 0" }}>📷 {words.photosRequired}</p> : null}
        {contact ? (
          <p style={{ fontSize: 19, fontWeight: 800, margin: "16px 0 0", color: C.label }} data-task-contact>
            📞 {TASK_PAGE_WORDS[lang].call} {contact.name}: <a href={`tel:${dial(contact.phone)}`} style={{ color: C.bar, textDecoration: "underline" }}>{phoneText(contact.phone)}</a>
          </p>
        ) : null}
      </div>
      {compact ? null : <div dangerouslySetInnerHTML={{ __html: welcomeFooterHtml() }} />}
    </article>
  );
}

/** A task with no AI page: its words. */
export function PlainTask({ text, lang }: { text: string; lang: CrewLang }) {
  return (
    <>
      <p style={{ ...heading, marginTop: 0 }}>{TASK_SHEET_WORDS[lang].task}</p>
      <p style={{ ...body, whiteSpace: "pre-wrap" }}>{text}</p>
    </>
  );
}

export default function TaskPageView({ page, lang }: { page: TaskPage; lang: CrewLang }) {
  const words = TASK_PAGE_WORDS[lang];
  return (
    <div data-task-page>
      <h2 style={{ fontSize: 27, fontWeight: 900, lineHeight: 1.15, margin: 0, color: C.header }}>{page.title}</h2>
      {page.when ? (
        <>
          <p style={heading}>{words.when}</p>
          <p style={body}>{page.when}</p>
        </>
      ) : null}
      <p style={heading}>{words.steps}</p>
      <ol style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gap: 10 }}>
        {page.steps.map((step, index) => (
          <li key={index} style={{ display: "flex", gap: 12, alignItems: "flex-start", breakInside: "avoid" }}>
            <span style={{ flex: "0 0 38px", height: 38, borderRadius: 19, background: C.bar, color: "#fff", fontSize: 21, fontWeight: 900, display: "flex", alignItems: "center", justifyContent: "center" }}>{index + 1}</span>
            <span style={{ ...body, paddingTop: 3 }}>{step}</span>
          </li>
        ))}
      </ol>
      {page.bring.length > 0 ? (
        <>
          <p style={heading}>{words.bring}</p>
          <ul style={{ margin: 0, paddingLeft: 24, listStyle: "disc" }}>
            {page.bring.map((item, index) => <li key={index} style={{ fontSize: 20, fontWeight: 700 }}>{item}</li>)}
          </ul>
        </>
      ) : null}
      {page.photosBefore ? (
        <>
          <p style={heading}>📷 {words.before}</p>
          <p style={body}>{page.photosBefore}</p>
        </>
      ) : null}
      {page.photosAfter ? (
        <>
          <p style={heading}>📷 {words.after}</p>
          <p style={body}>{page.photosAfter}</p>
        </>
      ) : null}
    </div>
  );
}
