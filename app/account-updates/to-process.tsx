"use client";

// Account Updates -> "To process": the office's list of updates that still
// have to be entered (billing, schedule, files). Oldest first, red after the
// number of days set in Settings -> Team. One big green "Mark processed"
// button with an optional note; it stamps who and when, and the manager who
// wrote the update sees "Processed ✓ by ...".

import { useEffect, useMemo, useState } from "react";
import { BigButton, Counts, EmptyState, Sheet, TextAreaField, Tips } from "@/app/ui";
import { isLate, sortForWork, stepOf, type HandoffItem } from "@/lib/handoffs";
import { HandoffCard, advanceWithUndo, postHandoff, shortDay, type HandoffsState } from "../components/handoffs";

/** The handoff of one update on the list: by its id, or (an update saved while Apps Script was not answering with an id) by account and note. */
export function handoffForUpdate(items: HandoffItem[], update: { id: string; accountName: string; notes: string }): HandoffItem | null {
  const updates = items.filter((item) => item.kind === "update");
  return (
    updates.find((item) => item.itemId === update.id) ??
    updates.find((item) => item.itemId.startsWith("u-") && item.accountName === update.accountName && (item.data.notes ?? "") === update.notes) ??
    null
  );
}

/** "Processed ✓ by Maria, Tue, Oct 8" */
export function processedLine(item: HandoffItem): string {
  return `Processed ✓${item.lastBy ? ` by ${item.lastBy}` : ""}${item.lastAt ? `, ${shortDay(item.lastAt)}` : ""}${item.lastNote ? ` — ${item.lastNote}` : ""}`;
}

export default function ToProcess({ handoffs, focusId }: { handoffs: HandoffsState; focusId: string }) {
  // Hidden at once when "Mark processed" is tapped; shown again on Undo.
  const [leaving, setLeaving] = useState<Set<string>>(new Set());
  const [target, setTarget] = useState<HandoffItem | null>(null);
  const [note, setNote] = useState("");
  const [onlyLate, setOnlyLate] = useState(false);
  // An extra job from a sub moves in place (Received -> Approved -> Done): itemId -> the step it is moving to.
  const [moving, setMoving] = useState<Record<string, string>>({});

  function advanceExtra(item: HandoffItem) {
    const { next } = stepOf(item, handoffs.settings);
    if (!next) return;
    const setMove = (step: string | null) =>
      setMoving((current) => {
        const copy = { ...current };
        if (step) copy[item.itemId] = step;
        else delete copy[item.itemId];
        return copy;
      });
    advanceWithUndo({
      item,
      toStep: next.key,
      settings: handoffs.settings,
      onOptimistic: () => setMove(next.key),
      onUndo: () => setMove(null),
      run: async () => {
        await postHandoff({ action: "advance", kind: "extra", itemId: item.itemId, toStep: next.key });
        await handoffs.reload();
        setMove(null);
      },
    });
  }

  const waiting = useMemo(
    () => sortForWork(handoffs.items.filter((item) => (item.kind === "update" || item.kind === "extra") && !item.doneAt && !leaving.has(item.itemId)).map((item) => (moving[item.itemId] ? { ...item, step: moving[item.itemId] } : item)), handoffs.settings),
    [handoffs.items, handoffs.settings, leaving, moving]
  );
  const late = waiting.filter((item) => isLate(item, handoffs.settings));
  const shown = onlyLate ? late : waiting;

  // Arriving from My work: bring that update into view.
  useEffect(() => {
    if (!focusId || handoffs.state !== "ready") return;
    document.getElementById(`to-process-${focusId}`)?.scrollIntoView({ block: "center" });
  }, [focusId, handoffs.state]);

  if (handoffs.state !== "ready") return null;

  function markProcessed() {
    const item = target;
    if (!item) return;
    const withNote = note.trim();
    setTarget(null);
    setNote("");
    const setGone = (gone: boolean) =>
      setLeaving((current) => {
        const next = new Set(current);
        if (gone) next.add(item.itemId);
        else next.delete(item.itemId);
        return next;
      });
    advanceWithUndo({
      item,
      toStep: "processed",
      settings: handoffs.settings,
      onOptimistic: () => setGone(true),
      onUndo: () => setGone(false),
      run: async () => {
        await postHandoff({ action: "advance", kind: "update", itemId: item.itemId, toStep: "processed", note: withNote });
        await handoffs.reload();
        setGone(false);
      },
    });
  }

  return (
    <section className="ui-screen-body" aria-label="Updates to process">
      <Tips
        id="updates-to-process"
        steps={[
          { target: '[data-tip="process-counts"]', text: "When a manager adds an update, it lands here for the Office to enter." },
          { target: '[data-tip="process-list"]', text: "Oldest first. Red means it has waited too long. Tap Mark processed when it is entered." },
          { target: ".ui-actionbar .ui-btn-main", text: "Managers: tap Add update. You will see \"Processed ✓\" on it when the Office is done." },
        ]}
      />
      <Counts
        data-tip="process-counts"
        items={[
          { label: "To process", value: waiting.length, tone: "info", pressed: !onlyLate, onClick: () => setOnlyLate(false) },
          { label: "Late", value: late.length, tone: late.length > 0 ? "bad" : "good", pressed: onlyLate, onClick: () => setOnlyLate((value) => !value) },
        ]}
      />

      <div data-tip="process-list">
        {shown.length === 0 ? (
          <EmptyState title={onlyLate ? "Nothing is late ✓" : "Nothing to process ✓"} text={onlyLate ? "Tap To process to see everything waiting." : "New updates from the managers show up here. Tap Add update to make one."} />
        ) : (
          <ul className="ui-acct-list">
            {shown.map((item) => (
              <li key={item.itemId} id={`to-process-${item.itemId}`}>
                <HandoffCard
                  item={item}
                  settings={handoffs.settings}
                  detail={[item.data.updateType, item.data.notes].filter(Boolean).join(": ") + (item.createdBy ? ` (from ${item.createdBy})` : "")}
                >
                  {item.kind === "extra" ? (
                    <BigButton disabled={Boolean(moving[item.itemId]) || !stepOf(item, handoffs.settings).step?.button} onClick={() => advanceExtra(item)}>
                      {stepOf(item, handoffs.settings).step?.button || "Done"}
                    </BigButton>
                  ) : (
                    <BigButton
                      onClick={() => {
                        setNote("");
                        setTarget(item);
                      }}
                    >
                      Mark processed
                    </BigButton>
                  )}
                  {item.data.photoUrl ? (
                    <a className="ui-btn ui-btn-second" href={item.data.photoUrl} target="_blank" rel="noopener noreferrer">
                      Photo
                    </a>
                  ) : null}
                </HandoffCard>
              </li>
            ))}
          </ul>
        )}
      </div>

      <Sheet
        open={target !== null}
        title="Mark processed"
        text={target ? `${target.title}. ${[target.data.updateType, target.data.notes].filter(Boolean).join(": ")}` : undefined}
        onClose={() => setTarget(null)}
        actions={<BigButton onClick={markProcessed}>Mark processed</BigButton>}
      >
        <TextAreaField label="Note for the manager" optional rows={3} placeholder="Billing changed starting November 1." value={note} onChange={(event) => setNote(event.target.value)} />
      </Sheet>
    </section>
  );
}
