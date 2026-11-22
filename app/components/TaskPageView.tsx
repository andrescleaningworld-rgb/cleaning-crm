"use client";

// The AI task page on the sub's phone and on paper: big text, very few words.
// Blank parts do not show.

import { TASK_PAGE_WORDS, type TaskPage } from "@/lib/taskPage";
import type { CrewLang } from "@/lib/crewLinkPeople";

const heading = { fontSize: 17, fontWeight: 800, color: "#475569", margin: "16px 0 4px" } as const;
const body = { fontSize: 21, fontWeight: 700, lineHeight: 1.35, margin: 0 } as const;

export default function TaskPageView({ page, lang }: { page: TaskPage; lang: CrewLang }) {
  const words = TASK_PAGE_WORDS[lang];
  return (
    <div data-task-page>
      <h2 style={{ fontSize: 28, fontWeight: 900, lineHeight: 1.15, margin: 0, color: "#003b7a" }}>{page.title}</h2>
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
            <span style={{ flex: "0 0 38px", height: 38, borderRadius: 19, background: "#005bbb", color: "#fff", fontSize: 21, fontWeight: 900, display: "flex", alignItems: "center", justifyContent: "center" }}>{index + 1}</span>
            <span style={{ ...body, paddingTop: 3 }}>{step}</span>
          </li>
        ))}
      </ol>
      {page.bring.length > 0 ? (
        <>
          <p style={heading}>{words.bring}</p>
          <ul style={{ margin: 0, paddingLeft: 24 }}>
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
      {page.call ? (
        <>
          <p style={heading}>📞 {words.call}</p>
          <p style={body}>{page.call}</p>
        </>
      ) : null}
    </div>
  );
}
