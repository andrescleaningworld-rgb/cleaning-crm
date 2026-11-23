"use client";

// The check before a CW Now to-do goes out: the AI task page, shown in the
// same phone view the sub gets. Nothing is sent until "Send to team".
// The same task words reuse the page already made. If the AI fails or takes
// too long, the plain task is shown and can still be sent.

import { useRef, useState } from "react";
import { BigButton, Sheet } from "@/app/ui";
import TaskPageView, { PlainTask, TaskSheet } from "@/app/components/TaskPageView";
import type { TaskContact, TaskLinkKind } from "@/lib/cwNowTasks";
import { officeOnlyLine, type TaskPage } from "@/lib/taskPage";

/** A little under the time the server allows the AI. */
const AI_WAIT_MS = 45_000;

/** `made` changes only when a new page is made, so the form's editor keeps its place while someone types. */
type Draft = { words: string; page: TaskPage | null; failed: boolean; removed: boolean; made: number };
type Facts = { location: string; contact: TaskContact | null; youGetPaid: number | null };
export type PreviewAsk = { words: string; accountId: string; accountName: string; dueDate: string; dueTime: string; jobId?: string };

const NO_FACTS: Facts = { location: "", contact: null, youGetPaid: null };

export function useTaskPreview() {
  const [open, setOpen] = useState(false);
  const [making, setMaking] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [facts, setFacts] = useState<Facts>(NO_FACTS);
  const [ask, setAsk] = useState<PreviewAsk | null>(null);
  const running = useRef<AbortController | null>(null);

  async function make(next: PreviewAsk, again = false) {
    const words = next.words.trim();
    setAsk(next);
    setOpen(true);
    const query = new URLSearchParams({ view: "preview", accountId: next.accountId, ...(next.jobId ? { jobId: next.jobId } : {}) });
    fetch(`/api/cw-now-tasks?${query.toString()}`, { cache: "no-store" })
      .then((response) => response.json())
      .then((data: Partial<Facts> & { success?: boolean }) => {
        if (data.success) setFacts({ location: data.location ?? "", contact: data.contact ?? null, youGetPaid: data.youGetPaid ?? null });
      })
      .catch(() => setFacts(NO_FACTS));
    if (!again && draft?.words === words && (draft.page || draft.removed)) return;

    running.current?.abort();
    const controller = new AbortController();
    running.current = controller;
    const timer = window.setTimeout(() => controller.abort(), AI_WAIT_MS);
    setMaking(true);
    try {
      const response = await fetch("/api/cw-now-tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({ action: "aiPage", words, accountName: next.accountName, dueDate: next.dueDate, dueTime: next.dueTime }),
      });
      const data = (await response.json().catch(() => ({}))) as { success?: boolean; page?: TaskPage };
      if (running.current !== controller) return;
      setDraft({ words, page: response.ok && data.success && data.page ? data.page : null, failed: !(response.ok && data.success && data.page), removed: false, made: Date.now() });
    } catch {
      // "Back to edit" clears `running`; a timeout leaves it, and shows the plain task.
      if (running.current === controller) setDraft({ words, page: null, failed: true, removed: false, made: Date.now() });
    } finally {
      window.clearTimeout(timer);
      if (running.current === controller) {
        running.current = null;
        setMaking(false);
      }
    }
  }

  function close() {
    const going = running.current;
    running.current = null;
    going?.abort();
    setMaking(false);
    setOpen(false);
  }

  return {
    open,
    making,
    ask,
    facts,
    draft,
    pageKey: draft?.made ?? 0,
    make,
    close,
    reset: () => {
      close();
      setDraft(null);
      setAsk(null);
    },
    /** The page for these words, or null (send the plain task). */
    pageFor: (words: string) => (draft?.words === words.trim() ? draft.page : null),
    /** The office edited the page on the form. */
    setPage: (page: TaskPage) => setDraft((now) => (now ? { ...now, page, failed: false, removed: false } : now)),
    /** "Remove page": this text goes plain until it changes or Remake is used. */
    removePage: () => setDraft((now) => (now ? { ...now, page: null, failed: false, removed: true } : now)),
  };
}

export default function TaskSendPreview({
  preview,
  urgent,
  kind,
  photosRequired,
  fileNames = [],
  onSend,
}: {
  preview: ReturnType<typeof useTaskPreview>;
  urgent: boolean;
  kind?: TaskLinkKind;
  photosRequired?: boolean;
  fileNames?: string[];
  onSend: (page: TaskPage | null) => void;
}) {
  const ask = preview.ask;
  const words = ask?.words.trim() ?? "";
  const page = preview.pageFor(words);
  const failed = preview.draft?.words === words && preview.draft.failed;
  const bad = page ? officeOnlyLine(page) : "";

  return (
    <Sheet
      open={preview.open}
      title="What the team will see"
      text="Nothing is sent until you tap Send to team."
      onClose={preview.close}
      actions={
        <div className="ui-stack" style={{ width: "100%" }}>
          <BigButton disabled={preview.making || Boolean(bad)} onClick={() => { preview.close(); onSend(page); }} data-send-to-team>
            Send to team
          </BigButton>
          <BigButton kind="second" busy={preview.making} busyLabel="Making the page…" onClick={() => ask && void preview.make(ask, true)} data-remake>
            Remake
          </BigButton>
          <BigButton kind="quiet" onClick={preview.close} data-back-to-edit>
            Back to edit
          </BigButton>
        </div>
      }
    >
      {!ask ? null : preview.making ? (
        <p className="ui-strong" role="status">Making the task page…</p>
      ) : (
        <div className="ui-stack">
          {failed ? <p className="ui-field-error" role="status">AI page couldn&apos;t be made — sending plain task</p> : null}
          {bad ? <p className="ui-field-error" role="alert">Take this off, the sub would see it: “{bad}”. Use Back to edit.</p> : null}
          <TaskSheet
            compact
            accountName={ask.accountName}
            location={preview.facts.location}
            dueDate={ask.dueDate}
            dueTime={ask.dueTime}
            status="sent"
            urgent={urgent}
            lang="en"
            kind={kind}
            contact={preview.facts.contact}
            youGetPaid={preview.facts.youGetPaid}
            photosRequired={photosRequired}
          >
            {page ? <TaskPageView page={page} lang="en" /> : <PlainTask text={words} lang="en" />}
          </TaskSheet>
          {fileNames.length > 0 ? <p className="ui-muted">📎 {fileNames.join(", ")}</p> : null}
        </div>
      )}
    </Sheet>
  );
}
