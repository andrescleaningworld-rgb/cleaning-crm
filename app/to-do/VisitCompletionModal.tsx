"use client";

import { useState } from "react";
import AccountMultiSelect, {
  type AccountMultiSelectOption,
} from "@/app/components/AccountMultiSelect";
import type { ToDo } from "./page";

// Distinct vocabulary from ToDo's taskType — "Visit" (the to-do type that
// triggers this modal) has no equivalent entry here, since Visits categorizes
// by what kind of visit it was, not by the to-do that prompted it.
const VISIT_TYPES = [
  "Routine Visit",
  "Complaint Follow-Up",
  "Quality Check",
  "Onboarding New Account",
  "Customer Request",
  "Subcontractor Review",
  "Other",
];

const CONDITION_SCORES = Array.from({ length: 11 }, (_, i) => String(10 - i));

export type VisitFromToDoPayload = {
  date: string;
  accountName: string;
  manager: string;
  subcontractor: string;
  visitType: string;
  condition: string;
  followUpNeeded: string;
  followUpDate: string;
  notes: string;
};

function todayDate() {
  return new Date().toISOString().slice(0, 10);
}

export default function VisitCompletionModal({
  todo,
  initialNotes,
  accounts,
  loadingAccounts,
  onSaveAndComplete,
  onSkip,
}: {
  todo: ToDo;
  // The notes draft as typed when "Done" was clicked — not necessarily
  // todo.notes, which may lag behind an unsaved edit (see ToDoCard's
  // handleStatusChange comment). Used as the notes fallback below.
  initialNotes: string;
  accounts: AccountMultiSelectOption[];
  loadingAccounts: boolean;
  // Rejects (without closing the modal) if the /api/visits save fails, so
  // the inline error stays up and the user can retry or fall back to onSkip.
  onSaveAndComplete: (payload: VisitFromToDoPayload) => Promise<void>;
  onSkip: () => Promise<void>;
}) {
  const [date, setDate] = useState(todayDate());
  const [selectedAccount, setSelectedAccount] = useState<string[]>(
    todo.accountName ? [todo.accountName] : []
  );
  const [manager, setManager] = useState(todo.assignedTo);
  const [subcontractor, setSubcontractor] = useState("");
  const [visitType, setVisitType] = useState("Routine Visit");
  const [condition, setCondition] = useState("8");
  const [followUpNeeded, setFollowUpNeeded] = useState("No");
  const [followUpDate, setFollowUpDate] = useState("");
  const [notes, setNotes] = useState(
    todo.outcome && todo.outcome.trim() ? todo.outcome : initialNotes
  );

  const [saving, setSaving] = useState(false);
  const [skipping, setSkipping] = useState(false);
  const [error, setError] = useState("");

  const busy = saving || skipping;

  async function handleSaveAndComplete() {
    setError("");

    if (!date) {
      setError("Visit date is required.");
      return;
    }
    if (selectedAccount.length === 0) {
      setError("Select an account.");
      return;
    }

    setSaving(true);
    try {
      await onSaveAndComplete({
        date,
        accountName: selectedAccount[0],
        manager,
        subcontractor,
        visitType,
        condition,
        followUpNeeded,
        followUpDate,
        notes,
      });
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Could not save the visit. Try again, or skip and just complete the to-do."
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleSkip() {
    setSkipping(true);
    try {
      await onSkip();
    } finally {
      setSkipping(false);
    }
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/50 p-4">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-xl">
        <h2 className="text-lg font-bold">Log this as a Visit?</h2>
        <p className="mt-1 text-sm text-slate-600">
          This to-do is a Visit. Save a matching row on the Visits page so it
          doesn&apos;t need to be entered twice, or skip and just complete the
          to-do.
        </p>

        {error ? (
          <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-800">
            {error}
          </div>
        ) : null}

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div>
            <label className="text-xs font-semibold text-slate-500" htmlFor="visit-modal-date">
              Visit Date
            </label>
            <input
              id="visit-modal-date"
              type="date"
              value={date}
              onChange={(event) => setDate(event.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-500">Account</label>
            <div className="mt-1">
              <AccountMultiSelect
                accounts={accounts}
                selected={selectedAccount}
                onChange={setSelectedAccount}
                singleSelect
                loading={loadingAccounts}
                placeholder="Select account"
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-500" htmlFor="visit-modal-manager">
              Manager / Visited By
            </label>
            <input
              id="visit-modal-manager"
              value={manager}
              onChange={(event) => setManager(event.target.value)}
              placeholder="Manager"
              className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-500" htmlFor="visit-modal-sub">
              Subcontractor (optional)
            </label>
            <input
              id="visit-modal-sub"
              value={subcontractor}
              onChange={(event) => setSubcontractor(event.target.value)}
              placeholder="Subcontractor"
              className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-500" htmlFor="visit-modal-type">
              Visit Type
            </label>
            <select
              id="visit-modal-type"
              value={visitType}
              onChange={(event) => setVisitType(event.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"
            >
              {VISIT_TYPES.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-500" htmlFor="visit-modal-condition">
              Condition Score 0-10
            </label>
            <select
              id="visit-modal-condition"
              value={condition}
              onChange={(event) => setCondition(event.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"
            >
              <option value="">Not Scored</option>
              {CONDITION_SCORES.map((score) => (
                <option key={score} value={score}>
                  {score}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-500" htmlFor="visit-modal-followup">
              Follow-Up Needed
            </label>
            <select
              id="visit-modal-followup"
              value={followUpNeeded}
              onChange={(event) => setFollowUpNeeded(event.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"
            >
              <option>No</option>
              <option>Yes</option>
            </select>
          </div>

          {followUpNeeded === "Yes" ? (
            <div>
              <label className="text-xs font-semibold text-slate-500" htmlFor="visit-modal-followup-date">
                Follow-Up Date
              </label>
              <input
                id="visit-modal-followup-date"
                type="date"
                value={followUpDate}
                onChange={(event) => setFollowUpDate(event.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
          ) : null}
        </div>

        <div className="mt-4">
          <label className="text-xs font-semibold text-slate-500" htmlFor="visit-modal-notes">
            Notes
          </label>
          <textarea
            id="visit-modal-notes"
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            rows={4}
            placeholder="Write visit notes, issues found, customer feedback, or follow-up details..."
            className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
          />
        </div>

        <div className="mt-6 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={handleSaveAndComplete}
            disabled={busy}
            className="rounded-xl bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-600 disabled:opacity-60"
          >
            {saving ? "Saving..." : "Save Visit + Complete To-Do"}
          </button>
          <button
            type="button"
            onClick={handleSkip}
            disabled={busy}
            className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold hover:bg-slate-50 disabled:opacity-60"
          >
            {skipping ? "Completing..." : "Skip, just complete To-Do"}
          </button>
        </div>
      </div>
    </div>
  );
}
