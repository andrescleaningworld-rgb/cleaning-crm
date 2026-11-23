"use client";

// On each open complaint in the Sub Portal: "We're on it" (when will it be
// done?), the promised date, and "Change date" with a short reason. The rules
// and words (English, Spanish, Portuguese) are in lib/complaintPromise.ts.

import { useState } from "react";
import { Field, BigButton, SelectField, Sheet, TextAreaField, showToast } from "@/app/ui";
import { PROMISE_REASONS, PROMISE_WORDS, promisePassed, promiseWhen, type PromiseLang, type PromiseReason } from "@/lib/complaintPromise";

export type SubPromise = { dueDate: string; dueTime: string };

const officeToday = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });

export default function ComplaintPromiseBox({
  complaint,
  promise,
  lang,
  onSaved,
}: {
  complaint: { id?: string | number; complaintId?: string; rowNumber?: string | number };
  promise: SubPromise | null | undefined;
  lang: PromiseLang;
  onSaved: (promise: SubPromise) => void;
}) {
  const words = PROMISE_WORDS[lang];
  const [open, setOpen] = useState(false);
  const [dueDate, setDueDate] = useState("");
  const [dueTime, setDueTime] = useState("");
  const [reason, setReason] = useState<PromiseReason | "">("");
  const [other, setOther] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  function start() {
    setDueDate(promise?.dueDate ?? "");
    setDueTime(promise?.dueTime ?? "");
    setReason("");
    setOther("");
    setError("");
    setOpen(true);
  }

  async function save() {
    setError("");
    if (!dueDate) return setError(words.needDate);
    if (promisePassed({ dueDate, dueTime })) return setError(words.needFuture);
    if (promise) {
      if (promise.dueDate === dueDate && promise.dueTime === dueTime) return setError(words.sameDate);
      if (!reason) return setError(words.needReason);
      if (reason === "other" && !other.trim()) return setError(words.needOther);
    }
    setBusy(true);
    try {
      const response = await fetch("/api/subcontractor-portal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "setComplaintPromise", complaint: { id: complaint.id || complaint.complaintId || "", rowNumber: complaint.rowNumber || "" }, dueDate, dueTime, reason, reasonText: other.trim() }),
      });
      const data = (await response.json().catch(() => ({}))) as { success?: boolean; code?: keyof typeof words };
      if (!response.ok || !data.success) {
        const said = data.code ? words[data.code] : "";
        throw new Error(typeof said === "string" && said ? said : words.failed);
      }
      onSaved({ dueDate, dueTime });
      setOpen(false);
      showToast(words.saved);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : words.failed);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="ui-stack" data-complaint-promise>
      {promise ? (
        <>
          <p className="ui-strong" style={{ margin: 0, fontSize: 20 }}>{words.doneBy(promiseWhen(promise.dueDate, promise.dueTime, lang))}</p>
          <BigButton kind="second" onClick={start}>{words.change}</BigButton>
        </>
      ) : (
        <BigButton onClick={start}>{words.onIt}</BigButton>
      )}
      <Sheet
        open={open}
        title={promise ? words.change : words.ask}
        onClose={() => setOpen(false)}
        busy={busy}
        actions={<BigButton busy={busy} busyLabel="…" onClick={() => void save()}>{words.save}</BigButton>}
      >
        <div className="ui-stack">
          <Field label={words.date} type="date" min={officeToday()} value={dueDate} onChange={(event) => setDueDate(event.target.value)} />
          <Field label={words.time} type="time" value={dueTime} onChange={(event) => setDueTime(event.target.value)} />
          {promise ? (
            <SelectField label={words.why} value={reason} onChange={(event) => setReason(event.target.value as PromiseReason | "")}>
              <option value="">{words.why}</option>
              {PROMISE_REASONS.map((value) => (
                <option key={value} value={value}>{words.reasons[value]}</option>
              ))}
            </SelectField>
          ) : null}
          {promise && reason === "other" ? <TextAreaField label={words.other} rows={2} maxLength={300} value={other} onChange={(event) => setOther(event.target.value)} /> : null}
          {error ? <p className="ui-field-error" role="alert">{error}</p> : null}
        </div>
      </Sheet>
    </div>
  );
}
