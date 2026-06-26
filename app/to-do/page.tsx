"use client";

import Image from "next/image";
import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";

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
};

type Account = {
  name?: string;
  accountName?: string;
};

type ToDoForm = {
  dueDate: string;
  assignedTo: string;
  accountName: string;
  taskType: string;
  why: string;
  status: string;
  notes: string;
};

const emptyForm: ToDoForm = {
  dueDate: "",
  assignedTo: "",
  accountName: "",
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

function isOverdue(todo: ToDo) {
  if (!todo.dueDate) return false;
  if (todo.status === "Done" || todo.status === "Cancelled") return false;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const dueDate = new Date(todo.dueDate);
  dueDate.setHours(0, 0, 0, 0);

  return dueDate < today;
}

export default function ToDoPage() {
  const [todos, setTodos] = useState<ToDo[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [form, setForm] = useState<ToDoForm>(emptyForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [search, setSearch] = useState("");
  const [assignedFilter, setAssignedFilter] = useState("All");
  const [statusFilter, setStatusFilter] = useState("Open");
  const [typeFilter, setTypeFilter] = useState("All");

  async function loadTodos() {
    setLoading(true);

    try {
      const response = await fetch("/api/to-do");

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
    }
  }

  useEffect(() => {
    loadTodos();
    loadAccounts();
  }, []);

  const accountOptions = useMemo(() => {
    const names = accounts.map(getAccountName).filter(Boolean);
    return Array.from(new Set(names)).sort();
  }, [accounts]);

  const assignedOptions = useMemo(() => {
    const names = todos.map((todo) => todo.assignedTo).filter(Boolean);
    return ["All", ...Array.from(new Set(names)).sort()];
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
        const aTime = a.dueDate
          ? new Date(a.dueDate).getTime()
          : Number.MAX_SAFE_INTEGER;

        const bTime = b.dueDate
          ? new Date(b.dueDate).getTime()
          : Number.MAX_SAFE_INTEGER;

        return aTime - bTime;
      });
  }, [todos, search, assignedFilter, statusFilter, typeFilter]);

  const openCount = todos.filter(
    (todo) => todo.status !== "Done" && todo.status !== "Cancelled"
  ).length;

  const overdueCount = todos.filter(isOverdue).length;
  const doneCount = todos.filter((todo) => todo.status === "Done").length;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!form.assignedTo.trim()) {
      alert("Assigned To is required.");
      return;
    }

    if (!form.accountName.trim()) {
      alert("Account is required.");
      return;
    }

    if (!form.why.trim()) {
      alert("Why is required.");
      return;
    }

    setSaving(true);

    try {
      const response = await fetch("/api/to-do", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "addToDo",
          ...form,
        }),
      });

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.message || "Could not add to-do.");
      }

      setForm(emptyForm);
      await loadTodos();
    } catch (error) {
      console.error("Failed to add to-do:", error);
      alert("Could not add to-do.");
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
        <CleaningWorldHeader />

        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">
              Cleaning World
            </p>
            <h1 className="text-3xl font-bold tracking-tight">To-Do List</h1>
            <p className="mt-1 text-sm text-slate-600">
              Simple list for account visits, follow-ups, complaints, and
              onboarding.
            </p>
          </div>

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
              <input
                value={form.assignedTo}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    assignedTo: event.target.value,
                  }))
                }
                placeholder="Junior Account Manager"
                className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
              />
            </div>

            <div>
              <label className="text-sm font-semibold">Account</label>

              <input
                list="to-do-account-options"
                value={form.accountName}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    accountName: event.target.value,
                  }))
                }
                onFocus={(event) => {
                  event.currentTarget.showPicker?.();
                }}
                placeholder={
                  accountOptions.length > 0
                    ? "Click to select or type account"
                    : "Loading accounts..."
                }
                className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
              />

              <datalist id="to-do-account-options">
                {accountOptions.map((accountName) => (
                  <option key={accountName} value={accountName}>
                    {accountName}
                  </option>
                ))}
              </datalist>

              <p className="mt-1 text-xs text-slate-500">
                Start typing to search, or click the field to choose from the
                account list.
              </p>
            </div>

            <div>
              <label className="text-sm font-semibold">Task Type</label>
              <select
                value={form.taskType}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    taskType: event.target.value,
                  }))
                }
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
              <article
                key={todo.id}
                className="print-card rounded-2xl bg-white p-5 shadow-sm"
              >
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div>
                    <div className="flex flex-wrap gap-2">
                      <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
                        {todo.taskType || "Task"}
                      </span>

                      <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
                        {todo.status || "Open"}
                      </span>

                      {isOverdue(todo) ? (
                        <span className="rounded-full bg-red-100 px-3 py-1 text-xs font-semibold text-red-700">
                          Overdue
                        </span>
                      ) : null}
                    </div>

                    <h3 className="mt-3 text-lg font-bold">
                      {todo.accountName}
                    </h3>

                    <p className="mt-1 text-sm text-slate-600">
                      Assigned to:{" "}
                      <span className="font-semibold">{todo.assignedTo}</span>
                    </p>

                    {todo.dueDate ? (
                      <p className="text-sm text-slate-600">
                        Due:{" "}
                        <span className="font-semibold">{todo.dueDate}</span>
                      </p>
                    ) : null}
                  </div>

                  <div className="no-print flex flex-wrap gap-2">
                    {todo.status !== "In Progress" && todo.status !== "Done" ? (
                      <button
                        type="button"
                        onClick={() =>
                          updateStatus(todo.id, "In Progress", todo.notes)
                        }
                        className="rounded-xl border border-slate-300 px-3 py-2 text-xs font-semibold hover:bg-slate-50"
                      >
                        In Progress
                      </button>
                    ) : null}

                    {todo.status !== "Done" ? (
                      <button
                        type="button"
                        onClick={() => updateStatus(todo.id, "Done", todo.notes)}
                        className="rounded-xl bg-green-700 px-3 py-2 text-xs font-semibold text-white hover:bg-green-600"
                      >
                        Done
                      </button>
                    ) : null}
                  </div>
                </div>

                <div className="mt-4 space-y-2 text-sm text-slate-700">
                  <p>
                    <span className="font-semibold">Why:</span> {todo.why}
                  </p>

                  {todo.notes ? (
                    <p>
                      <span className="font-semibold">Notes:</span> {todo.notes}
                    </p>
                  ) : null}
                </div>

                <div className="mt-4 border-t border-slate-100 pt-3 text-xs text-slate-500">
                  ID: {todo.id || "N/A"}
                </div>
              </article>
            ))
          )}
        </section>
      </div>
    </main>
  );
}

function CleaningWorldHeader() {
  return (
    <header
      className="no-print"
      style={{
        width: "100%",
        borderRadius: "24px",
        padding: "22px",
        marginBottom: "26px",
        background:
          "linear-gradient(135deg, #003b7a 0%, #005bbb 45%, #00a8e8 100%)",
        color: "white",
        boxShadow: "0 14px 34px rgba(0, 59, 122, 0.25)",
        border: "1px solid rgba(255,255,255,0.25)",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "20px",
          flexWrap: "wrap",
        }}
      >
        <Link
          href="/"
          style={{
            display: "flex",
            alignItems: "center",
            gap: "16px",
            textDecoration: "none",
            color: "white",
          }}
        >
          <div
            style={{
              width: "82px",
              height: "82px",
              borderRadius: "20px",
              background: "white",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: "8px",
              boxShadow: "0 8px 20px rgba(0,0,0,0.2)",
              overflow: "hidden",
              position: "relative",
            }}
          >
            <Image
              src="/cw-logo.jpg"
              alt="Cleaning World Logo"
              width={82}
              height={82}
              priority
              style={{
                width: "100%",
                height: "100%",
                objectFit: "contain",
              }}
            />
          </div>

          <div>
            <h1
              style={{
                margin: 0,
                fontSize: "30px",
                fontWeight: 900,
                letterSpacing: "-0.04em",
              }}
            >
              To-Do List
            </h1>

            <p
              style={{
                margin: "6px 0 0",
                fontSize: "14px",
                fontWeight: 500,
                color: "rgba(255,255,255,0.92)",
              }}
            >
              Manager tasks, visits, follow-ups, and onboarding
            </p>
          </div>
        </Link>

        <nav
          style={{
            display: "flex",
            gap: "10px",
            flexWrap: "wrap",
          }}
        >
          <HeaderLink href="/" label="Dashboard" />
          <HeaderLink href="/to-do" label="To-Do List" />
          <HeaderLink href="/accounts" label="Accounts" />
          <HeaderLink href="/visits" label="Visits" />
          <HeaderLink href="/complaints" label="Complaints" />
          <HeaderLink href="/account-updates" label="Updates" />
          <HeaderLink href="/subcontractors" label="Subs" />
          <HeaderLink href="/sales" label="Sales" />
        </nav>
      </div>
    </header>
  );
}

function HeaderLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      style={{
        color: "white",
        textDecoration: "none",
        fontSize: "14px",
        fontWeight: 800,
        padding: "10px 15px",
        borderRadius: "999px",
        background: "rgba(255,255,255,0.17)",
        border: "1px solid rgba(255,255,255,0.25)",
      }}
    >
      {label}
    </Link>
  );
}