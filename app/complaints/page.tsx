"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type Complaint = {
  rowNumber?: number | string;
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

type ComplaintsApiResponse = {
  success?: boolean;
  error?: string;
  complaints?: Complaint[];
  data?: Complaint[];
};

type CloseComplaintResponse = {
  success?: boolean;
  error?: string;
};

type SortBy = "recent" | "priority" | "status";

function clean(value: unknown): string {
  return String(value ?? "").trim();
}

function slugify(value: unknown): string {
  return clean(value)
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function formatDate(value: unknown): string {
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

function getDateTime(value: unknown): number {
  const text = clean(value);

  if (!text) return 0;

  const date = new Date(text);

  if (Number.isNaN(date.getTime())) return 0;

  return date.getTime();
}

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function isClosedComplaint(status: unknown): boolean {
  const value = clean(status).toLowerCase();
  return value.includes("closed") || value.includes("resolved");
}

function getPriorityRank(value: unknown): number {
  const text = clean(value).toLowerCase();

  if (text.includes("urgent")) return 1;
  if (text.includes("high")) return 2;
  if (text.includes("medium")) return 3;
  if (text.includes("low")) return 4;

  return 99;
}

function getStatusRank(value: unknown): number {
  const text = clean(value).toLowerCase();

  if (text.includes("open")) return 1;
  if (text.includes("progress")) return 2;
  if (text.includes("pending")) return 3;
  if (text.includes("needs attention")) return 4;
  if (text.includes("needs review")) return 5;
  if (text.includes("resolved")) return 6;
  if (text.includes("closed")) return 7;

  return 99;
}

function getStatusClass(status: unknown): string {
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

function getSeverityClass(severity: unknown): string {
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

function getValidityClass(validity: unknown): string {
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

function getLoadedComplaints(data: ComplaintsApiResponse | Complaint[]) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data.complaints)) return data.complaints;
  if (Array.isArray(data.data)) return data.data;
  return [];
}

export default function ComplaintsPage() {
  const [complaints, setComplaints] = useState<Complaint[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingClose, setSavingClose] = useState(false);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<SortBy>("recent");

  const [selectedComplaint, setSelectedComplaint] =
    useState<Complaint | null>(null);
  const [resolutionNote, setResolutionNote] = useState("");

  async function loadComplaints() {
    try {
      setLoading(true);
      setError("");

      const response = await fetch("/api/complaints", {
        method: "GET",
        cache: "no-store",
      });

      const text = await response.text();

      let data: ComplaintsApiResponse | Complaint[];

      try {
        data = JSON.parse(text) as ComplaintsApiResponse | Complaint[];
      } catch {
        throw new Error("Complaints API did not return valid JSON.");
      }

      if (!response.ok || (!Array.isArray(data) && data.success === false)) {
        throw new Error(
          !Array.isArray(data) && data.error
            ? data.error
            : "Failed to load complaints."
        );
      }

      const loadedComplaints = getLoadedComplaints(data);

      const realComplaints = loadedComplaints.filter((complaint) => {
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

  function openCloseModal(complaint: Complaint) {
    setSelectedComplaint(complaint);
    setResolutionNote(clean(complaint.resolution));
    setError("");
    setSuccessMessage("");
  }

  function closeCloseModal() {
    setSelectedComplaint(null);
    setResolutionNote("");
    setSavingClose(false);
  }

  async function handleCloseComplaint() {
    if (!selectedComplaint) return;

    if (!clean(resolutionNote)) {
      setError("Please enter a resolution note before closing the complaint.");
      return;
    }

    try {
      setSavingClose(true);
      setError("");
      setSuccessMessage("");

      const response = await fetch("/api/complaints", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "closeComplaint",
          complaint: {
            rowNumber: selectedComplaint.rowNumber || "",
            id: selectedComplaint.id || "",
            accountName: selectedComplaint.accountName || "",
            date: selectedComplaint.date || "",
            description: selectedComplaint.description || "",
            issue: selectedComplaint.description || "",
            status: "Closed",
            resolution: resolutionNote,
            resolutionNotes: resolutionNote,
            followUpDate: todayIsoDate(),
            closedDate: todayIsoDate(),
            notes: selectedComplaint.notes || "",
          },
        }),
      });

      const text = await response.text();

      let data: CloseComplaintResponse;

      try {
        data = JSON.parse(text) as CloseComplaintResponse;
      } catch {
        throw new Error(
          "Complaints API did not return valid JSON while closing."
        );
      }

      if (!response.ok || data.success === false) {
        throw new Error(data.error || "Failed to close complaint.");
      }

      setSuccessMessage("Complaint closed successfully.");
      closeCloseModal();
      await loadComplaints();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Unknown error closing complaint."
      );
    } finally {
      setSavingClose(false);
    }
  }

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

  const sortedComplaints = useMemo(() => {
    return [...filteredComplaints].sort((a, b) => {
      if (sortBy === "priority") {
        const priorityDifference =
          getPriorityRank(a.severity || a.priority) -
          getPriorityRank(b.severity || b.priority);

        if (priorityDifference !== 0) return priorityDifference;

        return getDateTime(b.date) - getDateTime(a.date);
      }

      if (sortBy === "status") {
        const statusDifference =
          getStatusRank(a.status) - getStatusRank(b.status);

        if (statusDifference !== 0) return statusDifference;

        return getDateTime(b.date) - getDateTime(a.date);
      }

      return getDateTime(b.date) - getDateTime(a.date);
    });
  }, [filteredComplaints, sortBy]);

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
      return isClosedComplaint(complaint.status);
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
    <main className="min-h-screen bg-gray-50 p-4 text-gray-900 md:p-6">
      <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-blue-600">
            Cleaning World
          </p>
          <h1 className="mt-2 text-3xl font-bold">Complaints</h1>
          <p className="mt-2 text-gray-500">
            Track account complaints, status, validity, follow-ups, and
            resolution notes.
          </p>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row">
          <Link
            href="/complaints/new"
            className="rounded-xl bg-blue-600 px-4 py-3 text-center font-bold text-white shadow-sm hover:bg-blue-700"
          >
            + Add Complaint
          </Link>

          <button
            type="button"
            onClick={() => window.print()}
            className="rounded-xl bg-gray-900 px-4 py-3 font-bold text-white shadow-sm"
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

      {successMessage ? (
        <div className="mb-5 rounded-2xl border border-green-200 bg-green-50 p-5 font-bold text-green-700">
          {successMessage}
        </div>
      ) : null}

      <section className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-5 md:gap-4">
        <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm md:p-5">
          <p className="text-xs font-bold uppercase tracking-wide text-gray-500">
            Total
          </p>
          <h2 className="mt-2 text-3xl font-bold">{complaints.length}</h2>
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm md:p-5">
          <p className="text-xs font-bold uppercase tracking-wide text-gray-500">
            Open
          </p>
          <h2 className="mt-2 text-3xl font-bold">{openComplaints}</h2>
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm md:p-5">
          <p className="text-xs font-bold uppercase tracking-wide text-gray-500">
            Closed
          </p>
          <h2 className="mt-2 text-3xl font-bold">{resolvedComplaints}</h2>
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm md:p-5">
          <p className="text-xs font-bold uppercase tracking-wide text-gray-500">
            Review
          </p>
          <h2 className="mt-2 text-3xl font-bold">
            {needsReviewComplaints}
          </h2>
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm md:col-span-1 md:p-5">
          <p className="text-xs font-bold uppercase tracking-wide text-gray-500">
            Not Valid
          </p>
          <h2 className="mt-2 text-3xl font-bold">{notValidComplaints}</h2>
        </div>
      </section>

      <section className="mb-5 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
        <div className="grid gap-4 md:grid-cols-[1fr_220px] md:items-end">
          <label className="block">
            <span className="mb-2 block text-sm font-bold text-gray-700">
              Search Complaints
            </span>
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search by account, issue, status, validity, priority..."
              className="w-full rounded-xl border border-gray-300 px-4 py-3"
            />
          </label>

          <label className="block">
            <span className="mb-2 block text-sm font-bold text-gray-700">
              Sort By
            </span>
            <select
              value={sortBy}
              onChange={(event) => setSortBy(event.target.value as SortBy)}
              className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 font-semibold text-gray-800"
            >
              <option value="recent">Most Recent</option>
              <option value="priority">Priority</option>
              <option value="status">Status</option>
            </select>
          </label>
        </div>
      </section>

      <section className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm md:p-5">
        <div className="mb-4 flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
          <div>
            <h2 className="text-xl font-bold">Complaint List</h2>
            <p className="mt-1 text-sm text-gray-500">
              Open complaints can now be closed with a resolution note.
            </p>
          </div>

          <span className="font-bold text-gray-500">
            {sortedComplaints.length} complaints
          </span>
        </div>

        {loading ? (
          <p className="text-gray-500">Loading complaints...</p>
        ) : sortedComplaints.length === 0 ? (
          <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 p-6 text-center">
            <p className="font-semibold text-gray-700">No complaints found.</p>
            <Link
              href="/complaints/new"
              className="mt-4 inline-block rounded-xl bg-blue-600 px-4 py-2 font-bold text-white hover:bg-blue-700"
            >
              + Add Complaint
            </Link>
          </div>
        ) : (
          <>
            <div className="space-y-4 md:hidden">
              {sortedComplaints.map((complaint, index) => (
                <div
                  key={`${complaint.id || "mobile-complaint"}-${index}`}
                  className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm"
                >
                  <div className="mb-3 flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-bold uppercase tracking-wide text-gray-500">
                        {formatDate(complaint.date)}
                      </p>
                      <h3 className="mt-1 font-bold">
                        {clean(complaint.accountName) ? (
                          <Link
                            href={`/accounts/${slugify(
                              complaint.accountName
                            )}`}
                            className="text-blue-700 hover:underline"
                          >
                            {clean(complaint.accountName)}
                          </Link>
                        ) : (
                          "No account"
                        )}
                      </h3>
                    </div>

                    <span className={getStatusClass(complaint.status)}>
                      {clean(complaint.status) || "Open"}
                    </span>
                  </div>

                  <div className="mb-3">
                    <p className="font-semibold">
                      {clean(complaint.complaintType) || "Complaint"}
                    </p>
                    <p className="mt-1 text-sm text-gray-600">
                      {clean(complaint.description) || "-"}
                    </p>
                  </div>

                  <div className="mb-3 flex flex-wrap gap-2">
                    <span
                      className={getSeverityClass(
                        complaint.severity || complaint.priority
                      )}
                    >
                      {clean(complaint.severity || complaint.priority) ||
                        "Priority"}
                    </span>

                    <span
                      className={getValidityClass(complaint.complaintValidity)}
                    >
                      {clean(complaint.complaintValidity) || "Needs Review"}
                    </span>
                  </div>

                  <div className="mb-3 text-sm text-gray-600">
                    <p>
                      <strong>Assigned:</strong>{" "}
                      {clean(complaint.manager) ||
                        clean(complaint.subcontractor) ||
                        "-"}
                    </p>
                    <p>
                      <strong>Follow-Up:</strong>{" "}
                      {formatDate(complaint.followUpDate)}
                    </p>
                    <p>
                      <strong>Resolution:</strong>{" "}
                      {clean(complaint.resolution) || "-"}
                    </p>
                  </div>

                  {!isClosedComplaint(complaint.status) ? (
                    <button
                      type="button"
                      onClick={() => openCloseModal(complaint)}
                      className="w-full rounded-xl bg-green-600 px-4 py-3 font-bold text-white hover:bg-green-700"
                    >
                      Close Complaint
                    </button>
                  ) : (
                    <div className="rounded-xl bg-green-50 px-4 py-3 text-center text-sm font-bold text-green-700">
                      Complaint Closed
                    </div>
                  )}
                </div>
              ))}
            </div>

            <div className="hidden overflow-x-auto md:block">
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
                    <th className="p-3">Action</th>
                  </tr>
                </thead>

                <tbody>
                  {sortedComplaints.map((complaint, index) => (
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
                            href={`/accounts/${slugify(
                              complaint.accountName
                            )}`}
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
                          {clean(complaint.severity || complaint.priority) ||
                            "-"}
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
                          {clean(complaint.complaintValidity) ||
                            "Needs Review"}
                        </span>
                      </td>

                      <td className="p-3">
                        {clean(complaint.manager) ||
                          clean(complaint.subcontractor) ||
                          "-"}
                      </td>

                      <td className="whitespace-nowrap p-3">
                        {formatDate(complaint.followUpDate)}
                      </td>

                      <td className="min-w-[260px] p-3">
                        {clean(complaint.notes) ||
                          clean(complaint.resolution) ||
                          "-"}
                      </td>

                      <td className="whitespace-nowrap p-3">
                        {!isClosedComplaint(complaint.status) ? (
                          <button
                            type="button"
                            onClick={() => openCloseModal(complaint)}
                            className="rounded-xl bg-green-600 px-4 py-2 font-bold text-white hover:bg-green-700"
                          >
                            Close
                          </button>
                        ) : (
                          <span className="rounded-full bg-green-50 px-3 py-1 text-xs font-bold text-green-700">
                            Closed
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>

      {selectedComplaint ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-xl">
            <div className="mb-4">
              <p className="text-xs font-bold uppercase tracking-widest text-green-600">
                Close Complaint
              </p>
              <h2 className="mt-2 text-2xl font-bold">
                {clean(selectedComplaint.accountName) || "Complaint"}
              </h2>
              <p className="mt-2 text-sm text-gray-600">
                {clean(selectedComplaint.description) || "No issue description"}
              </p>
            </div>

            <label className="block">
              <span className="mb-2 block text-sm font-bold text-gray-700">
                Resolution Note
              </span>
              <textarea
                value={resolutionNote}
                onChange={(event) => setResolutionNote(event.target.value)}
                rows={5}
                placeholder="Example: Spoke with subcontractor, issue corrected, customer satisfied."
                className="w-full rounded-xl border border-gray-300 px-4 py-3"
              />
            </label>

            <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={closeCloseModal}
                disabled={savingClose}
                className="rounded-xl border border-gray-300 px-4 py-3 font-bold text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={handleCloseComplaint}
                disabled={savingClose}
                className="rounded-xl bg-green-600 px-4 py-3 font-bold text-white hover:bg-green-700 disabled:opacity-60"
              >
                {savingClose ? "Closing..." : "Close Complaint"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}