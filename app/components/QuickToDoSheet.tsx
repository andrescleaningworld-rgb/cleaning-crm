"use client";

// "Add to-do" for one account, as a sheet. The same form and the same
// request as the quick to-do on the Accounts list (app/accounts/page.tsx):
// POST /api/to-do { action: "addToDos" } with one account.

import { useEffect, useState } from "react";
import { BigButton, CHEER, ErrorBox, Field, SelectField, Sheet, TextAreaField, showToast } from "@/app/ui";
import { PinSwitch, pinAfterSave, startingPin, usePinInfo, type PinChoice } from "./pin-to-board";
import { loadManagerNames } from "./manager-options";
import { pickManager } from "@/lib/managerNames";

const TASK_TYPES = [
  "Visit",
  "Complaint Follow-Up",
  "Account Follow-Up",
  "New Account Onboarding",
  "Customer Call",
  "Subcontractor Follow-Up",
  "Reminder",
  "Other",
];

const EMPTY_FORM = { assignedTo: "", taskType: "Visit", dueDate: "", why: "", notes: "" };

export default function QuickToDoSheet({
  open,
  onClose,
  accountId,
  accountName,
  manager,
}: {
  open: boolean;
  onClose: () => void;
  accountId: string;
  accountName: string;
  /** The account's manager: pre-selected in "Assigned to" when they are on the list. */
  manager?: string;
}) {
  const [managers, setManagers] = useState<string[]>([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  // "Pin to board": starts as Settings says, in the square of whoever it is assigned to.
  const { info: pinInfo } = usePinInfo();
  const [pinPicked, setPinPicked] = useState<PinChoice | null>(null);
  const pinChoice = pinPicked ?? startingPin(pinInfo, "todo", form.assignedTo);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setError("");
    // The same list as every Manager dropdown: active managers on the Staff list.
    void loadManagerNames().then((loaded) => {
      if (cancelled) return;
      const names = loaded ?? [];
      setManagers(names);
      // "Andres" picks Andrés; with two managers saved ("Greg , Andres"), the first one written.
      setForm({ ...EMPTY_FORM, assignedTo: pickManager(manager, names) });
    });
    return () => {
      cancelled = true;
    };
  }, [open, manager]);

  async function submit() {
    setError("");
    if (!form.assignedTo.trim()) {
      setError("Assigned To is required.");
      return;
    }
    if (!form.why.trim()) {
      setError("Why is required.");
      return;
    }
    setSaving(true);
    try {
      const response = await fetch("/api/to-do", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "addToDos",
          accountNames: [accountName],
          accountIds: [accountId],
          dueDate: form.dueDate,
          assignedTo: form.assignedTo,
          taskType: form.taskType,
          why: form.why,
          notes: form.notes,
          status: "Open",
        }),
      });
      const data = (await response.json().catch(() => ({}))) as { success?: boolean; message?: string; calendarSyncFailed?: boolean; ids?: string[] };
      if (!data.success) throw new Error(data.message ?? "Could not create to-do.");
      await pinAfterSave(pinInfo, "todo", pinChoice, { recordId: data.ids?.[0] ?? "", title: [form.why || form.taskType, accountName].filter(Boolean).join(" · "), accountId, accountName });
      setPinPicked(null);
      onClose();
      showToast(data.calendarSyncFailed ? `${CHEER.logged} (Calendar sync failed, check the To-Do page.)` : CHEER.logged);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create to-do.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet
      open={open}
      title="New to-do"
      text={accountName}
      onClose={() => {
        if (!saving) onClose();
      }}
      busy={saving}
      actions={
        <BigButton busy={saving} busyLabel="Saving…" onClick={() => void submit()}>
          Create to-do
        </BigButton>
      }
    >
      <SelectField label="Assigned to" value={form.assignedTo} onChange={(e) => setForm((f) => ({ ...f, assignedTo: e.target.value }))} disabled={saving}>
        <option value="">Select a manager…</option>
        {managers.map((name) => (
          <option key={name} value={name}>
            {name}
          </option>
        ))}
      </SelectField>
      <SelectField label="Type" value={form.taskType} onChange={(e) => setForm((f) => ({ ...f, taskType: e.target.value }))} disabled={saving}>
        {TASK_TYPES.map((type) => (
          <option key={type} value={type}>
            {type}
          </option>
        ))}
      </SelectField>
      <Field label="Due date" type="date" optional value={form.dueDate} onChange={(e) => setForm((f) => ({ ...f, dueDate: e.target.value }))} disabled={saving} />
      <Field
        label="Why"
        placeholder="Customer said restrooms need attention"
        value={form.why}
        onChange={(e) => setForm((f) => ({ ...f, why: e.target.value }))}
        disabled={saving}
      />
      <TextAreaField
        label="Notes"
        optional
        rows={3}
        placeholder="Extra instructions"
        value={form.notes}
        onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
        disabled={saving}
      />
      <PinSwitch info={pinInfo} type="todo" value={pinChoice} onChange={setPinPicked} disabled={saving} />
      {error ? <ErrorBox title="The to-do was not created." text={error} onRetry={() => void submit()} /> : null}
    </Sheet>
  );
}
