"use client";

// "Add to-do" for one account, as a sheet. The same form and the same
// request as the quick to-do on the Accounts list (app/accounts/page.tsx):
// POST /api/to-do { action: "addToDos" } with one account.

import { useEffect, useState } from "react";
import { BigButton, CHEER, ErrorBox, Field, SelectField, Sheet, TextAreaField, showToast } from "@/app/ui";

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

type ManagerRow = { name?: string; status?: string };

// Accounts and the managers list don't always agree on accents (e.g.
// "Andres" vs "Andrés"), so strip diacritics before comparing.
const foldAccents = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();

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

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setError("");
    fetch("/api/admin/managers", { cache: "no-store" })
      .then((response) => response.json())
      .then((data: { managers?: ManagerRow[]; data?: ManagerRow[] } | ManagerRow[]) => {
        if (cancelled) return;
        const rows: ManagerRow[] = Array.isArray(data) ? data : (data.managers ?? data.data ?? []);
        const names = Array.from(
          new Set(
            rows
              .filter((row) => !row.status || row.status === "Active")
              .map((row) => (row.name ?? "").trim())
              .filter(Boolean)
          )
        ).sort();
        setManagers(names);
        const mine = names.find((name) => foldAccents(name) === foldAccents(manager ?? ""));
        setForm({ ...EMPTY_FORM, assignedTo: mine ?? "" });
      })
      .catch(() => {
        if (!cancelled) setManagers([]);
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
      const data = (await response.json().catch(() => ({}))) as { success?: boolean; message?: string; calendarSyncFailed?: boolean };
      if (!data.success) throw new Error(data.message ?? "Could not create to-do.");
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
      {error ? <ErrorBox title="The to-do was not created." text={error} onRetry={() => void submit()} /> : null}
    </Sheet>
  );
}
