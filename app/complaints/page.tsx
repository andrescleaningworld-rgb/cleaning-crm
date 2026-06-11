"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type Complaint = {
  id?: string;
  date?: string;
  accountName?: string;
  complaintType?: string;
  priority?: string;
  severity?: string;
  status?: string;
  complaintValidity?: string;
  manager?: string;
  subcontractor?: string;
  description?: string;
  resolution?: string;
  followUpDate?: string;
  notes?: string;
  reportedBy?: string;
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

  if (value.includes("progress") || value.includes("pending")) {
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

function getValidityClass(validity: any): string {
  const value = clean(validity).toLowerCase();

  if (value === "valid") {
    return "rounded-full bg-red-100 px-3 py-1 text-xs font-bold text-red-700";
  }

  if (value === "not valid") {
    return "rounded-full bg-green-100 px-3 py-1 text-xs font-bold text-green-700";
  }

  if (value === "subjective") {
    return "rounded-full bg-purple-100 px-3 py-1 text-xs font-bold text-purple-700";
  }

  if (value === "needs review") {
    return "rounded-full bg-yellow-100 px-3 py-1 text-xs font-bold text-yellow-800";
  }

  return "rounded-full bg-gray-100 px-3 py-1 text-xs font-bold text-gray-700";
}

export default function ComplaintsPage() {
  const [complaints, setComplaints] = useState<Complaint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");

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
          clean(complaint.complaintType) ||
          clean(complaint.date) ||
          clean(complaint.manager)
        );
      });

      setComplaints(realComplaints);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Unknown error loading complaints."
      );
      setComplaints([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadComplaints();
  }, []);

  const filteredComplaints = useMemo(() => {
    const term = search.toLowerCase().trim();

    if (!term) return complaints;

    return complaints.filter((complaint) => {
      return (
        clean(complaint.accountName).toLowerCase().includes(term) ||
        clean(complaint.complaintType).toLowerCase().includes(term) ||
        clean(complaint.priority).toLowerCase().includes(term) ||
        clean(complaint.severity).toLowerCase().includes(term) ||
        clean(complaint.status).toLowerCase().includes(term) ||
        clean(complaint.complaintValidity).toLowerCase().includes(term) ||
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
      return (
        value === "open" ||
        value.includes("progress") ||
        value.includes("pending") ||
        value.includes("needs attention")
      );
    }).length;
  }, [complaints]);

  const resolvedComplaints = useMemo(() => {
    return complaints.filter((complaint) => {
      const value = clean(complaint.status).toLowerCase();
      return value.includes("resolved") || value.includes("closed");
    }).length;
  }, [complaints]);

  const needsReviewComplaints = useMemo(() => {
    return complaints.filter((complaint) => {
      return clean(complaint.complaintValidity).toLowerCase() === "needs review";
    }).length;
  }, [complaints]);

  const notValidComplaints = useMemo(() => {
    return complaints.filter((complaint) => {
      return clean(complaint.complaintValidity).toLowerCase() === "not valid";
    }).length;
  }, [complaints]);

  return (
    <main className="min-h-screen bg-gray-50 p-6 text-gray-900">
      <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-red-600">
            Cleaning World
          </p>
          <h1 className="mt-2 text-3xl font-bold">Complaints</h1>
          <p className="mt-2 text-gray-500">
            Track account complaints, status, validity, follow-ups, and
            resolution notes.
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <Link
            href="/complaints/new"
            className="rounded-xl bg-red-600 px-4 py-2 font-bold text-white shadow-sm hover:bg-red-700"
          >
            + Add Complaint
          </Link>

          <button
            onClick={() => window.print()}
            className="rounded-xl bg-gray-900 px-4 py-2 font-bold text-white shadow-sm"
          >
            Print
          </button>
        </div>
      </div>

      {error ? (
        <div className="mb-5 rounded-2xl border border-red-200 bg-red-50 p-5 font-bold text-red-700">
          {error}
        </div>
      ) : null}

      <section className="mb-5 grid grid-cols-1 gap-4 md:grid-cols-5">
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
            Needs Review
          </p>
          <h2 className="mt-2 text-3xl font-bold">{needsReviewComplaints}</h2>
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-bold uppercase tracking-wide text-gray-500">
            Not Valid
          </p>
          <h2 className="mt-2 text-3xl font-bold">{notValidComplaints}</h2>
        </div>
      </section>

      <section className="mb-5 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
        <label className="block">
          <span className="mb-2 block text-sm font-bold text-gray-700">
            Search Complaints
          </span>
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search by account, issue, status, validity, priority, assigned person..."
            className="w-full rounded-xl border border-gray-300 px-4 py-3"
          />
        </label>
      </section>

      <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold">Complaint List</h2>
            <p className="mt-1 text-sm text-gray-500">
              Use + Add Complaint to enter new complaints through the correct
              complaint form.
            </p>
          </div>

          <span className="font-bold text-gray-500">
            {filteredComplaints.length} complaints
          </span>
        </div>

        {loading ? (
          <p className="text-gray-500">Loading complaints...</p>
        ) : filteredComplaints.length === 0 ? (
          <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 p-6 text-center">
            <p className="font-semibold text-gray-700">No complaints found.</p>
            <Link
              href="/complaints/new"
              className="mt-4 inline-block rounded-xl bg-red-600 px-4 py-2 font-bold text-white hover:bg-red-700"
            >
              + Add Complaint
            </Link>
          </div>
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
                  <th className="p-3">Validity</th>
                  <th className="p-3">Assigned To</th>
                  <th className="p-3">Follow-Up</th>
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
                      <span
                        className={getSeverityClass(
                          complaint.severity || complaint.priority
                        )}
                      >
                        {clean(complaint.severity || complaint.priority) || "-"}
                      </span>
                    </td>

                    <td className="p-3">
                      <span className={getStatusClass(complaint.status)}>
                        {clean(complaint.status) || "-"}
                      </span>
                    </td>

                    <td className="p-3">
                      <span
                        className={getValidityClass(
                          complaint.complaintValidity
                        )}
                      >
                        {clean(complaint.complaintValidity) || "Needs Review"}
                      </span>
                    </td>

                    <td className="p-3">
                      {clean(complaint.manager) || clean(complaint.subcontractor) || "-"}
                    </td>

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