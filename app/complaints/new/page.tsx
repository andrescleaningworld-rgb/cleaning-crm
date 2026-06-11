"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type AnyRow = Record<string, any>;

type ComplaintForm = {
  accountId: string;
  accountName: string;
  complaintDate: string;
  issue: string;
  priority: string;
  status: string;
  complaintValidity: string;
  reportedBy: string;
  assignedTo: string;
  lastFollowUp: string;
  notes: string;
};

function getValue(row: AnyRow, keys: string[]) {
  for (const key of keys) {
    if (row[key] !== undefined && row[key] !== null && row[key] !== "") {
      return row[key];
    }
  }

  return "";
}

function todayDate() {
  return new Date().toISOString().slice(0, 10);
}

function getAccountName(account: AnyRow) {
  return String(
    getValue(account, [
      "Account Name",
      "accountName",
      "Account",
      "account",
      "Name",
      "name",
    ])
  ).trim();
}

function getAccountId(account: AnyRow) {
  return String(
    getValue(account, ["Account ID", "accountId", "ID", "id"])
  ).trim();
}

function getAccountManager(account: AnyRow) {
  return String(
    getValue(account, [
      "Manager",
      "manager",
      "Account Manager",
      "accountManager",
    ])
  ).trim();
}

function isRealAccount(account: AnyRow) {
  return getAccountName(account).length > 0;
}

async function safeReadData(response: Response) {
  try {
    if (!response.ok) {
      const text = await response.text();
      console.error("Accounts API failed:", response.status, text.slice(0, 300));
      return [];
    }

    const text = await response.text();

    if (!text) return [];

    if (text.trim().startsWith("<")) {
      console.error("Accounts API returned HTML:", text.slice(0, 300));
      return [];
    }

    const data = JSON.parse(text);

    if (Array.isArray(data)) return data;
    if (Array.isArray(data.data)) return data.data;
    if (Array.isArray(data.rows)) return data.rows;
    if (Array.isArray(data.items)) return data.items;
    if (Array.isArray(data.accounts)) return data.accounts;

    return [];
  } catch (error) {
    console.error("Read accounts error:", error);
    return [];
  }
}

const emptyForm: ComplaintForm = {
  accountId: "",
  accountName: "",
  complaintDate: todayDate(),
  issue: "",
  priority: "Medium",
  status: "Open",
  complaintValidity: "Needs Review",
  reportedBy: "",
  assignedTo: "",
  lastFollowUp: "",
  notes: "",
};

export default function NewComplaintPage() {
  const [accounts, setAccounts] = useState<AnyRow[]>([]);
  const [form, setForm] = useState<ComplaintForm>(emptyForm);
  const [accountSearch, setAccountSearch] = useState("");
  const [showAccountResults, setShowAccountResults] = useState(false);
  const [loadingAccounts, setLoadingAccounts] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  async function loadAccounts() {
    try {
      setLoadingAccounts(true);

      const response = await fetch("/api/accounts", {
        cache: "no-store",
      });

      const data = await safeReadData(response);

      setAccounts(data.filter((account: AnyRow) => isRealAccount(account)));
    } catch (error) {
      console.error("Load accounts error:", error);
      setAccounts([]);
    } finally {
      setLoadingAccounts(false);
    }
  }

  useEffect(() => {
    loadAccounts();
  }, []);

  const sortedAccounts = useMemo(() => {
    return [...accounts].sort((a, b) =>
      getAccountName(a).localeCompare(getAccountName(b))
    );
  }, [accounts]);

  const filteredAccounts = useMemo(() => {
    const search = accountSearch.toLowerCase().trim();

    if (!search) return sortedAccounts.slice(0, 10);

    return sortedAccounts
      .filter((account) => {
        const accountName = getAccountName(account).toLowerCase();
        const accountId = getAccountId(account).toLowerCase();
        const manager = getAccountManager(account).toLowerCase();

        return (
          accountName.includes(search) ||
          accountId.includes(search) ||
          manager.includes(search)
        );
      })
      .slice(0, 12);
  }, [accountSearch, sortedAccounts]);

  function updateForm(field: keyof ComplaintForm, value: string) {
    setForm((current) => ({
      ...current,
      [field]: value,
    }));
  }

  function selectAccount(account: AnyRow) {
    const accountName = getAccountName(account);
    const accountId = getAccountId(account);
    const manager = getAccountManager(account);

    setForm((current) => ({
      ...current,
      accountId,
      accountName,
      assignedTo: current.assignedTo || manager,
    }));

    setAccountSearch(accountName);
    setShowAccountResults(false);
  }

  function clearSelectedAccount() {
    setForm((current) => ({
      ...current,
      accountId: "",
      accountName: "",
    }));

    setAccountSearch("");
    setShowAccountResults(true);
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!form.accountName) {
      setMessage("Please select an account before saving the complaint.");
      return;
    }

    try {
      setSaving(true);
      setMessage("");

      const response = await fetch("/api/complaints", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "addComplaint",
          complaint: {
            accountId: form.accountId,
            accountName: form.accountName,
            date: form.complaintDate,
            complaintDate: form.complaintDate,
            issue: form.issue,
            description: form.issue,
            complaintType: form.issue,
            priority: form.priority,
            severity: form.priority,
            status: form.status,
            complaintValidity: form.complaintValidity,
            validity: form.complaintValidity,
            reportedBy: form.reportedBy,
            manager: form.assignedTo,
            assignedTo: form.assignedTo,
            lastFollowUp: form.lastFollowUp,
            followUpDate: form.lastFollowUp,
            notes: form.notes,

            "Account ID": form.accountId,
            "Account Name": form.accountName,
            "Complaint Date": form.complaintDate,
            Issue: form.issue,
            Priority: form.priority,
            Status: form.status,
            "Complaint Validity": form.complaintValidity,
            "Reported By": form.reportedBy,
            "Assigned To": form.assignedTo,
            "Last Follow-Up": form.lastFollowUp,
            Notes: form.notes,
          },
        }),
      });

      const text = await response.text();

      if (!response.ok) {
        throw new Error(text || "Failed to save complaint.");
      }

      let data: any = {};

      try {
        data = JSON.parse(text);
      } catch {
        data = {};
      }

      if (data.success === false) {
        throw new Error(
          data.error || data.message || "Failed to save complaint."
        );
      }

      let successMessage = "Complaint saved successfully.";

      if (data.notification?.sent) {
        successMessage += " Subcontractor notification email sent.";
      } else if (data.notification?.reason) {
        successMessage += ` Notification not sent: ${data.notification.reason}`;
      }

      setMessage(successMessage);
      setForm(emptyForm);
      setAccountSearch("");
      setShowAccountResults(false);
    } catch (error: any) {
      console.error("Save complaint error:", error);
      setMessage(error?.message || "Failed to save complaint.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="min-h-screen bg-gray-100 p-6">
      <div className="mx-auto max-w-3xl space-y-6">
        <section className="rounded-2xl bg-white p-6 shadow">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">
                Add Complaint
              </h1>

              <p className="mt-1 text-gray-600">
                Create a new account complaint and notify the assigned
                subcontractor when possible.
              </p>
            </div>

            <Link
              href="/complaints"
              className="rounded-lg border border-gray-300 px-4 py-2 text-center text-sm font-semibold text-gray-700 hover:bg-gray-50"
            >
              Back to Complaints
            </Link>
          </div>
        </section>

        {message && (
          <section className="rounded-2xl bg-white p-4 shadow">
            <p
              className={`text-sm font-semibold ${
                message.toLowerCase().includes("failed") ||
                message.toLowerCase().includes("error") ||
                message.toLowerCase().includes("please")
                  ? "text-red-700"
                  : "text-green-700"
              }`}
            >
              {message}
            </p>
          </section>
        )}

        <section className="rounded-2xl bg-white p-6 shadow">
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="relative">
              <label className="mb-1 block text-sm font-semibold text-gray-700">
                Account
              </label>

              <input
                value={accountSearch}
                onChange={(event) => {
                  const value = event.target.value;
                  setAccountSearch(value);
                  setShowAccountResults(true);

                  setForm((current) => ({
                    ...current,
                    accountId: "",
                    accountName: "",
                  }));
                }}
                onFocus={() => setShowAccountResults(true)}
                disabled={loadingAccounts}
                required
                className="w-full rounded-lg border border-gray-300 px-3 py-2"
                placeholder={
                  loadingAccounts ? "Loading accounts..." : "Type account name..."
                }
              />

              {form.accountName && (
                <div className="mt-2 flex items-center justify-between rounded-lg bg-green-50 px-3 py-2 text-sm text-green-800">
                  <span>
                    Selected: <strong>{form.accountName}</strong>
                  </span>

                  <button
                    type="button"
                    onClick={clearSelectedAccount}
                    className="font-semibold text-green-900 hover:underline"
                  >
                    Change
                  </button>
                </div>
              )}

              {showAccountResults && !form.accountName && !loadingAccounts && (
                <div className="absolute z-20 mt-1 max-h-72 w-full overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-lg">
                  {filteredAccounts.length === 0 ? (
                    <div className="px-3 py-3 text-sm text-gray-500">
                      No accounts found.
                    </div>
                  ) : (
                    filteredAccounts.map((account, index) => {
                      const accountName = getAccountName(account);
                      const accountId = getAccountId(account);
                      const manager = getAccountManager(account);

                      return (
                        <button
                          key={`${accountId || accountName}-${index}`}
                          type="button"
                          onClick={() => selectAccount(account)}
                          className="block w-full border-b border-gray-100 px-3 py-3 text-left hover:bg-gray-50"
                        >
                          <p className="font-semibold text-gray-900">
                            {accountName}
                          </p>

                          <p className="text-xs text-gray-500">
                            {accountId || "No ID"}
                            {manager ? ` · Manager: ${manager}` : ""}
                          </p>
                        </button>
                      );
                    })
                  )}
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
              <div>
                <label className="mb-1 block text-sm font-semibold text-gray-700">
                  Complaint Date
                </label>

                <input
                  type="date"
                  value={form.complaintDate}
                  onChange={(event) =>
                    updateForm("complaintDate", event.target.value)
                  }
                  required
                  className="w-full rounded-lg border border-gray-300 px-3 py-2"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-semibold text-gray-700">
                  Priority
                </label>

                <select
                  value={form.priority}
                  onChange={(event) =>
                    updateForm("priority", event.target.value)
                  }
                  className="w-full rounded-lg border border-gray-300 px-3 py-2"
                >
                  <option>Low</option>
                  <option>Medium</option>
                  <option>High</option>
                  <option>Urgent</option>
                </select>
              </div>

              <div>
                <label className="mb-1 block text-sm font-semibold text-gray-700">
                  Status
                </label>

                <select
                  value={form.status}
                  onChange={(event) => updateForm("status", event.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2"
                >
                  <option>Open</option>
                  <option>Pending</option>
                  <option>Needs Attention</option>
                  <option>Closed</option>
                </select>
              </div>

              <div>
                <label className="mb-1 block text-sm font-semibold text-gray-700">
                  Complaint Validity
                </label>

                <select
                  value={form.complaintValidity}
                  onChange={(event) =>
                    updateForm("complaintValidity", event.target.value)
                  }
                  className="w-full rounded-lg border border-gray-300 px-3 py-2"
                >
                  <option>Valid</option>
                  <option>Not Valid</option>
                  <option>Subjective</option>
                  <option>Needs Review</option>
                </select>
              </div>
            </div>

            <div>
              <label className="mb-1 block text-sm font-semibold text-gray-700">
                Issue
              </label>

              <input
                value={form.issue}
                onChange={(event) => updateForm("issue", event.target.value)}
                required
                className="w-full rounded-lg border border-gray-300 px-3 py-2"
                placeholder="Example: Restrooms not cleaned properly"
              />
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm font-semibold text-gray-700">
                  Reported By
                </label>

                <input
                  value={form.reportedBy}
                  onChange={(event) =>
                    updateForm("reportedBy", event.target.value)
                  }
                  className="w-full rounded-lg border border-gray-300 px-3 py-2"
                  placeholder="Customer, manager, office..."
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-semibold text-gray-700">
                  Assigned To
                </label>

                <input
                  value={form.assignedTo}
                  onChange={(event) =>
                    updateForm("assignedTo", event.target.value)
                  }
                  className="w-full rounded-lg border border-gray-300 px-3 py-2"
                  placeholder="Manager or person responsible"
                />
              </div>
            </div>

            <div>
              <label className="mb-1 block text-sm font-semibold text-gray-700">
                Last Follow-Up / Follow-Up Date
              </label>

              <input
                type="date"
                value={form.lastFollowUp}
                onChange={(event) =>
                  updateForm("lastFollowUp", event.target.value)
                }
                className="w-full rounded-lg border border-gray-300 px-3 py-2"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-semibold text-gray-700">
                Notes
              </label>

              <textarea
                value={form.notes}
                onChange={(event) => updateForm("notes", event.target.value)}
                className="min-h-32 w-full rounded-lg border border-gray-300 px-3 py-2"
                placeholder="Add details, customer comments, photos reference, or follow-up instructions..."
              />
            </div>

            <div className="flex flex-col gap-3 sm:flex-row">
              <button
                type="submit"
                disabled={saving}
                className="rounded-lg bg-red-600 px-5 py-3 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60"
              >
                {saving ? "Saving..." : "Save Complaint"}
              </button>

              <Link
                href="/complaints"
                className="rounded-lg border border-gray-300 px-5 py-3 text-center text-sm font-semibold text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </Link>
            </div>
          </form>
        </section>
      </div>
    </main>
  );
}