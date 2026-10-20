"use client";

// The New Account flow on the account page, right under the blue banner: the
// pizza tracker and ONE big green button for the step it is on now. Only an
// account made with "New Accepted Account" has a flow; for every other
// account this shows nothing. Rules: lib/accountFlow.ts. Server:
// app/api/account-flow.
//
//   1 Send welcome packet        opens the existing Welcome Packet sheet
//   2 Choose subcontractor       the suggested subs (distance + room), then "Send to <sub>"
//   3 Sub confirms               waits for the sub's Yes / No in their portal
//   4 Contact customer           Done
//   5 Site survey + onboarding   opens the Onboarding Checklist; done when it is
//   6 Crew walkthrough           Done
//   7 Confirm start date         saves the account's Start Date
//   8 Follow up                  a note, then Done: the account is live

import { useCallback, useEffect, useState } from "react";
import { BigButton, Card, ErrorBox, Field, SelectField, Sheet, TextAreaField, friendlyDate, showToast } from "@/app/ui";
import PizzaTracker from "./pizza-tracker";
import PlusMinus from "./plus-minus";
import SubSuggestions, { suggestionDays } from "./sub-suggestions";
import { FLOW_STEPS, type FlowDetail, type FlowEvent } from "@/lib/accountFlow";
import { DEFAULT_START_TIME, formatClock, parseClock, START_TIME_MAX, START_TIME_MIN, START_TIME_STEP, toClock } from "@/lib/schedule-time";
import { DEFAULT_MINUTES_ON_SITE, formatMinutes, MAX_MINUTES_ON_SITE, MIN_MINUTES_ON_SITE, MINUTES_ON_SITE_STEP } from "@/lib/time-on-site";

/** "Mon, Wed, Fri at 7:00 pm, about 1h 30m" — the offer as the sub reads it. */
export function offerWhen(offer: { days: string; start: string; minutes: number | null }): string {
  const start = parseClock(offer.start);
  return [offer.days, start !== null ? `at ${formatClock(start)}` : "", offer.minutes ? `about ${formatMinutes(offer.minutes)}` : ""].filter(Boolean).join(" ");
}

async function postFlow(body: Record<string, unknown>): Promise<{ success?: boolean; error?: string; subName?: string }> {
  const response = await fetch("/api/account-flow", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = (await response.json().catch(() => ({}))) as { success?: boolean; error?: string; subName?: string };
  if (!response.ok || !data.success) throw new Error(data.error || "That did not save. Try again.");
  return data;
}

const EVENT_WORDS: Record<FlowEvent["action"], string> = {
  start: "Account made",
  done: "Done",
  offer: "Offer sent to",
  yes: "Said yes",
  no: "Said no",
  back: "Offer taken back",
  note: "Note",
};

export default function AccountFlowPanel({
  accountId,
  refreshKey = 0,
  onSendPacket,
  onOpenChecklist,
}: {
  accountId: string;
  /** Goes up after the Welcome Packet or the checklist changed, so the flow reads again. */
  refreshKey?: number;
  onSendPacket: () => void;
  onOpenChecklist: () => void;
}) {
  const [flow, setFlow] = useState<FlowDetail | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [picking, setPicking] = useState(false);
  const [startDate, setStartDate] = useState("");
  const [followNote, setFollowNote] = useState("");

  const load = useCallback(async () => {
    if (!accountId) return;
    try {
      const response = await fetch(`/api/account-flow?accountId=${encodeURIComponent(accountId)}`, { cache: "no-store" });
      const data = (await response.json().catch(() => ({}))) as { success?: boolean; flow?: FlowDetail | null };
      if (data.success) {
        setFlow(data.flow ?? null);
        if (data.flow?.startDate && /^\d{4}-\d{2}-\d{2}$/.test(data.flow.startDate)) setStartDate((current) => current || data.flow!.startDate);
      }
    } finally {
      setLoaded(true);
    }
  }, [accountId]);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  async function act(body: Record<string, unknown>, done: string) {
    setBusy(true);
    setError("");
    try {
      await postFlow({ accountId, ...body });
      showToast(done);
      await load();
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "That did not save. Try again.");
      await load();
      return false;
    } finally {
      setBusy(false);
    }
  }

  // Every account that is not a new one from the form: nothing here.
  if (!loaded || !flow) return null;
  const view = flow.view;

  return (
    <div className="account-detail-print-hide" style={{ marginTop: 16 }}>
      <Card title="New account setup">
        <div className="ui-stack">
          <PizzaTracker view={view} />
          {view.red ? <p className="ui-field-error">No progress for 2 work days. Add a note below if it is stuck.</p> : null}
          {error ? <ErrorBox title="Not saved" text={error} /> : null}

          {view.step === "packet" ? (
            <BigButton disabled={busy} onClick={onSendPacket}>
              Send welcome packet
            </BigButton>
          ) : null}

          {view.step === "sub" ? (
            <BigButton disabled={busy} onClick={() => setPicking(true)}>
              Choose subcontractor
            </BigButton>
          ) : null}

          {view.step === "subOk" && flow.offer ? (
            <>
              <p className="ui-card-text">
                Waiting for <strong>{flow.offer.subName}</strong> to tap Yes in their portal. {offerWhen(flow.offer)}.
              </p>
              <BigButton kind="quiet" busy={busy} busyLabel="Taking it back…" onClick={() => void act({ action: "takeBack" }, "Offer taken back. Pick another sub.")}>
                Pick a different sub
              </BigButton>
            </>
          ) : null}

          {view.step === "call" ? (
            <>
              <p className="ui-card-text">Call the customer and book the site survey.</p>
              <BigButton busy={busy} busyLabel="Saving…" onClick={() => void act({ action: "done", step: "call" }, "Customer called ✓")}>
                Done: customer called
              </BigButton>
            </>
          ) : null}

          {view.step === "survey" ? (
            <>
              <p className="ui-card-text">Do the site survey and fill in the Onboarding Checklist. This step is done when the checklist is.</p>
              <BigButton disabled={busy} onClick={onOpenChecklist}>
                Open onboarding checklist
              </BigButton>
            </>
          ) : null}

          {view.step === "walkthrough" ? (
            <>
              <p className="ui-card-text">Walk the crew through the account.</p>
              <BigButton busy={busy} busyLabel="Saving…" onClick={() => void act({ action: "done", step: "walkthrough" }, "Walkthrough done ✓")}>
                Done: walkthrough
              </BigButton>
            </>
          ) : null}

          {view.step === "startDate" ? (
            <>
              <Field label="Start date" type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} disabled={busy} />
              <BigButton busy={busy} busyLabel="Saving…" disabled={!startDate} onClick={() => void act({ action: "startDate", startDate }, "Start date saved ✓")}>
                Save start date
              </BigButton>
            </>
          ) : null}

          {view.step === "followUp" ? (
            <>
              <p className="ui-card-text">
                Call the customer after the first cleaning{view.dueDate ? ` (due ${friendlyDate(view.dueDate)})` : ""}. How did it go?
              </p>
              <TextAreaField label="Note" rows={3} value={followNote} onChange={(event) => setFollowNote(event.target.value)} disabled={busy} />
              <BigButton
                busy={busy}
                busyLabel="Saving…"
                disabled={!followNote.trim()}
                onClick={() => void act({ action: "followUp", note: followNote }, "The account is live ✓").then((ok) => ok && setFollowNote(""))}
              >
                Done: account is live
              </BigButton>
            </>
          ) : null}

          {view.step === "live" ? <p className="ui-card-text">Every step is done. The account is Active.</p> : null}

          {flow.estimateUrl ? (
            <a className="ui-link" href={flow.estimateUrl} target="_blank" rel="noopener noreferrer">
              See the accepted estimate{flow.estimateName ? ` (${flow.estimateName})` : ""}
            </a>
          ) : null}

          {view.step !== "live" ? <StuckNote accountId={accountId} view={view} onSaved={() => void load()} /> : null}

          <details>
            <summary className="ui-link">Who did what</summary>
            <ul className="ui-list-plain" style={{ marginTop: 8, gap: 4 }}>
              {flow.events.map((event, index) => (
                <li key={`${event.at}-${index}`} className="ui-muted">
                  {FLOW_STEPS.find((step) => step.key === event.step)?.tracker}: {EVENT_WORDS[event.action]}
                  {event.action === "offer" ? ` ${event.note}` : ""} · {event.by || "Someone"} · {friendlyDate(event.at)}
                  {event.note && event.action !== "offer" ? ` — ${event.note}` : ""}
                </li>
              ))}
            </ul>
          </details>
        </div>
      </Card>

      <PickSubSheet open={picking} flow={flow} onClose={() => setPicking(false)} onSent={() => void load()} />
    </div>
  );
}

/** "Why is it stuck?": one short note on the step, shown on the pin. */
export function StuckNote({ accountId, view, onSaved }: { accountId: string; view: FlowDetail["view"]; onSaved: () => void }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(view.stuckNote);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function save(note: string) {
    setBusy(true);
    setError("");
    try {
      await postFlow({ action: "note", accountId, note });
      showToast(note ? "Note saved ✓" : "Note cleared");
      setEditing(false);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "That did not save. Try again.");
    } finally {
      setBusy(false);
    }
  }

  if (!editing) {
    return (
      <div className="ui-stack">
        {view.stuckNote ? (
          <p className="ui-card-text">
            <strong>Stuck:</strong> {view.stuckNote}
            <span className="ui-muted">
              {" "}
              — {view.stuckNoteBy}, {friendlyDate(view.stuckNoteAt)}
            </span>
          </p>
        ) : null}
        <BigButton
          kind="quiet"
          onClick={() => {
            setText(view.stuckNote);
            setEditing(true);
          }}
        >
          {view.stuckNote ? "Change the note" : "Why is it stuck? Add a note"}
        </BigButton>
      </div>
    );
  }

  return (
    <div className="ui-stack">
      <TextAreaField label="Why is this step stuck?" rows={2} maxLength={500} value={text} onChange={(event) => setText(event.target.value)} disabled={busy} />
      {error ? <ErrorBox title="Not saved" text={error} /> : null}
      <div className="ui-actions-row">
        <BigButton busy={busy} busyLabel="Saving…" disabled={!text.trim()} onClick={() => void save(text.trim())}>
          Save note
        </BigButton>
        {view.stuckNote ? (
          <BigButton kind="second" disabled={busy} onClick={() => void save("")}>
            Clear it
          </BigButton>
        ) : null}
        <BigButton kind="quiet" disabled={busy} onClick={() => setEditing(false)}>
          Cancel
        </BigButton>
      </div>
    </div>
  );
}

type SubOption = { id: string; label: string };

/** Step 2: the suggested subs (tap one), or any sub from the list, then the days, time and length the sub will see. */
function PickSubSheet({ open, flow, onClose, onSent }: { open: boolean; flow: FlowDetail; onClose: () => void; onSent: () => void }) {
  const [subs, setSubs] = useState<SubOption[]>([]);
  const [subId, setSubId] = useState("");
  const [subLabel, setSubLabel] = useState("");
  const [days, setDays] = useState(flow.cleaningDays);
  const [start, setStart] = useState(DEFAULT_START_TIME);
  const [minutes, setMinutes] = useState(DEFAULT_MINUTES_ON_SITE);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setError("");
    setDays((current) => current || flow.cleaningDays);
    fetch("/api/subcontractors", { cache: "no-store" })
      .then((response) => response.json())
      .then((data: { subcontractors?: Record<string, unknown>[]; subs?: Record<string, unknown>[]; data?: Record<string, unknown>[] }) => {
        const list = data.subcontractors || data.subs || data.data || [];
        setSubs(
          list
            .filter((sub) => String(sub.status ?? "").trim().toLowerCase() !== "inactive")
            .map((sub) => {
              const contact = String(sub.contactName ?? sub.name ?? "").trim();
              const company = String(sub.companyName ?? "").trim();
              return { id: String(sub.id ?? sub.subcontractorId ?? "").trim(), label: contact && company && contact !== company ? `${contact} — ${company}` : contact || company };
            })
            .filter((sub) => sub.id && sub.label)
            .sort((a, b) => a.label.localeCompare(b.label))
        );
      })
      .catch(() => setSubs([]));
  }, [open, flow.cleaningDays]);

  async function send() {
    if (!subId) {
      setError("Tap a sub, or pick one from the list.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const daysText = days.trim() || suggestionDays("").map((day) => day.slice(0, 3)).join(", ");
      const data = await postFlow({ action: "offer", accountId: flow.accountId, subId, days: daysText, start: toClock(start), minutes });
      showToast(`Sent to ${data.subName ?? subLabel} ✓`);
      onClose();
      onSent();
    } catch (err) {
      setError(err instanceof Error ? err.message : "That did not save. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet
      open={open}
      title="Choose subcontractor"
      text={flow.address || flow.accountName}
      onClose={() => {
        if (!busy) onClose();
      }}
      busy={busy}
      actions={
        <BigButton busy={busy} busyLabel="Sending…" disabled={!subId} onClick={() => void send()}>
          {subLabel ? `Send to ${subLabel}` : "Send to the sub"}
        </BigButton>
      }
    >
      <div className="ui-stack">
        <Field label="Cleaning days" hint="What the sub will see, e.g. Mon, Wed, Fri." value={days} onChange={(event) => setDays(event.target.value)} disabled={busy} />
        <div className="flex flex-wrap gap-x-8 gap-y-3">
          <div>
            <p className="ui-label">Time</p>
            <PlusMinus value={start} onChange={setStart} step={START_TIME_STEP} min={START_TIME_MIN} max={START_TIME_MAX} label="Start time" format={formatClock} />
          </div>
          <div>
            <p className="ui-label">Time needed</p>
            <PlusMinus value={minutes} onChange={setMinutes} step={MINUTES_ON_SITE_STEP} min={MIN_MINUTES_ON_SITE} max={MAX_MINUTES_ON_SITE} label="Time needed" format={formatMinutes} />
          </div>
        </div>
        <SubSuggestions
          lat={flow.latitude}
          lng={flow.longitude}
          cleaningDays={days}
          start={start}
          minutes={minutes}
          selectedId={subId}
          hint="Tap one to pick it."
          onSelect={(result) => {
            setSubId(result.subId);
            setSubLabel(result.contactName || result.name);
          }}
        />
        {flow.latitude === null ? <p className="ui-muted">No map position for this address, so there are no suggestions. Pick the sub from the list.</p> : null}
        <SelectField
          label="Or pick any sub"
          value={subs.some((sub) => sub.id === subId) ? subId : ""}
          onChange={(event) => {
            const picked = subs.find((sub) => sub.id === event.target.value);
            setSubId(picked?.id ?? "");
            setSubLabel(picked ? picked.label.split(" — ")[0] : "");
          }}
          disabled={busy}
        >
          <option value="">Select subcontractor</option>
          {subs.map((sub) => (
            <option key={sub.id} value={sub.id}>
              {sub.label}
            </option>
          ))}
        </SelectField>
        {error ? <ErrorBox title="Not sent" text={error} /> : null}
      </div>
    </Sheet>
  );
}
