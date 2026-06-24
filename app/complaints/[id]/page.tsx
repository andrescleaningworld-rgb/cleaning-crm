"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";

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

function clean(value: unknown): string {
  return String(value ?? "").trim();
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

function getLoadedComplaints(data: ComplaintsApiResponse | Complaint[]) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data.complaints)) return data.complaints;
  if (Array.isArray(data.data)) return data.data;
  return [];
}

function getComplaintDetailId(complaint: Complaint, index: number): string {
  return (
    clean(complaint.id) ||
    clean(complaint.rowNumber) ||
    `complaint-${index + 1}`
  );
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

export default function ComplaintDetailPage() {
  const params = useParams();
  const complaintId = decodeURIComponent(String(params.id || ""));

  const [complaints, setComplaints] = useState<Complaint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

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
            : "Failed to load complaint."
        );
      }

      setComplaints(getLoadedComplaints(data));
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Unknown error loading complaint."
      );
      setComplaints([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadComplaints();
  }, []);

  const complaint = useMemo(() => {
    return complaints.find((item, index) => {
      return getComplaintDetailId(item, index) === complaintId;
    });
  }, [complaints, complaintId]);

  return (
    <main className="min-h-screen bg-gray-50 p-4 text-gray-900 md:p-6">
      <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-blue-600">
            Cleaning World
          </p>
          <h1 className="mt-2 text-3xl font-bold">Complaint Details</h1>
          <p className="mt-2 text-gray-500">
            Review the full complaint information, follow-up, validity, and
            resolution notes.
          </p>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row">
          <Link
            href="/complaints"
            className="rounded-xl border border-gray-300 bg-white px-4 py-3 text-center font-bold text-gray-700 hover:bg-gray-50"
          >
            Back to Complaints
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

      {loading ? (
        <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
          <p className="font-semibold text-gray-600">Loading complaint...</p>
        </div>
      ) : error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-5 font-bold text-red-700">
          {error}
        </div>
      ) : !complaint ? (
        <div className="rounded-2xl border border-yellow-200 bg-yellow-50 p-5">
          <h2 className="text-xl font-bold text-yellow-800">
            Complaint not found
          </h2>
          <p className="mt-2 text-yellow-700">
            This complaint may have been deleted or the complaint ID may not
            match the current list.
          </p>
          <Link
            href="/complaints"
            className="mt-4 inline-block rounded-xl bg-blue-600 px-4 py-3 font-bold text-white hover:bg-blue-700"
          >
            Back to Complaints
          </Link>
        </div>
      ) : (
        <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="mb-5 flex flex-col gap-3 border-b border-gray-200 pb-5 md:flex-row md:items-start md:justify-between">
            <div>
              <p className="text-sm font-bold uppercase tracking-wide text-gray-500">
                {formatDate(complaint.date)}
              </p>
              <h2 className="mt-2 text-2xl font-bold">
                {clean(complaint.accountName) || "No account"}
              </h2>
              <p className="mt-2 text-gray-600">
                {clean(complaint.complaintType) || "Complaint"}
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <span className={getStatusClass(complaint.status)}>
                {clean(complaint.status) || "Open"}
              </span>

              <span
                className={getSeverityClass(
                  complaint.severity || complaint.priority
                )}
              >
                {clean(complaint.severity || complaint.priority) || "Priority"}
              </span>

              <span className={getValidityClass(complaint.complaintValidity)}>
                {clean(complaint.complaintValidity) || "Needs Review"}
              </span>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-2xl bg-gray-50 p-4">
              <p className="text-xs font-bold uppercase tracking-wide text-gray-500">
                Account
              </p>
              <p className="mt-2 font-bold">
                {clean(complaint.accountName) || "-"}
              </p>
            </div>

            <div className="rounded-2xl bg-gray-50 p-4">
              <p className="text-xs font-bold uppercase tracking-wide text-gray-500">
                Date
              </p>
              <p className="mt-2 font-bold">{formatDate(complaint.date)}</p>
            </div>

            <div className="rounded-2xl bg-gray-50 p-4">
              <p className="text-xs font-bold uppercase tracking-wide text-gray-500">
                Assigned To
              </p>
              <p className="mt-2 font-bold">
                {clean(complaint.manager) ||
                  clean(complaint.subcontractor) ||
                  "-"}
              </p>
            </div>

            <div className="rounded-2xl bg-gray-50 p-4">
              <p className="text-xs font-bold uppercase tracking-wide text-gray-500">
                Follow-Up Date
              </p>
              <p className="mt-2 font-bold">
                {formatDate(complaint.followUpDate)}
              </p>
            </div>

            <div className="rounded-2xl bg-gray-50 p-4 md:col-span-2">
              <p className="text-xs font-bold uppercase tracking-wide text-gray-500">
                Description
              </p>
              <p className="mt-2 whitespace-pre-wrap text-gray-800">
                {clean(complaint.description) || "-"}
              </p>
            </div>

            <div className="rounded-2xl bg-gray-50 p-4 md:col-span-2">
              <p className="text-xs font-bold uppercase tracking-wide text-gray-500">
                Notes
              </p>
              <p className="mt-2 whitespace-pre-wrap text-gray-800">
                {clean(complaint.notes) || "-"}
              </p>
            </div>

            <div className="rounded-2xl bg-gray-50 p-4 md:col-span-2">
              <p className="text-xs font-bold uppercase tracking-wide text-gray-500">
                Resolution
              </p>
              <p className="mt-2 whitespace-pre-wrap text-gray-800">
                {clean(complaint.resolution) || "-"}
              </p>
            </div>

            <div className="rounded-2xl bg-gray-50 p-4">
              <p className="text-xs font-bold uppercase tracking-wide text-gray-500">
                Reported By
              </p>
              <p className="mt-2 font-bold">
                {clean(complaint.reportedBy) || "-"}
              </p>
            </div>

            <div className="rounded-2xl bg-gray-50 p-4">
              <p className="text-xs font-bold uppercase tracking-wide text-gray-500">
                Complaint ID
              </p>
              <p className="mt-2 font-bold">
                {clean(complaint.id) || clean(complaint.rowNumber) || "-"}
              </p>
            </div>
          </div>
        </section>
      )}
    </main>
  );
}