"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import AccountMultiSelect, {
  type AccountMultiSelectOption,
} from "@/app/components/AccountMultiSelect";
import VisitCompletionModal, {
  type VisitFromToDoPayload,
} from "./VisitCompletionModal";
import PrintTaskSheet from "./print/PrintTaskSheet";
import PrintByManager from "./print/PrintByManager";
import {
  DEFAULT_TO_DO_PRIORITY,
  TO_DO_PRIORITIES,
  type ToDoPriority,
} from "@/lib/toDoPriority";
import { identifyManager, getStoredManagerId } from "@/app/components/OneSignalInit";

// Shape returned by GET /api/to-do/[id]/sms-status — mirrors lib/googleSheets.ts's
// SmsLogEntry closely enough for badge rendering without importing a server-only type.
type SmsStatusEntry = {
  status: string;
  sentAt: string;
  lastCheckedAt: string;
  textId: string;
};
type SmsStatusResponse = { hasLog: boolean; entry?: SmsStatusEntry };
type SmsStatusState = SmsStatusResponse & { isStuck: boolean };

// A non-terminal status this old counts as "stuck" for resend-button
// purposes (item 3's "Unknown/stuck for some reasonable idle window") —
// separate from the badge text itself, which stays "Notifying…" either way.
const SMS_STUCK_AFTER_MS = 10 * 60 * 1000;

// Plain function, not a hook — safe to call Date.now() here. Computed once
// when a fetch resolves (an async callback, not a render body) rather than
// live via a timer, so "stuck" only re-evaluates on the next status fetch
// instead of ticking every render.
function computeIsStuck(data: SmsStatusResponse): boolean {
  const status = (data.entry?.status ?? "").toUpperCase();
  if (!data.hasLog || status === "DELIVERED" || status === "FAILED") return false;

  const sentMs = data.entry?.sentAt ? Date.parse(data.entry.sentAt) : NaN;
  return Number.isFinite(sentMs) && Date.now() - sentMs > SMS_STUCK_AFTER_MS;
}

export type ToDo = {
  id: string;
  createdDate: string;
  dueDate: string;
  assignedTo: string;
  accountName: string;
  taskType: string;
  why: string;
  status: string;
  notes: string;
  // Deeper-detail writeup (what was actually found/done on a visit) — kept
  // separate from `notes`, which is a short, frequently-edited "latest
  // update" rather than a full outcome writeup.
  outcome?: string;
  // Links a "Complaint Follow-Up" to-do back to the complaint that created
  // it (see app/complaints/new/page.tsx). Optional: only set on to-dos
  // auto-created from a complaint, not on manually-created ones.
  complaintId?: string;
  // Shared by every to-do created together when multiple accounts are
  // selected on a Visit (see handleSubmit) — blank on ordinary to-dos.
  groupId?: string;
  // Links this to-do to a specific account by id (see TO_DO_COL.ACCOUNT_ID
  // in lib/googleSheets.ts) — blank for to-dos created before this field
  // existed or with no account attached. Used by the "Open Onboarding
  // Checklist" card action below to jump straight to the right account
  // without guessing from accountName.
  accountId?: string;
  // True when the most recent Calendar sync attempt (create or status
  // update) for this to-do failed — non-blocking: the to-do itself always
  // saves regardless. See lib/googleCalendar.ts.
  calendarSyncFailed?: boolean;
  // User's choice of whether this to-do should sync to Google Calendar.
  // Available for every task type. Optional here (like calendarSyncFailed
  // above) since older rows may load before this field existed — treat a
  // missing value as synced, matching the backend's default-true read.
  syncToCalendar?: boolean;
  // Low/Medium/High tier. Optional here for the same reason as
  // syncToCalendar above — older rows may load before this field existed;
  // treat a missing value as "Medium", matching the backend's default.
  priority?: ToDoPriority;
};

type Account = {
  id?: string;
  accountId?: string;
  rowNumber?: number;
  name?: string;
  accountName?: string;
  status?: string;
};

// Same fallback chain as app/accounts/page.tsx's getAccountId and
// app/accounts/[id]/page.tsx's — accountId first, falling back to id/
// rowNumber/name for accounts whose record predates a stable id field.
function getAccountId(account: Account): string {
  return String(account.accountId ?? account.id ?? account.rowNumber ?? account.accountName ?? "").trim();
}

// Resolves the account-detail link for a "New Account Onboarding" to-do's
// card action. Prefers the to-do's own accountId (set at creation time by
// this page's and the Accounts page's to-do forms); falls back to matching
// this to-do's accountName against the loaded accounts list for to-dos
// created before that field existed. Returns null (renders no link) only
// when neither resolves — never guesses via title text.
function getOnboardingAccountHref(todo: ToDo, accounts: Account[]): string | null {
  const directId = (todo.accountId ?? "").trim();
  if (directId) return `/accounts/${encodeURIComponent(directId)}?onboarding=1`;

  if (!todo.accountName) return null;
  const match = accounts.find((account) => getAccountName(account) === todo.accountName);
  if (!match) return null;

  const matchedId = getAccountId(match);
  return matchedId ? `/accounts/${encodeURIComponent(matchedId)}?onboarding=1` : null;
}

type Manager = {
  managerId?: string;
  name?: string;
  status?: string;
};

type ToDoForm = {
  dueDate: string;
  assignedTo: string;
  taskType: string;
  why: string;
  status: string;
  notes: string;
  syncToCalendar: boolean;
  priority: ToDoPriority;
};

const emptyForm: ToDoForm = {
  dueDate: "",
  assignedTo: "",
  taskType: "Visit",
  why: "",
  status: "Open",
  notes: "",
  syncToCalendar: true,
  priority: DEFAULT_TO_DO_PRIORITY,
};

const taskTypes = [
  "Visit",
  "Complaint Follow-Up",
  "Account Follow-Up",
  "New Account Onboarding",
  "Customer Call",
  "Subcontractor Follow-Up",
  "Reminder",
  "Other",
];

// The only task type where an account link is optional — quotes/calls/
// emails to a customer can still name an account, but a personal reminder
// ("order more supplies") has nothing to attach. Every other type keeps the
// existing required-account validation.
const ACCOUNT_OPTIONAL_TASK_TYPE = "Reminder";

const statuses = ["Open", "In Progress", "Done", "Cancelled"];

function getAccountName(account: Account) {
  return account.accountName || account.name || "";
}

// Distinct color per status so state reads at a glance without opening the
// card — the badge previously used the same gray pill for every status.
function statusBadgeClasses(status: string): string {
  switch (status) {
    case "In Progress":
      return "bg-amber-100 text-amber-800";
    case "Done":
      return "bg-green-100 text-green-800";
    case "Cancelled":
      return "bg-slate-200 text-slate-600";
    case "Open":
    default:
      return "bg-blue-100 text-blue-800";
  }
}

// Same reasoning as statusBadgeClasses above — a color per tier so priority
// reads at a glance without opening the card.
function priorityBadgeClasses(priority: ToDoPriority): string {
  switch (priority) {
    case "High":
      return "bg-red-100 text-red-700";
    case "Low":
      return "bg-slate-200 text-slate-600";
    case "Medium":
    default:
      return "bg-amber-100 text-amber-800";
  }
}

function isOverdue(todo: ToDo) {
  if (!todo.dueDate) return false;
  if (todo.status === "Done" || todo.status === "Cancelled") return false;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const dueDate = new Date(todo.dueDate);
  dueDate.setHours(0, 0, 0, 0);

  return dueDate < today;
}

export type ToDoEditFields = {
  assignedTo: string;
  taskType: string;
  dueDate: string;
  status: string;
  syncToCalendar: boolean;
  priority: ToDoPriority;
};

type ToDoCardProps = {
  todo: ToDo;
  recurringCount: number;
  managers: string[];
  onUpdateStatus: (toDoId: string, status: string, notes: string) => Promise<void>;
  onSaveOutcome: (toDoId: string, outcome: string) => Promise<void>;
  onEditToDo: (toDoId: string, updates: ToDoEditFields) => Promise<void>;
  // Only called for taskType === "Visit" to-dos when "Done" is clicked —
  // opens the Visit-linking modal instead of completing immediately. Every
  // other taskType keeps going straight through onUpdateStatus.
  onRequestVisitCompletion: (todo: ToDo, notes: string) => void;
  bulkEditMode: boolean;
  bulkSelected: boolean;
  onToggleBulkSelected: (toDoId: string) => void;
  // True when this card is the target of a ?id= deep link (see ToDoPage's
  // highlightId). Scrolls into view and rings the card, then fades on its
  // own — see the highlightId effect for the timeout.
  highlighted: boolean;
  // Resolved by the parent (todo.accountId when present, else a same-page
  // accountName lookup against the loaded accounts list) — null when this
  // to-do's account couldn't be resolved at all. Only rendered as a card
  // action for taskType === "New Account Onboarding".
  onboardingAccountHref: string | null;
};

// Small/secondary by design (item 2's own requirement) — sits inline next
// to "Assigned to," never as a headline element on the card. Resend is
// shown only for Failed or a non-terminal status stuck past
// SMS_STUCK_AFTER_MS; "Notifying…" covers every other non-terminal state
// (sent/SENDING/SENT/UNKNOWN) since Textbelt's own statuses aren't all
// meaningful to distinguish for a manager glancing at the list.
function SmsStatusBadge({
  entry,
  isStuck,
  resending,
  resendCoolingDown,
  resendError,
  onResend,
}: {
  entry: SmsStatusEntry | undefined;
  isStuck: boolean;
  resending: boolean;
  resendCoolingDown: boolean;
  resendError: string;
  onResend: () => void;
}) {
  const status = (entry?.status ?? "").toUpperCase();
  const isDelivered = status === "DELIVERED";
  const isFailed = status === "FAILED";
  const showResend = isFailed || isStuck;

  return (
    <div className="mt-1 flex flex-wrap items-center gap-2">
      <span
        className={`rounded-full px-2 py-0.5 text-xs font-medium ${
          isDelivered
            ? "bg-green-100 text-green-700"
            : isFailed
              ? "bg-red-100 text-red-700"
              : "bg-slate-100 text-slate-600"
        }`}
      >
        {isDelivered ? "✓ Delivered" : isFailed ? "⚠ Failed" : "Notifying…"}
      </span>

      {showResend ? (
        <button
          type="button"
          onClick={onResend}
          disabled={resending || resendCoolingDown}
          className="text-xs font-semibold text-blue-700 hover:underline disabled:text-slate-400 disabled:no-underline"
        >
          {resending ? "Resending..." : "Resend"}
        </button>
      ) : null}

      {resendError ? <span className="text-xs text-red-600">{resendError}</span> : null}
    </div>
  );
}

// Status-change buttons and the "Latest update" Save button all funnel
// through onUpdateStatus with the currently-typed notesDraft (not just
// todo.notes) — clicking "Done" with an unsaved note in the box still
// persists that note instead of silently dropping it.
function ToDoCard({
  todo,
  recurringCount,
  managers,
  onUpdateStatus,
  onSaveOutcome,
  onEditToDo,
  onRequestVisitCompletion,
  bulkEditMode,
  bulkSelected,
  onToggleBulkSelected,
  highlighted,
  onboardingAccountHref,
}: ToDoCardProps) {
  const cardRef = useRef<HTMLElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [notesDraft, setNotesDraft] = useState(todo.notes);
  const [outcomeDraft, setOutcomeDraft] = useState(todo.outcome ?? "");
  const [savingStatus, setSavingStatus] = useState(false);
  const [savingOutcome, setSavingOutcome] = useState(false);

  // Assigned To / Type / Due Date / Status editing. Notes already has its
  // own working "Latest update" save flow above (via onUpdateStatus), so
  // it isn't duplicated here — this panel only covers the fields that
  // previously had no way to change after creation at all.
  const [editing, setEditing] = useState(false);
  const [editDraft, setEditDraft] = useState<ToDoEditFields>({
    assignedTo: todo.assignedTo,
    taskType: todo.taskType,
    dueDate: todo.dueDate,
    status: todo.status,
    syncToCalendar: todo.syncToCalendar ?? true,
    priority: todo.priority ?? DEFAULT_TO_DO_PRIORITY,
  });
  const [savingEdit, setSavingEdit] = useState(false);
  const [editError, setEditError] = useState("");

  // SMS notification status — self-fetched per card (not passed down from
  // the list) so this stays fully additive: no change to how ToDoPage loads
  // or filters todos. One check per card mount; the endpoint itself debounces
  // the actual Textbelt call server-side, so re-renders here don't re-fetch.
  const [smsInfo, setSmsInfo] = useState<SmsStatusState | null>(null);
  const [resending, setResending] = useState(false);
  const [resendCoolingDown, setResendCoolingDown] = useState(false);
  const [resendError, setResendError] = useState("");

  useEffect(() => {
    let cancelled = false;

    fetch(`/api/to-do/${encodeURIComponent(todo.id)}/sms-status`, { cache: "no-store" })
      .then((response) => response.json())
      .then((data: SmsStatusResponse) => {
        if (!cancelled) setSmsInfo({ ...data, isStuck: computeIsStuck(data) });
      })
      .catch(() => {
        // Silent — this is a secondary status affordance, never worth
        // blocking or erroring the card over.
      });

    return () => {
      cancelled = true;
    };
  }, [todo.id]);

  async function handleResendNotification() {
    setResending(true);
    setResendError("");
    try {
      const response = await fetch(`/api/to-do/${encodeURIComponent(todo.id)}/resend-notification`, {
        method: "POST",
      });
      const data = await response.json();
      if (!data.success) {
        setResendError(data.message || "Could not resend notification.");
      } else {
        setSmsInfo({
          hasLog: true,
          entry: { status: "sent", sentAt: new Date().toISOString(), lastCheckedAt: "", textId: "" },
          isStuck: false,
        });
      }
    } catch {
      setResendError("Could not resend notification.");
    } finally {
      setResending(false);
      setResendCoolingDown(true);
      setTimeout(() => setResendCoolingDown(false), 30_000);
    }
  }

  useEffect(() => {
    if (highlighted) {
      cardRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [highlighted]);

  useEffect(() => {
    setNotesDraft(todo.notes);
  }, [todo.notes]);

  useEffect(() => {
    setOutcomeDraft(todo.outcome ?? "");
  }, [todo.outcome]);

  useEffect(() => {
    setEditDraft({
      assignedTo: todo.assignedTo,
      taskType: todo.taskType,
      dueDate: todo.dueDate,
      status: todo.status,
      syncToCalendar: todo.syncToCalendar ?? true,
      priority: todo.priority ?? DEFAULT_TO_DO_PRIORITY,
    });
  }, [todo.assignedTo, todo.taskType, todo.dueDate, todo.status, todo.syncToCalendar, todo.priority]);

  async function handleStatusChange(status: string) {
    setSavingStatus(true);
    try {
      await onUpdateStatus(todo.id, status, notesDraft);
    } finally {
      setSavingStatus(false);
    }
  }

  async function handleSaveOutcome() {
    setSavingOutcome(true);
    try {
      await onSaveOutcome(todo.id, outcomeDraft);
    } finally {
      setSavingOutcome(false);
    }
  }

  async function handleSaveEdit() {
    setEditError("");
    if (!editDraft.assignedTo.trim()) {
      setEditError("Assigned To is required.");
      return;
    }

    setSavingEdit(true);
    try {
      await onEditToDo(todo.id, editDraft);
      setEditing(false);
    } catch (err) {
      setEditError(err instanceof Error ? err.message : "Could not save changes.");
    } finally {
      setSavingEdit(false);
    }
  }

  function handleCancelEdit() {
    setEditDraft({
      assignedTo: todo.assignedTo,
      taskType: todo.taskType,
      dueDate: todo.dueDate,
      status: todo.status,
      syncToCalendar: todo.syncToCalendar ?? true,
      priority: todo.priority ?? DEFAULT_TO_DO_PRIORITY,
    });
    setEditError("");
    setEditing(false);
  }

  return (
    <article
      ref={cardRef}
      id={`todo-${todo.id}`}
      className={`flex gap-3 rounded-2xl bg-white p-5 shadow-sm transition-shadow ${
        highlighted
          ? "ring-2 ring-amber-400"
          : bulkEditMode && bulkSelected
            ? "ring-2 ring-blue-500"
            : ""
      }`}
    >
      {bulkEditMode ? (
        <input
          type="checkbox"
          checked={bulkSelected}
          onChange={() => onToggleBulkSelected(todo.id)}
          aria-label={`Select to-do: ${todo.why || todo.id}`}
          className="no-print mt-1 h-5 w-5 shrink-0 rounded border-slate-300"
        />
      ) : null}
      <div className="min-w-0 flex-1">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <div className="flex flex-wrap gap-2">
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
              {todo.taskType || "Task"}
            </span>

            <span className={`rounded-full px-3 py-1 text-xs font-semibold ${priorityBadgeClasses(todo.priority ?? DEFAULT_TO_DO_PRIORITY)}`}>
              {todo.priority ?? DEFAULT_TO_DO_PRIORITY}
            </span>

            <span className={`rounded-full px-3 py-1 text-xs font-semibold ${statusBadgeClasses(todo.status)}`}>
              {todo.status || "Open"}
            </span>

            {isOverdue(todo) ? (
              <span className="rounded-full bg-red-100 px-3 py-1 text-xs font-semibold text-red-700">
                Overdue
              </span>
            ) : null}

            {recurringCount > 1 ? (
              <span className="rounded-full bg-purple-100 px-3 py-1 text-xs font-semibold text-purple-700">
                Recurring ({recurringCount} accounts)
              </span>
            ) : null}

            {todo.calendarSyncFailed ? (
              <span
                className="rounded-full bg-orange-100 px-3 py-1 text-xs font-semibold text-orange-700"
                title="This to-do saved normally, but syncing it to Google Calendar failed. Check Calendar manually."
              >
                ⚠ Calendar sync failed
              </span>
            ) : null}
          </div>

          <h3 className="mt-3 text-lg font-bold">
            {todo.accountName || `${todo.taskType || "Reminder"} (no account)`}
          </h3>

          {todo.taskType === "New Account Onboarding" ? (
            onboardingAccountHref ? (
              <Link
                href={onboardingAccountHref}
                className="mt-2 inline-block rounded-lg bg-indigo-100 px-3 py-1.5 text-xs font-bold text-indigo-800 hover:bg-indigo-200"
              >
                Open Onboarding Checklist →
              </Link>
            ) : (
              <p className="mt-2 text-xs font-semibold text-slate-400">
                Couldn&apos;t match this to-do to an account — open it from the account&apos;s own page instead.
              </p>
            )
          ) : null}

          {editing ? (
            <div className="mt-2 space-y-2 rounded-xl border border-blue-200 bg-blue-50 p-3">
              {editError ? (
                <p className="text-xs font-semibold text-red-700">{editError}</p>
              ) : null}

              <div className="grid gap-2 sm:grid-cols-2">
                <div>
                  <label className="text-xs font-semibold text-slate-500" htmlFor={`edit-assigned-${todo.id}`}>
                    Assigned To
                  </label>
                  <select
                    id={`edit-assigned-${todo.id}`}
                    value={editDraft.assignedTo}
                    onChange={(event) => setEditDraft((d) => ({ ...d, assignedTo: event.target.value }))}
                    className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
                  >
                    <option value="">Select a manager...</option>
                    {managers.map((name) => (
                      <option key={name} value={name}>
                        {name}
                      </option>
                    ))}
                    {editDraft.assignedTo && !managers.includes(editDraft.assignedTo) ? (
                      <option value={editDraft.assignedTo}>{editDraft.assignedTo}</option>
                    ) : null}
                  </select>
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-500" htmlFor={`edit-type-${todo.id}`}>
                    Type
                  </label>
                  <select
                    id={`edit-type-${todo.id}`}
                    value={editDraft.taskType}
                    onChange={(event) => setEditDraft((d) => ({ ...d, taskType: event.target.value }))}
                    className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
                  >
                    {taskTypes.map((type) => (
                      <option key={type} value={type}>
                        {type}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-500" htmlFor={`edit-due-${todo.id}`}>
                    Due Date
                  </label>
                  <input
                    id={`edit-due-${todo.id}`}
                    type="date"
                    value={editDraft.dueDate}
                    onChange={(event) => setEditDraft((d) => ({ ...d, dueDate: event.target.value }))}
                    className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-500" htmlFor={`edit-status-${todo.id}`}>
                    Status
                  </label>
                  <select
                    id={`edit-status-${todo.id}`}
                    value={editDraft.status}
                    onChange={(event) => setEditDraft((d) => ({ ...d, status: event.target.value }))}
                    className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
                  >
                    {statuses.map((status) => (
                      <option key={status} value={status}>
                        {status}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex items-center gap-2 pt-5">
                  <input
                    type="checkbox"
                    id={`edit-sync-${todo.id}`}
                    checked={editDraft.syncToCalendar}
                    onChange={(event) => setEditDraft((d) => ({ ...d, syncToCalendar: event.target.checked }))}
                    className="h-4 w-4 rounded border-slate-300"
                  />
                  <label className="text-xs font-semibold text-slate-500" htmlFor={`edit-sync-${todo.id}`}>
                    Sync to Calendar
                  </label>
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-500" htmlFor={`edit-priority-${todo.id}`}>
                    Priority
                  </label>
                  <select
                    id={`edit-priority-${todo.id}`}
                    value={editDraft.priority}
                    onChange={(event) => setEditDraft((d) => ({ ...d, priority: event.target.value as ToDoPriority }))}
                    className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
                  >
                    {TO_DO_PRIORITIES.map((priority) => (
                      <option key={priority} value={priority}>
                        {priority}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={handleSaveEdit}
                  disabled={savingEdit}
                  className="rounded-xl bg-blue-700 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-800 disabled:opacity-60"
                >
                  {savingEdit ? "Saving..." : "Save Changes"}
                </button>
                <button
                  type="button"
                  onClick={handleCancelEdit}
                  disabled={savingEdit}
                  className="rounded-xl border border-slate-300 px-3 py-2 text-xs font-semibold hover:bg-slate-50 disabled:opacity-60"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <>
              <p className="mt-1 text-sm text-slate-600">
                Assigned to: <span className="font-semibold">{todo.assignedTo}</span>
              </p>

              {smsInfo?.hasLog ? (
                <SmsStatusBadge
                  entry={smsInfo.entry}
                  isStuck={smsInfo.isStuck}
                  resending={resending}
                  resendCoolingDown={resendCoolingDown}
                  resendError={resendError}
                  onResend={handleResendNotification}
                />
              ) : null}

              {todo.dueDate ? (
                <p className="text-sm text-slate-600">
                  Due: <span className="font-semibold">{todo.dueDate}</span>
                </p>
              ) : null}
            </>
          )}
        </div>

        <div className="no-print flex flex-wrap gap-2">
          {!editing ? (
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="rounded-xl border border-slate-300 px-3 py-2 text-xs font-semibold hover:bg-slate-50"
            >
              Edit
            </button>
          ) : null}

          {todo.status !== "In Progress" && todo.status !== "Done" ? (
            <button
              type="button"
              onClick={() => handleStatusChange("In Progress")}
              disabled={savingStatus}
              className="rounded-xl border border-slate-300 px-3 py-2 text-xs font-semibold hover:bg-slate-50 disabled:opacity-60"
            >
              In Progress
            </button>
          ) : null}

          {todo.status !== "Done" ? (
            <button
              type="button"
              onClick={() => {
                if (todo.taskType === "Visit") {
                  onRequestVisitCompletion(todo, notesDraft);
                } else {
                  handleStatusChange("Done");
                }
              }}
              disabled={savingStatus}
              className="rounded-xl bg-green-700 px-3 py-2 text-xs font-semibold text-white hover:bg-green-600 disabled:opacity-60"
            >
              Done
            </button>
          ) : null}
        </div>
      </div>

      <div className="mt-4 space-y-3 text-sm text-slate-700">
        <p>
          <span className="font-semibold">Why:</span> {todo.why}
        </p>

        <div>
          <label className="text-xs font-semibold text-slate-500" htmlFor={`notes-${todo.id}`}>
            Latest update
          </label>
          <div className="mt-1 flex gap-2">
            <input
              id={`notes-${todo.id}`}
              value={notesDraft}
              onChange={(event) => setNotesDraft(event.target.value)}
              placeholder="e.g. Left message, no answer"
              className="flex-1 rounded-xl border border-slate-300 px-3 py-2 text-sm"
            />
            <button
              type="button"
              onClick={() => handleStatusChange(todo.status)}
              disabled={savingStatus || notesDraft === todo.notes}
              className="no-print shrink-0 rounded-xl border border-slate-300 px-3 py-2 text-xs font-semibold hover:bg-slate-50 disabled:opacity-40"
            >
              {savingStatus ? "Saving..." : "Save"}
            </button>
          </div>
        </div>
      </div>

      <div className="mt-4 border-t border-slate-100 pt-3">
        <button
          type="button"
          onClick={() => setExpanded((current) => !current)}
          className="no-print text-xs font-semibold text-blue-700 hover:text-blue-900"
        >
          {expanded ? "▲ Hide details" : "▼ Details"}
        </button>

        {expanded ? (
          <div className="mt-3 space-y-2">
            <label className="text-xs font-semibold text-slate-500" htmlFor={`outcome-${todo.id}`}>
              Outcome / findings
            </label>
            <textarea
              id={`outcome-${todo.id}`}
              value={outcomeDraft}
              onChange={(event) => setOutcomeDraft(event.target.value)}
              rows={3}
              placeholder="What did the visit find? What was done?"
              className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
            />
            <button
              type="button"
              onClick={handleSaveOutcome}
              disabled={savingOutcome || outcomeDraft === (todo.outcome ?? "")}
              className="no-print rounded-xl border border-slate-300 px-3 py-2 text-xs font-semibold hover:bg-slate-50 disabled:opacity-40"
            >
              {savingOutcome ? "Saving..." : "Save outcome"}
            </button>

            <p className="pt-1 text-xs text-slate-500">
              Created: {todo.createdDate || "N/A"} &middot; ID: {todo.id || "N/A"}
            </p>
          </div>
        ) : (
          <p className="mt-2 text-xs text-slate-500">ID: {todo.id || "N/A"}</p>
        )}
      </div>
      </div>
    </article>
  );
}

export default function ToDoPage() {
  const [todos, setTodos] = useState<ToDo[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loadingAccounts, setLoadingAccounts] = useState(true);
  const [managers, setManagers] = useState<string[]>([]);
  const [loadingManagers, setLoadingManagers] = useState(true);
  // Name -> managerId, built from the same /api/admin/managers response
  // `managers` above is derived from — used only to resolve the "notify me
  // for my assignments" picker's choice to a stable id for OneSignal.login().
  const [managerIdByName, setManagerIdByName] = useState<Record<string, string>>({});
  // Which manager THIS BROWSER notifies as, for push. Not an auth concept —
  // there's no per-manager login in this app (one shared admin password),
  // so this is a self-declared identity, same pattern as sub-schedules'
  // cwAdminName. Starts blank and is hydrated from localStorage in an
  // effect below (not read directly in useState) to avoid an SSR/client
  // hydration mismatch, matching getStoredAdminName's usage in
  // app/sub-schedules/page.tsx.
  const [notifyAsName, setNotifyAsName] = useState("");
  const [form, setForm] = useState<ToDoForm>(emptyForm);
  const [selectedAccounts, setSelectedAccounts] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [search, setSearch] = useState("");
  const [assignedFilter, setAssignedFilter] = useState("All");
  const [statusFilter, setStatusFilter] = useState("Open");
  const [typeFilter, setTypeFilter] = useState("All");
  const [priorityFilter, setPriorityFilter] = useState("All");
  const [sortOrder, setSortOrder] = useState<"newest" | "oldest">("newest");

  // Bulk edit: select N existing to-dos (from whatever's currently
  // filtered/visible), then apply one shared partial update to all of them
  // via the updateToDos batch action.
  const [bulkEditMode, setBulkEditMode] = useState(false);
  const [selectedBulkEditIds, setSelectedBulkEditIds] = useState<Set<string>>(new Set());
  const [showBulkEditForm, setShowBulkEditForm] = useState(false);
  const [bulkEditForm, setBulkEditForm] = useState({ assignedTo: "", taskType: "", dueDate: "", status: "", syncToCalendar: "", priority: "" });
  const [bulkEditSaving, setBulkEditSaving] = useState(false);
  const [bulkEditError, setBulkEditError] = useState("");
  const [bulkEditSuccess, setBulkEditSuccess] = useState("");

  // Set when "Done" is clicked on a Visit to-do — holds the to-do plus the
  // notes draft that was in the box at that moment (see ToDoCard's
  // handleStatusChange comment on why notesDraft, not todo.notes). Opens
  // VisitCompletionModal instead of completing the to-do immediately.
  const [visitCompletionToDo, setVisitCompletionToDo] = useState<{
    todo: ToDo;
    notes: string;
  } | null>(null);

  // Print options modal + which off-screen print-only view (if any) is
  // currently mounted. printLayout drives an effect that calls
  // window.print() once the chosen view has committed to the DOM; the
  // 'afterprint' event (fires whether the user printed or cancelled) then
  // unmounts it again.
  const [printModalOpen, setPrintModalOpen] = useState(false);
  const [includeCompletedInPrint, setIncludeCompletedInPrint] = useState(false);
  const [printLayout, setPrintLayout] = useState<"taskSheet" | "byManager" | null>(null);

  // Deep-linking support: ?id=TODO-... (from an SMS notification link)
  // scrolls to and highlights that card. Read via window.location rather
  // than useSearchParams so this stays a plain effect with no Suspense
  // boundary requirement — this is a one-shot client-only affordance, not
  // something that needs to react to in-app navigation. Clears itself after
  // a few seconds (a flash, not a persistent state) and strips the param
  // from the URL so a later manual refresh doesn't re-trigger it. If the id
  // doesn't match any loaded to-do (deleted, invalid, or filtered out of
  // the current view), nothing happens — the list just renders normally.
  const [highlightId, setHighlightId] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const id = params.get("id");
    if (!id) return;

    setHighlightId(id);
    window.history.replaceState(null, "", window.location.pathname);

    const timer = setTimeout(() => setHighlightId(null), 6000);
    return () => clearTimeout(timer);
  }, []);

  // Low SMS quota banner — one check on page load (no polling), reading the
  // most recent SmsLog row that reported a quota. Dismissal is
  // sessionStorage-backed so it survives a reload within the same tab/
  // session but comes back on a genuinely new visit, rather than a plain
  // useState that would just re-show on every refresh.
  const [quotaWarning, setQuotaWarning] = useState<number | null>(null);
  const [quotaBannerDismissed, setQuotaBannerDismissed] = useState(false);

  useEffect(() => {
    setQuotaBannerDismissed(sessionStorage.getItem("smsQuotaBannerDismissed") === "true");

    fetch("/api/to-do/sms-quota", { cache: "no-store" })
      .then((response) => response.json())
      .then((data: { quotaRemaining: number | null; low: boolean }) => {
        if (data.low && data.quotaRemaining !== null) setQuotaWarning(data.quotaRemaining);
      })
      .catch(() => {
        // Silent — same "never worth blocking the page over" reasoning as
        // the per-card SMS status fetch.
      });
  }, []);

  function dismissQuotaBanner() {
    setQuotaBannerDismissed(true);
    sessionStorage.setItem("smsQuotaBannerDismissed", "true");
  }

  async function loadTodos() {
    setLoading(true);

    try {
      const response = await fetch("/api/to-do", { cache: "no-store" });

      const data = await response.json();
      setTodos(Array.isArray(data.todos) ? data.todos : []);
    } catch (error) {
      console.error("Failed to load to-dos:", error);
      setTodos([]);
    } finally {
      setLoading(false);
    }
  }

  async function loadAccounts() {
    setLoadingAccounts(true);

    try {
      const response = await fetch("/api/accounts");

      const data = await response.json();

      const loadedAccounts = Array.isArray(data.accounts)
        ? data.accounts
        : Array.isArray(data.data)
          ? data.data
          : [];

      setAccounts(loadedAccounts);
    } catch (error) {
      console.error("Failed to load accounts:", error);
      setAccounts([]);
    } finally {
      setLoadingAccounts(false);
    }
  }

  // Mirrors app/complaints/new/page.tsx's loadManagers(): missing/blank
  // status is treated as Active so a manager row that predates the Status
  // column (or was left blank by mistake) still shows up here rather than
  // silently disappearing from the dropdown.
  async function loadManagers() {
    setLoadingManagers(true);

    try {
      const response = await fetch("/api/admin/managers", {
        cache: "no-store",
      });

      const data = await response.json();
      const rows: Manager[] = Array.isArray(data)
        ? data
        : data.managers || data.data || [];

      const activeRows = rows.filter((row) => !row.status || row.status === "Active");

      const activeNames = Array.from(
        new Set(activeRows.map((row) => (row.name || "").trim()).filter(Boolean))
      ).sort();

      const idByName: Record<string, string> = {};
      for (const row of activeRows) {
        const name = (row.name || "").trim();
        const id = (row.managerId || "").trim();
        if (name && id) idByName[name] = id;
      }

      setManagers(activeNames);
      setManagerIdByName(idByName);
    } catch (error) {
      console.error("Failed to load managers:", error);
      setManagers([]);
      setManagerIdByName({});
    } finally {
      setLoadingManagers(false);
    }
  }

  // OneSignalInit.tsx's localStorage only remembers a managerId, not a
  // name (see identifyManager) — this reverse-resolves that id back to a
  // display name once the managers list has loaded, so the "notify me for
  // my assignments" picker shows the right selection without a second
  // stored value that could drift out of sync with managerIdByName.
  useEffect(() => {
    const storedId = getStoredManagerId();
    if (!storedId) return;

    const match = Object.entries(managerIdByName).find(([, id]) => id === storedId);
    if (match) setNotifyAsName(match[0]);
  }, [managerIdByName]);

  function handleNotifyAsChange(name: string) {
    setNotifyAsName(name);

    if (!name) return; // "Not set" — leaves any existing OneSignal identity as-is, just stops showing a selection here

    const managerId = managerIdByName[name];
    if (!managerId) return; // shouldn't happen (name came from this same map's keys), but never worth throwing over

    identifyManager(managerId); // fire-and-forget — never throws, logs its own failures
  }

  useEffect(() => {
    loadTodos();
    loadAccounts();
    loadManagers();
  }, []);

  const accountMultiOptions = useMemo<AccountMultiSelectOption[]>(() => {
    const seen = new Set<string>();
    const options: AccountMultiSelectOption[] = [];

    for (const account of accounts) {
      const name = getAccountName(account);
      if (!name || seen.has(name)) continue;
      seen.add(name);
      options.push({ name, status: account.status });
    }

    return options;
  }, [accounts]);

  const assignedOptions = useMemo(() => {
    const names = todos.map((todo) => todo.assignedTo).filter(Boolean);
    return ["All", ...Array.from(new Set(names)).sort()];
  }, [todos]);

  // Counts to-dos sharing a groupId (recurring multi-account batches) across
  // the full list, not just the currently filtered view, so the "Recurring
  // (N accounts)" badge stays accurate even when a filter hides siblings.
  const groupCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const todo of todos) {
      if (!todo.groupId) continue;
      counts.set(todo.groupId, (counts.get(todo.groupId) ?? 0) + 1);
    }
    return counts;
  }, [todos]);

  const filteredTodos = useMemo(() => {
    const normalizedSearch = search.toLowerCase().trim();

    return todos
      .filter((todo) => {
        if (statusFilter === "Open") {
          return todo.status !== "Done" && todo.status !== "Cancelled";
        }

        if (statusFilter !== "All") {
          return todo.status === statusFilter;
        }

        return true;
      })
      .filter((todo) => {
        if (assignedFilter === "All") return true;
        return todo.assignedTo === assignedFilter;
      })
      .filter((todo) => {
        if (typeFilter === "All") return true;
        return todo.taskType === typeFilter;
      })
      .filter((todo) => {
        if (priorityFilter === "All") return true;
        return (todo.priority ?? DEFAULT_TO_DO_PRIORITY) === priorityFilter;
      })
      .filter((todo) => {
        if (!normalizedSearch) return true;

        const text = [
          todo.id,
          todo.dueDate,
          todo.assignedTo,
          todo.accountName,
          todo.taskType,
          todo.why,
          todo.status,
          todo.notes,
        ]
          .join(" ")
          .toLowerCase();

        return text.includes(normalizedSearch);
      })
      .sort((a, b) => {
        // A missing createdDate (in practice: never happens — see
        // appendToDo/appendToDos, which always stamp it server-side) sorts
        // toward the end in "newest" mode and toward the start in "oldest"
        // mode, since it's treated as time zero either way.
        const aTime = a.createdDate ? new Date(a.createdDate).getTime() : 0;
        const bTime = b.createdDate ? new Date(b.createdDate).getTime() : 0;

        return sortOrder === "newest" ? bTime - aTime : aTime - bTime;
      });
  }, [todos, search, assignedFilter, statusFilter, typeFilter, priorityFilter, sortOrder]);

  // What actually gets printed: whatever's currently filtered on screen
  // (filteredTodos already reflects the active status/assigned/type/priority
  // filters), minus Done tasks unless "Include completed" is checked in the
  // print modal.
  const printTodos = useMemo(() => {
    return includeCompletedInPrint
      ? filteredTodos
      : filteredTodos.filter((todo) => todo.status !== "Done");
  }, [filteredTodos, includeCompletedInPrint]);

  const openCount = todos.filter(
    (todo) => todo.status !== "Done" && todo.status !== "Cancelled"
  ).length;

  const overdueCount = todos.filter(isOverdue).length;
  const doneCount = todos.filter((todo) => todo.status === "Done").length;

  // One to-do per selected account, written as a SINGLE batched request —
  // not one addToDo call per account. Firing N concurrent requests each
  // doing their own Sheets append used to lose rows: concurrent appends to
  // the same range race on "what's the next empty row", so near-simultaneous
  // calls can land on the same row and silently overwrite each other, each
  // still reporting success to its own caller. Routing every submission
  // (one account or many) through the same bulk endpoint keeps this as one
  // code path instead of two.
  async function submitToDos(accountNames: string[], groupId?: string) {
    // Resolved in parallel with accountNames (same index = same to-do) —
    // lets a "New Account Onboarding" to-do's card link straight to that
    // account's onboarding checklist instead of guessing from its name.
    // Blank when a name doesn't match any loaded account (e.g. the
    // account-optional "Reminder" type's blank entry).
    const accountIds = accountNames.map((name) => {
      const match = accounts.find((account) => getAccountName(account) === name);
      return match ? getAccountId(match) : "";
    });

    const response = await fetch("/api/to-do", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        action: "addToDos",
        ...form,
        accountNames,
        accountIds,
        groupId,
      }),
    });

    const data = await response.json();

    if (!data.success) {
      throw new Error(data.message || "Could not add to-do(s).");
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!form.assignedTo.trim()) {
      alert("Assigned To is required.");
      return;
    }

    if (selectedAccounts.length === 0 && form.taskType !== ACCOUNT_OPTIONAL_TASK_TYPE) {
      alert("Select at least one account.");
      return;
    }

    if (!form.why.trim()) {
      alert("Why is required.");
      return;
    }

    setSaving(true);

    // Only stamp a groupId when there's actually something to group —
    // a single-account submission (multiple accounts allowed but only
    // one picked) doesn't need one.
    const groupId =
      selectedAccounts.length > 1 ? crypto.randomUUID() : undefined;

    // A Reminder with no account picked still writes one row — just
    // with a blank ACCOUNT column — so this stays the same single batched
    // code path as every other submission instead of branching into a
    // separate "no account" request.
    const accountNames = selectedAccounts.length > 0 ? selectedAccounts : [""];

    try {
      await submitToDos(accountNames, groupId);
      await loadTodos();
      setForm(emptyForm);
      setSelectedAccounts([]);
    } catch (error) {
      console.error("Failed to add to-do(s):", error);
      alert(
        error instanceof Error
          ? error.message
          : "Could not add to-do(s). Nothing was saved — fix and resubmit."
      );
    } finally {
      setSaving(false);
    }
  }

  async function updateStatus(toDoId: string, status: string, notes: string) {
    try {
      const response = await fetch("/api/to-do", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "updateToDoStatus",
          toDoId,
          status,
          notes,
        }),
      });

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.message || "Could not update to-do.");
      }

      await loadTodos();
    } catch (error) {
      console.error("Failed to update to-do:", error);
      alert("Could not update to-do.");
    }
  }

  async function updateOutcome(toDoId: string, outcome: string) {
    try {
      const response = await fetch("/api/to-do", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "updateToDoOutcome",
          toDoId,
          outcome,
        }),
      });

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.message || "Could not save outcome.");
      }

      await loadTodos();
    } catch (error) {
      console.error("Failed to save outcome:", error);
      alert("Could not save outcome.");
    }
  }

  // Unlike updateStatus/updateOutcome above, errors here are re-thrown
  // rather than alert()'d — ToDoCard's edit panel shows them inline next
  // to the fields being edited instead.
  async function editToDo(toDoId: string, updates: ToDoEditFields) {
    const response = await fetch("/api/to-do", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        action: "updateToDo",
        toDoId,
        ...updates,
      }),
    });

    const data = await response.json();

    if (!data.success) {
      throw new Error(data.message || "Could not save changes.");
    }

    await loadTodos();
  }

  function requestVisitCompletion(todo: ToDo, notes: string) {
    setVisitCompletionToDo({ todo, notes });
  }

  // Rejects (without clearing visitCompletionToDo) on failure so the modal
  // stays open with its inline error — see VisitCompletionModal's
  // onSaveAndComplete contract.
  async function saveVisitAndComplete(payload: VisitFromToDoPayload) {
    if (!visitCompletionToDo) return;

    const response = await fetch("/api/visits", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const data = await response.json();

    if (!data.success) {
      throw new Error(data.error || data.message || "Could not save the visit.");
    }

    await updateStatus(visitCompletionToDo.todo.id, "Done", payload.notes);
    setVisitCompletionToDo(null);
  }

  async function skipVisitAndComplete() {
    if (!visitCompletionToDo) return;

    await updateStatus(
      visitCompletionToDo.todo.id,
      "Done",
      visitCompletionToDo.notes
    );
    setVisitCompletionToDo(null);
  }

  function openPrintModal() {
    setPrintModalOpen(true);
  }

  function closePrintModal() {
    setPrintModalOpen(false);
  }

  function choosePrintLayout(layout: "taskSheet" | "byManager") {
    setPrintModalOpen(false);
    setPrintLayout(layout);
  }

  // Fires once the chosen print-only view has committed to the DOM (this
  // effect runs after that render), so window.print() always sees the
  // finished layout instead of a stale/empty one.
  useEffect(() => {
    if (!printLayout) return;
    window.print();
  }, [printLayout]);

  // 'afterprint' fires once the print dialog closes, whether the user
  // printed or cancelled — either way, unmount the print-only view so it's
  // not left sitting in the DOM.
  useEffect(() => {
    function handleAfterPrint() {
      setPrintLayout(null);
    }
    window.addEventListener("afterprint", handleAfterPrint);
    return () => window.removeEventListener("afterprint", handleAfterPrint);
  }, []);

  function toggleBulkEditMode() {
    setBulkEditMode((current) => !current);
    setSelectedBulkEditIds(new Set());
    setShowBulkEditForm(false);
    setBulkEditError("");
    setBulkEditSuccess("");
    setBulkEditForm({ assignedTo: "", taskType: "", dueDate: "", status: "", syncToCalendar: "", priority: "" });
  }

  function toggleBulkEditSelected(toDoId: string) {
    setSelectedBulkEditIds((current) => {
      const next = new Set(current);
      if (next.has(toDoId)) next.delete(toDoId);
      else next.add(toDoId);
      return next;
    });
  }

  async function submitBulkEdit() {
    setBulkEditError("");
    setBulkEditSuccess("");

    const fields: Record<string, string | boolean> = {};
    if (bulkEditForm.assignedTo) fields.assignedTo = bulkEditForm.assignedTo;
    if (bulkEditForm.taskType) fields.taskType = bulkEditForm.taskType;
    if (bulkEditForm.dueDate) fields.dueDate = bulkEditForm.dueDate;
    if (bulkEditForm.status) fields.status = bulkEditForm.status;
    if (bulkEditForm.syncToCalendar !== "") fields.syncToCalendar = bulkEditForm.syncToCalendar === "true";
    if (bulkEditForm.priority) fields.priority = bulkEditForm.priority;

    if (Object.keys(fields).length === 0) {
      setBulkEditError("Fill in at least one field to apply.");
      return;
    }
    if (selectedBulkEditIds.size === 0) {
      setBulkEditError("Select at least one to-do.");
      return;
    }

    setBulkEditSaving(true);
    try {
      const response = await fetch("/api/to-do", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "updateToDos",
          toDoIds: Array.from(selectedBulkEditIds),
          ...fields,
        }),
      });

      const data = await response.json();
      if (!data.success) {
        throw new Error(data.message || "Could not update to-dos.");
      }

      setBulkEditSuccess(
        `Updated ${data.updated ?? selectedBulkEditIds.size} to-do${
          (data.updated ?? selectedBulkEditIds.size) === 1 ? "" : "s"
        }${data.calendarSyncFailed ? " (Calendar sync failed for at least one — check for the warning badge)" : ""}.`
      );
      setShowBulkEditForm(false);
      setBulkEditMode(false);
      setSelectedBulkEditIds(new Set());
      setBulkEditForm({ assignedTo: "", taskType: "", dueDate: "", status: "", syncToCalendar: "", priority: "" });
      await loadTodos();
    } catch (err) {
      setBulkEditError(err instanceof Error ? err.message : "Could not update to-dos.");
    } finally {
      setBulkEditSaving(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-50 p-4 text-slate-900 md:p-8">
      <style jsx global>{`
        .todo-print-view {
          display: none;
        }

        @media print {
          /* Same opt-in contract as .account-packet-print-view in
             globals.css: that shared rule hides everything in <body> and
             re-shows only a page's own "-print-view" container. This plugs
             the to-do page into that contract without touching the shared
             rule itself. */
          .todo-print-view,
          .todo-print-view * {
            visibility: visible;
          }

          .todo-print-view {
            display: block;
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            background: #fff;
            color: #000;
            padding: 24px;
          }

          .todo-print-row {
            break-inside: avoid;
          }

          /* visibility: hidden (the shared globals.css rule this page opts
             into) hides content but doesn't collapse its layout height —
             left alone, the full interactive page (list, form, filters)
             still occupies its normal height off-screen, and the print
             engine paginates for that phantom height, producing blank
             pages after the real .todo-print-view content. Collapsing it
             with display: none removes it from the layout entirely. */
          .todo-page-content {
            display: none !important;
          }
        }
      `}</style>

      <div className="todo-page-content mx-auto max-w-7xl space-y-6">
        {quotaWarning !== null && !quotaBannerDismissed ? (
          <div className="no-print flex items-center justify-between gap-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800">
            <span>
              SMS quota low ({quotaWarning} left) — refill at Textbelt to keep notifications working.
            </span>
            <button
              type="button"
              onClick={dismissQuotaBanner}
              className="shrink-0 text-xs font-semibold text-amber-700 hover:underline"
            >
              Dismiss
            </button>
          </div>
        ) : null}

        <div className="no-print flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2">
          <label htmlFor="notify-as-select" className="text-sm font-semibold text-slate-600">
            🔔 Notify me (push) for assignments to:
          </label>
          <select
            id="notify-as-select"
            value={notifyAsName}
            onChange={(event) => handleNotifyAsChange(event.target.value)}
            className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
          >
            <option value="">Not set</option>
            {managers.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </div>

        <div className="no-print flex flex-wrap justify-end gap-2">
          <a
            href="https://calendar.google.com/calendar/r?cid=cleaningworldoperations%40gmail.com"
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            Open Google Calendar
          </a>

          <button
            type="button"
            onClick={toggleBulkEditMode}
            className={`w-full rounded-xl px-5 py-3 text-sm font-semibold text-white md:w-auto ${
              bulkEditMode ? "bg-amber-600 hover:bg-amber-700" : "bg-indigo-700 hover:bg-indigo-800"
            }`}
          >
            {bulkEditMode ? "Cancel Selection" : "Bulk Edit To-Dos"}
          </button>

          <button
            type="button"
            onClick={openPrintModal}
            className="w-full rounded-xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white hover:bg-slate-700 md:w-auto"
          >
            Print Assigned Tasks
          </button>
        </div>

        {bulkEditSuccess ? (
          <div className="no-print rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm font-semibold text-emerald-800">
            {bulkEditSuccess}
          </div>
        ) : null}

        {bulkEditMode ? (
          <div className="no-print flex flex-col gap-3 rounded-2xl border border-indigo-200 bg-indigo-50 p-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm font-bold text-indigo-900">
              {selectedBulkEditIds.size} to-do{selectedBulkEditIds.size === 1 ? "" : "s"} selected.
              Check the boxes on the to-dos below (filter first to narrow them down), then apply a
              shared update to all of them at once.
            </p>
            <button
              type="button"
              onClick={() => setShowBulkEditForm(true)}
              disabled={selectedBulkEditIds.size === 0}
              className="shrink-0 rounded-2xl bg-indigo-700 px-5 py-3 text-sm font-black text-white shadow-sm hover:bg-indigo-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Bulk Edit Selected ({selectedBulkEditIds.size})
            </button>
          </div>
        ) : null}

        {showBulkEditForm ? (
          <div className="no-print rounded-2xl border border-indigo-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-black text-slate-950">
              Bulk Edit {selectedBulkEditIds.size} To-Do{selectedBulkEditIds.size === 1 ? "" : "s"}
            </h2>
            <p className="mt-1 text-xs font-semibold text-slate-500">
              Only fields you fill in below are applied — leave a field blank (or
              &quot;Leave unchanged&quot;) to keep each to-do&apos;s existing value.
              Calendar events sync automatically per to-do if a change affects eligibility
              (due date, assignment, or Sync to Calendar).
            </p>

            {bulkEditError ? (
              <div className="mt-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-800">
                {bulkEditError}
              </div>
            ) : null}

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div>
                <label className="text-xs font-semibold text-slate-500" htmlFor="bulk-edit-assigned-to">
                  Assigned To
                </label>
                <select
                  id="bulk-edit-assigned-to"
                  value={bulkEditForm.assignedTo}
                  onChange={(e) => setBulkEditForm((f) => ({ ...f, assignedTo: e.target.value }))}
                  className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
                >
                  <option value="">Leave unchanged</option>
                  {managers.map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-500" htmlFor="bulk-edit-type">
                  Type
                </label>
                <select
                  id="bulk-edit-type"
                  value={bulkEditForm.taskType}
                  onChange={(e) => setBulkEditForm((f) => ({ ...f, taskType: e.target.value }))}
                  className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
                >
                  <option value="">Leave unchanged</option>
                  {taskTypes.map((type) => (
                    <option key={type} value={type}>
                      {type}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-500" htmlFor="bulk-edit-due-date">
                  Due Date
                </label>
                <input
                  id="bulk-edit-due-date"
                  type="date"
                  value={bulkEditForm.dueDate}
                  onChange={(e) => setBulkEditForm((f) => ({ ...f, dueDate: e.target.value }))}
                  className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-500" htmlFor="bulk-edit-status">
                  Status
                </label>
                <select
                  id="bulk-edit-status"
                  value={bulkEditForm.status}
                  onChange={(e) => setBulkEditForm((f) => ({ ...f, status: e.target.value }))}
                  className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
                >
                  <option value="">Leave unchanged</option>
                  {statuses.map((status) => (
                    <option key={status} value={status}>
                      {status}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-500" htmlFor="bulk-edit-sync">
                  Sync to Calendar
                </label>
                <select
                  id="bulk-edit-sync"
                  value={bulkEditForm.syncToCalendar}
                  onChange={(e) => setBulkEditForm((f) => ({ ...f, syncToCalendar: e.target.value }))}
                  className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
                >
                  <option value="">Leave unchanged</option>
                  <option value="true">Sync to Calendar</option>
                  <option value="false">Don&apos;t sync to Calendar</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-500" htmlFor="bulk-edit-priority">
                  Priority
                </label>
                <select
                  id="bulk-edit-priority"
                  value={bulkEditForm.priority}
                  onChange={(e) => setBulkEditForm((f) => ({ ...f, priority: e.target.value }))}
                  className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
                >
                  <option value="">Leave unchanged</option>
                  {TO_DO_PRIORITIES.map((priority) => (
                    <option key={priority} value={priority}>
                      {priority}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={submitBulkEdit}
                disabled={bulkEditSaving}
                className="rounded-2xl bg-indigo-700 px-5 py-3 text-sm font-black text-white shadow-sm hover:bg-indigo-800 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {bulkEditSaving ? "Applying..." : `Apply to ${selectedBulkEditIds.size} To-Do${selectedBulkEditIds.size === 1 ? "" : "s"}`}
              </button>
              <button
                type="button"
                onClick={() => setShowBulkEditForm(false)}
                disabled={bulkEditSaving}
                className="rounded-2xl border border-slate-300 px-5 py-3 text-sm font-black text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : null}

        <section className="grid gap-4 md:grid-cols-3">
          <div className="rounded-2xl bg-white p-5 shadow-sm">
            <p className="text-sm text-slate-500">Open</p>
            <p className="mt-2 text-3xl font-bold">{openCount}</p>
          </div>

          <div className="rounded-2xl bg-white p-5 shadow-sm">
            <p className="text-sm text-slate-500">Overdue</p>
            <p className="mt-2 text-3xl font-bold">{overdueCount}</p>
          </div>

          <div className="rounded-2xl bg-white p-5 shadow-sm">
            <p className="text-sm text-slate-500">Done</p>
            <p className="mt-2 text-3xl font-bold">{doneCount}</p>
          </div>
        </section>

        <section className="no-print rounded-2xl bg-white p-5 shadow-sm">
          <h2 className="text-lg font-bold">New To-Do</h2>

          <form
            onSubmit={handleSubmit}
            className="mt-4 grid gap-4 md:grid-cols-2"
          >
            <div>
              <label className="text-sm font-semibold">Due Date</label>
              <input
                type="date"
                value={form.dueDate}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    dueDate: event.target.value,
                  }))
                }
                className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
              />
            </div>

            <div>
              <label className="text-sm font-semibold">Assigned To</label>
              <select
                value={form.assignedTo}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    assignedTo: event.target.value,
                  }))
                }
                disabled={loadingManagers}
                className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm disabled:opacity-60"
              >
                <option value="">
                  {loadingManagers ? "Loading managers..." : "Select manager"}
                </option>
                {managers.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </div>

            <div className="md:col-span-2">
              <label className="text-sm font-semibold">
                {form.taskType === "Visit"
                  ? "Accounts"
                  : form.taskType === ACCOUNT_OPTIONAL_TASK_TYPE
                    ? "Account (optional)"
                    : "Account"}
              </label>

              <div className="mt-1">
                <AccountMultiSelect
                  accounts={accountMultiOptions}
                  selected={selectedAccounts}
                  onChange={setSelectedAccounts}
                  singleSelect={form.taskType !== "Visit"}
                  loading={loadingAccounts}
                  placeholder={
                    form.taskType === "Visit"
                      ? "Select accounts"
                      : form.taskType === ACCOUNT_OPTIONAL_TASK_TYPE
                        ? "Select account (optional)"
                        : "Select account"
                  }
                />
              </div>
            </div>

            <div>
              <label className="text-sm font-semibold">Task Type</label>
              <select
                value={form.taskType}
                onChange={(event) => {
                  const nextTaskType = event.target.value;
                  setForm((current) => ({
                    ...current,
                    taskType: nextTaskType,
                  }));
                  if (nextTaskType !== "Visit") {
                    // Dropping out of Visit: keep only the first pick
                    // rather than silently discarding the whole selection.
                    setSelectedAccounts((current) => current.slice(0, 1));
                  }
                }}
                className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
              >
                {taskTypes.map((taskType) => (
                  <option key={taskType}>{taskType}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-sm font-semibold">Priority</label>
              <select
                value={form.priority}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    priority: event.target.value as ToDoPriority,
                  }))
                }
                className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
              >
                {TO_DO_PRIORITIES.map((priority) => (
                  <option key={priority} value={priority}>
                    {priority}
                  </option>
                ))}
              </select>
            </div>

            <div className="md:col-span-2">
              <label className="text-sm font-semibold">Why</label>
              <input
                value={form.why}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    why: event.target.value,
                  }))
                }
                placeholder="Example: Customer said restrooms need attention"
                className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
              />
            </div>

            <div className="md:col-span-2">
              <label className="text-sm font-semibold">Notes</label>
              <textarea
                value={form.notes}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    notes: event.target.value,
                  }))
                }
                placeholder="Extra instructions"
                rows={3}
                className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
              />
            </div>

            <div className="md:col-span-2 flex items-center gap-2">
              <input
                type="checkbox"
                id="sync-to-calendar"
                checked={form.syncToCalendar}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    syncToCalendar: event.target.checked,
                  }))
                }
                className="h-4 w-4 rounded border-slate-300"
              />
              <label htmlFor="sync-to-calendar" className="text-sm font-semibold">
                Sync to Calendar
              </label>
            </div>

            <div className="md:col-span-2">
              <button
                type="submit"
                disabled={saving}
                className="rounded-xl bg-blue-700 px-5 py-3 text-sm font-semibold text-white hover:bg-blue-600 disabled:opacity-60"
              >
                {saving ? "Saving..." : "Add To-Do"}
              </button>
            </div>
          </form>
        </section>

        <section className="no-print rounded-2xl bg-white p-5 shadow-sm">
          <div className="grid gap-3 md:grid-cols-6">
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search..."
              className="rounded-xl border border-slate-300 px-3 py-2 text-sm"
            />

            <select
              value={assignedFilter}
              onChange={(event) => setAssignedFilter(event.target.value)}
              className="rounded-xl border border-slate-300 px-3 py-2 text-sm"
            >
              {assignedOptions.map((name) => (
                <option key={name}>{name}</option>
              ))}
            </select>

            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
              className="rounded-xl border border-slate-300 px-3 py-2 text-sm"
            >
              <option>Open</option>
              <option>All</option>
              {statuses.map((status) => (
                <option key={status}>{status}</option>
              ))}
            </select>

            <select
              value={typeFilter}
              onChange={(event) => setTypeFilter(event.target.value)}
              className="rounded-xl border border-slate-300 px-3 py-2 text-sm"
            >
              <option>All</option>
              {taskTypes.map((taskType) => (
                <option key={taskType}>{taskType}</option>
              ))}
            </select>

            <select
              value={priorityFilter}
              onChange={(event) => setPriorityFilter(event.target.value)}
              className="rounded-xl border border-slate-300 px-3 py-2 text-sm"
            >
              <option>All</option>
              {TO_DO_PRIORITIES.map((priority) => (
                <option key={priority}>{priority}</option>
              ))}
            </select>

            <select
              value={sortOrder}
              onChange={(event) => setSortOrder(event.target.value as "newest" | "oldest")}
              className="rounded-xl border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="newest">Newest first</option>
              <option value="oldest">Oldest first</option>
            </select>
          </div>
        </section>

        <section className="space-y-3">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-xl font-bold">
                Visible To-Dos ({filteredTodos.length})
              </h2>
              <p className="text-sm text-slate-500">
                Printed: {new Date().toLocaleDateString()}
              </p>
            </div>

            <button
              type="button"
              onClick={openPrintModal}
              className="no-print rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700"
            >
              Print This List
            </button>
          </div>

          {loading ? (
            <div className="rounded-2xl bg-white p-6 text-sm text-slate-600 shadow-sm">
              Loading...
            </div>
          ) : filteredTodos.length === 0 ? (
            <div className="rounded-2xl bg-white p-6 text-sm text-slate-600 shadow-sm">
              No to-dos found.
            </div>
          ) : (
            filteredTodos.map((todo) => (
              <ToDoCard
                key={todo.id}
                todo={todo}
                recurringCount={todo.groupId ? groupCounts.get(todo.groupId) ?? 0 : 0}
                managers={managers}
                onUpdateStatus={updateStatus}
                onSaveOutcome={updateOutcome}
                onEditToDo={editToDo}
                onRequestVisitCompletion={requestVisitCompletion}
                bulkEditMode={bulkEditMode}
                bulkSelected={selectedBulkEditIds.has(todo.id)}
                onToggleBulkSelected={toggleBulkEditSelected}
                highlighted={todo.id === highlightId}
                onboardingAccountHref={getOnboardingAccountHref(todo, accounts)}
              />
            ))
          )}
        </section>
      </div>

      {visitCompletionToDo ? (
        <VisitCompletionModal
          todo={visitCompletionToDo.todo}
          initialNotes={visitCompletionToDo.notes}
          accounts={accountMultiOptions}
          loadingAccounts={loadingAccounts}
          onSaveAndComplete={saveVisitAndComplete}
          onSkip={skipVisitAndComplete}
        />
      ) : null}

      {printModalOpen ? (
        <div className="no-print fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
          <div className="w-full max-w-md rounded-3xl bg-white p-5 shadow-2xl sm:p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.2em] text-blue-700">
                  Print To-Dos
                </p>
                <h2 className="mt-2 text-2xl font-black text-slate-950">Choose a layout</h2>
              </div>

              <button
                type="button"
                onClick={closePrintModal}
                className="rounded-full bg-slate-100 px-3 py-2 text-sm font-black text-slate-600 hover:bg-slate-200"
              >
                X
              </button>
            </div>

            <p className="mt-4 text-sm font-semibold text-slate-500">
              Prints whatever&apos;s currently filtered ({filteredTodos.length} visible).
            </p>

            <label className="mt-3 flex items-center gap-2 text-sm font-semibold text-slate-600">
              <input
                type="checkbox"
                checked={includeCompletedInPrint}
                onChange={(event) => setIncludeCompletedInPrint(event.target.checked)}
                className="h-4 w-4 rounded border-slate-300"
              />
              Include completed tasks
            </label>

            <div className="mt-5 grid gap-3">
              <button
                type="button"
                onClick={() => choosePrintLayout("taskSheet")}
                className="rounded-2xl border border-slate-200 bg-white px-5 py-4 text-left shadow-sm hover:bg-slate-50"
              >
                <p className="text-sm font-black text-slate-950">Task Sheet</p>
                <p className="mt-1 text-xs font-semibold text-slate-500">
                  Flat checklist sorted by due date, with a checkbox next to each task. Hand it
                  out or check off by hand.
                </p>
              </button>

              <button
                type="button"
                onClick={() => choosePrintLayout("byManager")}
                className="rounded-2xl border border-slate-200 bg-white px-5 py-4 text-left shadow-sm hover:bg-slate-50"
              >
                <p className="text-sm font-black text-slate-950">By Manager</p>
                <p className="mt-1 text-xs font-semibold text-slate-500">
                  Grouped by assignee with a task count per manager — a review view, no
                  checkboxes.
                </p>
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {printLayout === "taskSheet" ? <PrintTaskSheet todos={printTodos} /> : null}
      {printLayout === "byManager" ? <PrintByManager todos={printTodos} /> : null}
    </main>
  );
}
