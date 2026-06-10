"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type Complaint = {
  id?: string;
  date?: string;
  accountName?: string;
  complaintType?: string;
  severity?: string;
  status?: string;
  manager?: string;
  subcontractor?: string;
  description?: string;
  resolution?: string;
  followUpDate?: string;
  notes?: string;
  reportedBy?: string;
};

type Account = {
  id?: string;
  accountName?: string;
  manager?: string;
  subcontractor?: string;
};

function clean(value: any): string {
  return String(value ?? "").trim();
}

function slugify(value: any): string {
  return clean(value)
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function todayDate() {
  return new Date().toISOString().slice(0, 10);
}

function formatDate(value: any): string {
  const text = clean(value);

  if (!text) return "-";

  const date = new Date(text);

  if (Number.isNaN(date.getTime())) return text;

  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function getStatusClass(status: any): string {
  const value = clean(status).toLowerCase();

  if (value.includes("resolved") || value.includes("closed")) {
    return "rounded-full bg-green-100 px-3 py-1 text-xs font-bold text-green-700";
  }

  if (value.includes("open")) {
    return "rounded-full bg-red-100 px-3 py-1 text-xs font-bold text-red-700";
  }

  if (value.includes("progress")) {
    return "rounded-full bg-yellow-100 px-3 py-1 text-xs font-bold text-yellow-800";
  }

  return "rounded-full bg-gray-100 px-3 py-1 text-xs font-bold text-gray-700";
}

function getSeverityClass(severity: any): string {
  const value = clean(severity).toLowerCase();

  if (value.includes("high") || value.includes("urgent")) {
    return "rounded-full bg-red-100 px-3 py-1 text-xs font-bold text-red-700";
  }

  if (value.includes("medium")) {
    return "rounded-full bg-yellow-100 px-3 py-1 text-xs font-bold text-yellow-800";
  }

  if (value.includes("low")) {
    return "rounded-full bg-green-100 px-3 py-1 text-xs font-bold text-green-700";
  }

  return "rounded-full bg-gray-100 px-3 py-1 text-xs font-bold text-gray-700";
}

export default function ComplaintsPage() {
  const [complaints, setComplaints] = useState<Complaint[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const [search, setSearch] = useState("");

  const [date, setDate] = useState(todayDate());
  const [accountName, setAccountName] = useState("");
  const [complaintType, setComplaintType] = useState("");
  const [severity, setSeverity] = useState("Medium");
  const [status, setStatus] = useState("Open");
  const [manager, setManager] = useState("");
  const [subcontractor, setSubcontractor] = useState("");
  const [reportedBy, setReportedBy] = useState("");
  const [followUpDate, setFollowUpDate] = useState("");
  const [description, setDescription] = useState("");
  const [notes, setNotes] = useState("");

  async function loadComplaints() {
    try {
      setLoading(true);
      setError("");

      const response = await fetch("/api/complaints", {
        method: "GET",
        cache: "no-store",
      });

      const text = await response.text();

      let data: any;

      try {
        data = JSON.parse(text);
      } catch {
        throw new Error("Complaints API did not return valid JSON.");
      }

      if (!response.ok || data.success === false) {
        throw new Error(data.error || "Failed to load complaints.");
      }

      const loadedComplaints = Array.isArray(data.complaints)
        ? data.complaints
        : Array.isArray(data.data)
        ? data.data
        : Array.isArray(data)
        ? data
        : [];

      const realComplaints = loadedComplaints.filter((complaint: Complaint) => {
        return (
          clean(complaint.accountName) ||
          clean(complaint.description) ||
          clean(complaint.date) ||
          clean(complaint.manager)
        );
      });

      setComplaints(realComplaints);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error loading complaints.");
      setComplaints([]);
    } finally {
      setLoading(false);
    }
  }

  async function loadAccounts() {
    try {
      const response = await fetch("/api/accounts", {
        method: "GET",
        cache: "no-store",
      });

      const text = await response.text();
      const data = JSON.parse(text);

      const loadedAccounts = Array.isArray(data.accounts)
        ? data.accounts
        : Array.isArray(data.data)
        ? data.data
        : Array.isArray(data)
        ? data
        : [];

      setAccounts(loadedAccounts);
    } catch {
      setAccounts([]);
    }
  }

  useEffect(() => {
    loadComplaints();
    loadAccounts();
  }, []);

  const selectedAccount = useMemo(() => {
    return accounts.find((account) => clean(account.accountName) === accountName);
  }, [accounts, accountName]);

  useEffect(() => {
    if (!selectedAccount) return;

    setManager(clean(selectedAccount.manager));
    setSubcontractor(clean(selectedAccount.subcontractor));
  }, [selectedAccount]);

  const filteredComplaints = useMemo(() => {
    const term = search.toLowerCase().trim();

    if (!term) return complaints;

    return complaints.filter((complaint) => {
      return (
        clean(complaint.accountName).toLowerCase().includes(term) ||
        clean(complaint.complaintType).toLowerCase().includes(term) ||
        clean(complaint.severity).toLowerCase().includes(term) ||
        clean(complaint.status).toLowerCase().includes(term) ||
        clean(complaint.manager).toLowerCase().includes(term) ||
        clean(complaint.subcontractor).toLowerCase().includes(term) ||
        clean(complaint.description).toLowerCase().includes(term) ||
        clean(complaint.notes).toLowerCase().includes(term)
      );
    });
  }, [complaints, search]);

  const openComplaints = useMemo(() => {
    return complaints.filter((complaint) => {
      const value = clean(complaint.status).toLowerCase();
      return value === "open" || value.includes("progress");
    }).length;
  }, [complaints]);

  const resolvedComplaints = useMemo(() => {
    return complaints.filter((complaint) => {
      const value = clean(complaint.status).toLowerCase();
      return value.includes("resolved") || value.includes("closed");
    }).length;
  }, [complaints]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    try {
      setSaving(true);
      setError("");
      setMessage("");

      if (!date) {
        throw new Error("Please enter a complaint date.");
      }

      if (!accountName) {
        throw new Error("Please select or enter an account.");
      }

      if (!description) {
        throw new Error("Please enter the complaint issue.");
      }

      const response = await fetch("/api/complaints", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        cache: "no-store",
        body: JSON.stringify({
          date,
          accountName,
          complaintType,
          severity,
          status,
          manager,
          subcontractor,
          description,
          notes,
          reportedBy,
          followUpDate,
        }),
      });

      const text = await response.text();

      let data: any;

      try {
        data = JSON.parse(text);
      } catch {
        throw new Error("Complaints API did not return valid JSON while saving.");
      }

      if (!response.ok || data.success === false) {
        throw new Error(data.error || "Failed to save complaint.");
      }

      setMessage(data.message || "Complaint saved successfully.");

      setComplaintType("");
      setSeverity("Medium");
      setStatus("Open");
      setReportedBy("");
      setFollowUpDate("");
      setDescription("");
      setNotes("");

      await loadComplaints();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error saving complaint.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="min-h-screen bg-gray-50 p-6 text-gray-900">
      <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-red-600">
            Cleaning World
          </p>
          <h1 className="mt-2 text-3xl font-bold">Complaints</h1>
          <p className="mt-2 text-gray-500">
            Track account complaints, status, follow-ups, and resolution notes.
          </p>
        </div>

        <button
          onClick={() => window.print()}
          className="rounded-xl bg-gray-900 px-4 py-2 font-bold text-white shadow-sm"
        >
          Print
        </button>
      </div>

      {error ? (
        <div className="mb-5 rounded-2xl border border-red-200 bg-red-50 p-5 font-bold text-red-700">
          {error}
        </div>
      ) : null}

      {message ? (
        <div className="mb-5 rounded-2xl border border-green-200 bg-green-50 p-5 font-bold text-green-700">
          {message}
        </div>
      ) : null}

      <section className="mb-5 grid grid-cols-1 gap-4 md:grid-cols-4">
        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-bold uppercase tracking-wide text-gray-500">
            Total Complaints
          </p>
          <h2 className="mt-2 text-3xl font-bold">{complaints.length}</h2>
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-bold uppercase tracking-wide text-gray-500">
            Open
          </p>
          <h2 className="mt-2 text-3xl font-bold">{openComplaints}</h2>
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-bold uppercase tracking-wide text-gray-500">
            Resolved
          </p>
          <h2 className="mt-2 text-3xl font-bold">{resolvedComplaints}</h2>
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-bold uppercase tracking-wide text-gray-500">
            Showing
          </p>
          <h2 className="mt-2 text-3xl font-bold">{filteredComplaints.length}</h2>
        </div>
      </section>

      <form
        onSubmit={handleSubmit}
        className="mb-6 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm"
      >
        <h2 className="mb-4 text-xl font-bold">Add Complaint</h2>

        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          <label className="block">
            <span className="mb-2 block text-sm font-bold text-gray-700">
              Account
            </span>
            <input
              list="account-list"
              value={accountName}
              onChange={(event) => setAccountName(event.target.value)}
              placeholder="Search or type account name"
              className="w-full rounded-xl border border-gray-300 px-4 py-3"
              required
            />

            <datalist id="account-list">
              {accounts.map((account, index) => (
                <option
                  key={`${account.id || account.accountName || "account"}-${index}`}
                  value={clean(account.accountName)}
                />
              ))}
            </datalist>
          </label>

          <label className="block">
            <span className="mb-2 block text-sm font-bold text-gray-700">
              Date
            </span>
            <input
              type="date"
              value={date}
              onChange={(event) => setDate(event.target.value)}
              className="w-full rounded-xl border border-gray-300 px-4 py-3"
              required
            />
          </label>

          <label className="block">
            <span className="mb-2 block text-sm font-bold text-gray-700">
              Complaint Type
            </span>
            <select
              value={complaintType}
              onChange={(event) => setComplaintType(event.target.value)}
              className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3"
            >
              <option value="">Select type</option>
              <option>Restroom Issue</option>
              <option>Missed Cleaning</option>
              <option>Trash Issue</option>
              <option>Floor Issue</option>
              <option>Dusting Issue</option>
              <option>Supplies Issue</option>
              <option>Customer Complaint</option>
              <option>Other</option>
            </select>
          </label>

          <label className="block">
            <span className="mb-2 block text-sm font-bold text-gray-700">
              Severity
            </span>
            <select
              value={severity}
              onChange={(event) => setSeverity(event.target.value)}
              className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3"
            >
              <option>Low</option>
              <option>Medium</option>
              <option>High</option>
              <option>Urgent</option>
            </select>
          </label>

          <label className="block">
            <span className="mb-2 block text-sm font-bold text-gray-700">
              Status
            </span>
            <select
              value={status}
              onChange={(event) => setStatus(event.target.value)}
              className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3"
            >
              <option>Open</option>
              <option>In Progress</option>
              <option>Resolved</option>
              <option>Closed</option>
            </select>
          </label>

          <label className="block">
            <span className="mb-2 block text-sm font-bold text-gray-700">
              Assigned / Manager
            </span>
            <input
              value={manager}
              onChange={(event) => setManager(event.target.value)}
              placeholder="Manager or assigned person"
              className="w-full rounded-xl border border-gray-300 px-4 py-3"
            />
          </label>

          <label className="block">
            <span className="mb-2 block text-sm font-bold text-gray-700">
              Subcontractor
            </span>
            <input
              value={subcontractor}
              onChange={(event) => setSubcontractor(event.target.value)}
              placeholder="Subcontractor"
              className="w-full rounded-xl border border-gray-300 px-4 py-3"
            />
          </label>

          <label className="block">
            <span className="mb-2 block text-sm font-bold text-gray-700">
              Follow-Up Date
            </span>
            <input
              type="date"
              value={followUpDate}
              onChange={(event) => setFollowUpDate(event.target.value)}
              className="w-full rounded-xl border border-gray-300 px-4 py-3"
            />
          </label>
        </div>

        <label className="mt-5 block">
          <span className="mb-2 block text-sm font-bold text-gray-700">
            Reported By
          </span>
          <input
            value={reportedBy}
            onChange={(event) => setReportedBy(event.target.value)}
            placeholder="Customer, office, manager..."
            className="w-full rounded-xl border border-gray-300 px-4 py-3"
          />
        </label>

        <label className="mt-5 block">
          <span className="mb-2 block text-sm font-bold text-gray-700">
            Complaint / Issue
          </span>
          <textarea
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="Example: Customer reported missed trash, restroom issue, floors not completed, supplies missing..."
            rows={4}
            className="w-full rounded-xl border border-gray-300 px-4 py-3"
            required
          />
        </label>

        <label className="mt-5 block">
          <span className="mb-2 block text-sm font-bold text-gray-700">
            Internal Notes
          </span>
          <textarea
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            placeholder="Add follow-up notes, subcontractor instructions, customer communication, or next steps..."
            rows={4}
            className="w-full rounded-xl border border-gray-300 px-4 py-3"
          />
        </label>

        <div className="mt-6 flex flex-wrap gap-3">
          <button
            type="submit"
            disabled={saving}
            className="rounded-xl bg-red-600 px-5 py-3 font-bold text-white disabled:opacity-60"
          >
            {saving ? "Saving..." : "Save Complaint"}
          </button>
        </div>
      </form>

      <section className="mb-5 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
        <label className="block">
          <span className="mb-2 block text-sm font-bold text-gray-700">
            Search Complaints
          </span>
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search by account, issue, status, priority, assigned person..."
            className="w-full rounded-xl border border-gray-300 px-4 py-3"
          />
        </label>
      </section>

      <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold">Complaint List</h2>
            <p className="mt-1 text-sm text-gray-500">
              Click the account name to return to that account detail page.
            </p>
          </div>

          <span className="font-bold text-gray-500">
            {filteredComplaints.length} complaints
          </span>
        </div>

        {loading ? (
          <p className="text-gray-500">Loading complaints...</p>
        ) : filteredComplaints.length === 0 ? (
          <p className="text-gray-500">No complaints found.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
                  <th className="p-3">Date</th>
                  <th className="p-3">Account</th>
                  <th className="p-3">Issue</th>
                  <th className="p-3">Priority</th>
                  <th className="p-3">Status</th>
                  <th className="p-3">Reported By</th>
                  <th className="p-3">Assigned To</th>
                  <th className="p-3">Last Follow-Up</th>
                  <th className="p-3">Notes</th>
                </tr>
              </thead>

              <tbody>
                {filteredComplaints.map((complaint, index) => (
                  <tr
                    key={`${complaint.id || "complaint"}-${index}`}
                    className="border-b last:border-b-0"
                  >
                    <td className="whitespace-nowrap p-3">
                      {formatDate(complaint.date)}
                    </td>

                    <td className="p-3 font-bold">
                      {clean(complaint.accountName) ? (
                        <Link
                          href={`/accounts/${slugify(complaint.accountName)}`}
                          className="text-blue-700 hover:underline"
                        >
                          {clean(complaint.accountName)}
                        </Link>
                      ) : (
                        "-"
                      )}
                    </td>

                    <td className="min-w-[280px] p-3">
                      <div className="font-semibold">
                        {clean(complaint.complaintType) || "Complaint"}
                      </div>
                      <div className="mt-1 text-gray-600">
                        {clean(complaint.description) || "-"}
                      </div>
                    </td>

                    <td className="p-3">
                      <span className={getSeverityClass(complaint.severity)}>
                        {clean(complaint.severity) || "-"}
                      </span>
                    </td>

                    <td className="p-3">
                      <span className={getStatusClass(complaint.status)}>
                        {clean(complaint.status) || "-"}
                      </span>
                    </td>

                    <td className="p-3">{clean(complaint.reportedBy) || "-"}</td>
                    <td className="p-3">{clean(complaint.manager) || "-"}</td>

                    <td className="whitespace-nowrap p-3">
                      {formatDate(complaint.followUpDate)}
                    </td>

                    <td className="min-w-[260px] p-3">
                      {clean(complaint.notes) ||
                        clean(complaint.resolution) ||
                        "-"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}