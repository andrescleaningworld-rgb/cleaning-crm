"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import AccountMultiSelect, {
  type AccountMultiSelectOption,
} from "@/app/components/AccountMultiSelect";

type ToDo = {
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
};

type Account = {
  name?: string;
  accountName?: string;
  status?: string;
};

type Manager = {
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
};

const emptyForm: ToDoForm = {
  dueDate: "",
  assignedTo: "",
  taskType: "Visit",
  why: "",
  status: "Open",
  notes: "",
};

const taskTypes = [
  "Visit",
  "Complaint Follow-Up",
  "Account Follow-Up",
  "New Account Onboarding",
  "Customer Call",
  "Subcontractor Follow-Up",
  "Other",
];

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

function isOverdue(todo: ToDo) {
  if (!todo.dueDate) return false;
  if (todo.status === "Done" || todo.status === "Cancelled") return false;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const dueDate = new Date(todo.dueDate);
  dueDate.setHours(0, 0, 0, 0);

  return dueDate < today;
}

type ToDoCardProps = {
  todo: ToDo;
  recurringCount: number;
  onUpdateStatus: (toDoId: string, status: string, notes: string) => Promise<void>;
  onSaveOutcome: (toDoId: string, outcome: string) => Promise<void>;
};

// Status-change buttons and the "Latest update" Save button all funnel
// through onUpdateStatus with the currently-typed notesDraft (not just
// todo.notes) — clicking "Done" with an unsaved note in the box still
// persists that note instead of silently dropping it.
function ToDoCard({ todo, recurringCount, onUpdateStatus, onSaveOutcome }: ToDoCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [notesDraft, setNotesDraft] = useState(todo.notes);
  const [outcomeDraft, setOutcomeDraft] = useState(todo.outcome ?? "");
  const [savingStatus, setSavingStatus] = useState(false);
  const [savingOutcome, setSavingOutcome] = useState(false);

  useEffect(() => {
    setNotesDraft(todo.notes);
  }, [todo.notes]);

  useEffect(() => {
    setOutcomeDraft(todo.outcome ?? "");
  }, [todo.outcome]);

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

  return (
    <article className="print-card rounded-2xl bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <div className="flex flex-wrap gap-2">
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
              {todo.taskType || "Task"}
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
          </div>

          <h3 className="mt-3 text-lg font-bold">{todo.accountName}</h3>

          <p className="mt-1 text-sm text-slate-600">
            Assigned to: <span className="font-semibold">{todo.assignedTo}</span>
          </p>

          {todo.dueDate ? (
            <p className="text-sm text-slate-600">
              Due: <span className="font-semibold">{todo.dueDate}</span>
            </p>
          ) : null}
        </div>

        <div className="no-print flex flex-wrap gap-2">
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
              onClick={() => handleStatusChange("Done")}
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
    </article>
  );
}

export default function ToDoPage() {
  const [todos, setTodos] = useState<ToDo[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loadingAccounts, setLoadingAccounts] = useState(true);
  const [managers, setManagers] = useState<string[]>([]);
  const [loadingManagers, setLoadingManagers] = useState(true);
  const [form, setForm] = useState<ToDoForm>(emptyForm);
  const [selectedAccounts, setSelectedAccounts] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [search, setSearch] = useState("");
  const [assignedFilter, setAssignedFilter] = useState("All");
  const [statusFilter, setStatusFilter] = useState("Open");
  const [typeFilter, setTypeFilter] = useState("All");

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

      const activeNames = Array.from(
        new Set(
          rows
            .filter((row) => !row.status || row.status === "Active")
            .map((row) => (row.name || "").trim())
            .filter(Boolean)
        )
      ).sort();

      setManagers(activeNames);
    } catch (error) {
      console.error("Failed to load managers:", error);
      setManagers([]);
    } finally {
      setLoadingManagers(false);
    }
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
        // Newest created first; items missing a createdDate sort last.
        const aTime = a.createdDate ? new Date(a.createdDate).getTime() : 0;
        const bTime = b.createdDate ? new Date(b.createdDate).getTime() : 0;

        return bTime - aTime;
      });
  }, [todos, search, assignedFilter, statusFilter, typeFilter]);

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
    const response = await fetch("/api/to-do", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        action: "addToDos",
        ...form,
        accountNames,
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

    if (selectedAccounts.length === 0) {
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

    try {
      await submitToDos(selectedAccounts, groupId);
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

  return (
    <main className="min-h-screen bg-slate-50 p-4 text-slate-900 md:p-8">
      <style jsx global>{`
        @media print {
          .no-print {
            display: none !important;
          }

          .print-header {
            display: block !important;
          }

          main {
            background: white !important;
            padding: 0 !important;
          }

          .print-card {
            break-inside: avoid;
            border: 1px solid #ddd !important;
            box-shadow: none !important;
          }
        }
      `}</style>

      <div className="mx-auto max-w-7xl space-y-6">
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => window.print()}
            className="no-print w-full rounded-xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white hover:bg-slate-700 md:w-auto"
          >
            Print Assigned Tasks
          </button>
        </div>

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
                {form.taskType === "Visit" ? "Accounts" : "Account"}
              </label>

              <div className="mt-1">
                <AccountMultiSelect
                  accounts={accountMultiOptions}
                  selected={selectedAccounts}
                  onChange={setSelectedAccounts}
                  singleSelect={form.taskType !== "Visit"}
                  loading={loadingAccounts}
                  placeholder={
                    form.taskType === "Visit" ? "Select accounts" : "Select account"
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
          <div className="grid gap-3 md:grid-cols-4">
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
              onClick={() => window.print()}
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
                onUpdateStatus={updateStatus}
                onSaveOutcome={updateOutcome}
              />
            ))
          )}
        </section>
      </div>
    </main>
  );
}
