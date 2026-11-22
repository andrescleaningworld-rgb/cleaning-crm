"use client";

// The office checks and edits the AI task page before anything goes out, and
// sees it the way the sub will. Steps and items are one per line.

import { useState } from "react";
import { BigButton, Field, TextAreaField } from "@/app/ui";
import TaskPageView from "@/app/components/TaskPageView";
import { TASK_PAGE_MAX_BRING, TASK_PAGE_MAX_STEPS, officeOnlyLine, type TaskPage } from "@/lib/taskPage";

const toLines = (text: string, max: number) => text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).slice(0, max);

export default function TaskPageEditor({ page, onChange, onRemove }: { page: TaskPage; onChange: (page: TaskPage) => void; onRemove: () => void }) {
  const [editing, setEditing] = useState(false);
  const [stepsText, setStepsText] = useState(page.steps.join("\n"));
  const [bringText, setBringText] = useState(page.bring.join("\n"));
  const set = (patch: Partial<TaskPage>) => onChange({ ...page, ...patch });
  const bad = officeOnlyLine(page);

  return (
    <div className="ui-stack" style={{ border: "2px solid #005bbb", borderRadius: 14, padding: 12 }}>
      <p className="ui-strong" style={{ margin: 0 }}>Preview. Nothing goes out until you press Save and send.</p>
      {editing ? (
        <>
          <Field label="Title" maxLength={160} value={page.title} onChange={(event) => set({ title: event.target.value })} />
          <TextAreaField label="Steps (one per line)" rows={6} value={stepsText} onChange={(event) => { setStepsText(event.target.value); set({ steps: toLines(event.target.value, TASK_PAGE_MAX_STEPS) }); }} />
          <Field label="When (optional)" maxLength={160} value={page.when} onChange={(event) => set({ when: event.target.value })} />
          <TextAreaField label="Bring or use (one per line)" rows={3} value={bringText} onChange={(event) => { setBringText(event.target.value); set({ bring: toLines(event.target.value, TASK_PAGE_MAX_BRING) }); }} />
          <Field label="Photo before (optional)" maxLength={160} value={page.photosBefore} onChange={(event) => set({ photosBefore: event.target.value })} />
          <Field label="Photo after (optional)" maxLength={160} value={page.photosAfter} onChange={(event) => set({ photosAfter: event.target.value })} />
          <Field label="Who to call (optional)" maxLength={160} value={page.call} onChange={(event) => set({ call: event.target.value })} />
        </>
      ) : (
        <TaskPageView page={page} lang="en" />
      )}
      {bad ? <p className="ui-field-error" role="alert">Take this off, the sub would see it: “{bad}”</p> : null}
      <div className="ui-actions-row">
        <BigButton kind="second" onClick={() => setEditing((now) => !now)}>{editing ? "See preview" : "Edit"}</BigButton>
        <BigButton kind="quiet" onClick={onRemove}>Remove page</BigButton>
      </div>
    </div>
  );
}
