"use client";

import { FormEvent, useState } from "react";
import { AutocompleteField, useCustomerSearch } from "./autocomplete";
import { BigButton, ErrorBox, Field, SelectField, Sheet, TextAreaField } from "@/app/ui";

export type ScheduleException = {
  sheetRow: number;
  exceptionId: string;
  accountId: string;
  originalDate: string;
  type: string;
  newDate: string;
  newTimeWindow: string;
  reason: string;
  createdBy: string;
  createdDate: string;
};

const TIME_WINDOWS = ["", "Morning", "Midday", "Afternoon", "Evening"];

type Props = {
  target: "new" | ScheduleException;
  adminName: string;
  // Resolved display name for target.accountId when editing an existing
  // exception (the modal has no way to look this up itself).
  accountName?: string;
  onClose: () => void;
  onSaved: () => void;
};

export default function ExceptionModal({ target, adminName, accountName, onClose, onSaved }: Props) {
  const isNew = target === "new";

  const customer = useCustomerSearch();
  const [originalDate, setOriginalDate] = useState(isNew ? "" : target.originalDate);
  const [type, setType] = useState(isNew ? "Skip" : target.type || "Skip");
  const [newDate, setNewDate] = useState(isNew ? "" : target.newDate);
  const [newTimeWindow, setNewTimeWindow] = useState(isNew ? "" : target.newTimeWindow);
  const [reason, setReason] = useState(isNew ? "" : target.reason);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e?: FormEvent<HTMLFormElement>) {
    e?.preventDefault();

    const accountId = isNew ? customer.selected?.id ?? "" : target.accountId;
    if (!accountId || !originalDate || !reason.trim()) {
      setError("Customer, original date, and reason are required.");
      return;
    }
    if (type === "Reschedule" && !newDate) {
      setError("Pick a new date for a reschedule.");
      return;
    }
    if (isNew && !adminName.trim()) {
      setError("Enter your name above before saving.");
      return;
    }

    setSubmitting(true);
    setError("");

    try {
      if (isNew) {
        const res = await fetch("/api/admin/schedule-exceptions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            accountId,
            originalDate,
            type,
            newDate: type === "Reschedule" ? newDate : "",
            newTimeWindow: type === "Reschedule" ? newTimeWindow : "",
            reason: reason.trim(),
            createdBy: adminName.trim(),
          }),
        });
        const data = (await res.json()) as { success?: boolean; error?: string };
        if (!res.ok || !data.success) {
          setError(data.error ?? "Failed to create exception.");
          return;
        }
      } else {
        const res = await fetch("/api/admin/schedule-exceptions", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sheetRow: target.sheetRow,
            fields: {
              originalDate,
              type,
              newDate: type === "Reschedule" ? newDate : "",
              newTimeWindow: type === "Reschedule" ? newTimeWindow : "",
              reason: reason.trim(),
            },
          }),
        });
        const data = (await res.json()) as { success?: boolean; error?: string };
        if (!res.ok || !data.success) {
          setError(data.error ?? "Failed to update exception.");
          return;
        }
      }
      onSaved();
      onClose();
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Sheet
      open
      title={isNew ? "New schedule exception" : "Edit exception"}
      text={isNew ? undefined : accountName || target.accountId}
      onClose={onClose}
      busy={submitting}
      actions={
        <BigButton busy={submitting} busyLabel="Saving…" onClick={() => void handleSubmit()}>
          Save
        </BigButton>
      }
    >
      {isNew ? (
        <AutocompleteField
          label="Customer"
          placeholder="Search customer name"
          query={customer.query}
          onQueryChange={customer.setQuery}
          options={customer.options}
          loading={customer.loading}
          selected={customer.selected}
          onSelect={customer.select}
          onClear={customer.clear}
        />
      ) : null}

      <Field label="Original date" type="date" value={originalDate} onChange={(e) => setOriginalDate(e.target.value)} />

      <SelectField label="Type" value={type} onChange={(e) => setType(e.target.value)}>
        <option value="Skip">Skip this date</option>
        <option value="Reschedule">Reschedule this date</option>
        <option value="Other">Other</option>
      </SelectField>

      {type === "Reschedule" && (
        <>
          <Field label="New date" type="date" value={newDate} onChange={(e) => setNewDate(e.target.value)} />
          <SelectField label="New time window" value={newTimeWindow} onChange={(e) => setNewTimeWindow(e.target.value)}>
            {TIME_WINDOWS.map((w) => (
              <option key={w} value={w}>
                {w || "Unspecified"}
              </option>
            ))}
          </SelectField>
        </>
      )}

      <TextAreaField label="Reason" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />

      {!isNew && (
        <p className="ui-muted">
          Created by {target.createdBy || "someone not recorded"} on {target.createdDate || "a date not recorded"}
        </p>
      )}

      {error ? <ErrorBox title="The exception was not saved." text={error} /> : null}
    </Sheet>
  );
}
