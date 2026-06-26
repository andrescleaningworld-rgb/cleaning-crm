"use client";

import Link from "next/link";
import Image from "next/image";
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

type ComplaintPhoto = {
  rowNumber?: number | string;
  photoId?: string;
  accountId?: string;
  accountName?: string;
  sourceType?: string;
  sourceId?: string;
  uploadedBy?: string;
  fileName?: string;
  driveUrl?: string;
  folderUrl?: string;
  status?: string;
};

type ComplaintsApiResponse = {
  success?: boolean;
  error?: string;
  complaints?: Complaint[];
  data?: Complaint[];
};

type PhotosApiResponse = {
  success?: boolean;
  message?: string;
  photos?: ComplaintPhoto[];
  data?: ComplaintPhoto[];
};

type CloseComplaintResponse = {
  success?: boolean;
  error?: string;
};

type SortBy = "recent" | "priority" | "status";
type StatusFilter = "all" | "open" | "review" | "closed" | "not-valid" | "photos";

function clean(value: unknown): string {
  return String(value ?? "").trim();
}

function normalize(value: unknown): string {
  return clean(value).toLowerCase();
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
  const value = normalize(status);
  return value.includes("closed") || value.includes("resolved");
}

function isOpenComplaint(status: unknown): boolean {
  const value = normalize(status);

  return (
    !isClosedComplaint(value) &&
    (value === "" ||
      value === "open" ||
      value.includes("progress") ||
      value.includes("pending") ||
      value.includes("needs attention") ||
      value.includes("needs review"))
  );
}

function getPriorityRank(value: unknown): number {
  const text = normalize(value);

  if (text.includes("urgent")) return 1;
  if (text.includes("high")) return 2;
  if (text.includes("medium")) return 3;
  if (text.includes("low")) return 4;

  return 99;
}

function getStatusRank(value: unknown): number {
  const text = normalize(value);

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
  const value = normalize(status);

  if (value.includes("resolved") || value.includes("closed")) {
    return "rounded-full bg-green-100 px-3 py-1 text-xs font-bold text-green-700";
  }

  if (value.includes("open") || !value) {
    return "rounded-full bg-red-100 px-3 py-1 text-xs font-bold text-red-700";
  }

  if (value.includes("progress") || value.includes("pending")) {
    return "rounded-full bg-yellow-100 px-3 py-1 text-xs font-bold text-yellow-800";
  }

  if (value.includes("review")) {
    return "rounded-full bg-orange-100 px-3 py-1 text-xs font-bold text-orange-800";
  }

  return "rounded-full bg-gray-100 px-3 py-1 text-xs font-bold text-gray-700";
}

function getSeverityClass(severity: unknown): string {
  const value = normalize(severity);

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
  const value = normalize(validity);

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

function getLoadedPhotos(data: PhotosApiResponse | ComplaintPhoto[]) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data.photos)) return data.photos;
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

function getComplaintDetailHref(complaint: Complaint, index: number): string {
  return `/complaints/${encodeURIComponent(
    getComplaintDetailId(complaint, index)
  )}`;
}

function getDriveFileId(url?: string): string {
  const text = clean(url);

  if (!text) return "";

  const filePathMatch = text.match(/\/d\/([^/]+)/);
  const idParamMatch = text.match(/[?&]id=([^&]+)/);

  return clean(filePathMatch?.[1] || idParamMatch?.[1]);
}

function getDriveImageUrl(url?: string): string {
  const fileId = getDriveFileId(url);

  if (!fileId) return clean(url);

  return `https://drive.google.com/uc?export=view&id=${encodeURIComponent(
    fileId
  )}`;
}

function getComplaintPhotos(
  complaint: Complaint,
  allPhotos: ComplaintPhoto[]
): ComplaintPhoto[] {
  const complaintId = clean(complaint.id || complaint.rowNumber);

  if (!complaintId) return [];

  return allPhotos.filter((photo) => {
    const sourceType = normalize(photo.sourceType);
    const sourceId = clean(photo.sourceId);
    const status = normalize(photo.status);
    const driveUrl = clean(photo.driveUrl);

    return (
      sourceId === complaintId &&
      sourceType.includes("complaint") &&
      status !== "inactive" &&
      Boolean(driveUrl)
    );
  });
}

function getComplaintPhotoCount(
  complaint: Complaint,
  allPhotos: ComplaintPhoto[]
): number {
  return getComplaintPhotos(complaint, allPhotos).length;
}

export default function ComplaintsPage() {
  const [complaints, setComplaints] = useState<Complaint[]>([]);
  const [photos, setPhotos] = useState<ComplaintPhoto[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingPhotos, setLoadingPhotos] = useState(true);
  const [savingClose, setSavingClose] = useState(false);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<SortBy>("recent");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

  const [selectedComplaint, setSelectedComplaint] =
    useState<Complaint | null>(null);
  const [resolutionNote, setResolutionNote] = useState("");

  async function loadComplaints() {
    try {
      setLoading(true);
      setError("");

      const response = await fetch("/api/complaints", {
        method: "GET",
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

  async function loadPhotos() {
    try {
      setLoadingPhotos(true);

      const response = await fetch("/api/photos", {
        method: "GET",
        cache: "no-store",
      });

      const text = await response.text();

      let data: PhotosApiResponse | ComplaintPhoto[];

      try {
        data = JSON.parse(text) as PhotosApiResponse | ComplaintPhoto[];
      } catch {
        setPhotos([]);
        return;
      }

      if (!response.ok || (!Array.isArray(data) && data.success === false)) {
        setPhotos([]);
        return;
      }

      setPhotos(getLoadedPhotos(data));
    } catch {
      setPhotos([]);
    } finally {
      setLoadingPhotos(false);
    }
  }

  useEffect(() => {
    loadComplaints();
    loadPhotos();
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

  const complaintStats = useMemo(() => {
    const total = complaints.length;

    const open = complaints.filter((complaint) =>
      isOpenComplaint(complaint.status)
    ).length;

    const closed = complaints.filter((complaint) =>
      isClosedComplaint(complaint.status)
    ).length;

    const review = complaints.filter(
      (complaint) => normalize(complaint.complaintValidity) === "needs review"
    ).length;

    const notValid = complaints.filter(
      (complaint) => normalize(complaint.complaintValidity) === "not valid"
    ).length;

    const withPhotos = complaints.filter(
      (complaint) => getComplaintPhotoCount(complaint, photos) > 0
    ).length;

    return {
      total,
      open,
      closed,
      review,
      notValid,
      withPhotos,
    };
  }, [complaints, photos]);

  const filteredComplaints = useMemo(() => {
    const term = search.toLowerCase().trim();

    return complaints.filter((complaint) => {
      const hasPhotos = getComplaintPhotoCount(complaint, photos) > 0;

      if (statusFilter === "open" && !isOpenComplaint(complaint.status)) {
        return false;
      }

      if (statusFilter === "closed" && !isClosedComplaint(complaint.status)) {
        return false;
      }

      if (
        statusFilter === "review" &&
        normalize(complaint.complaintValidity) !== "needs review"
      ) {
        return false;
      }

      if (
        statusFilter === "not-valid" &&
        normalize(complaint.complaintValidity) !== "not valid"
      ) {
        return false;
      }

      if (statusFilter === "photos" && !hasPhotos) {
        return false;
      }

      if (!term) return true;

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
        clean(complaint.notes).toLowerCase().includes(term) ||
        clean(complaint.reportedBy).toLowerCase().includes(term)
      );
    });
  }, [complaints, photos, search, statusFilter]);

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

  return (
    <main className="min-h-screen bg-slate-50 p-4 text-slate-900 md:p-6">
      <section className="mb-6 overflow-hidden rounded-3xl border border-blue-100 bg-white shadow-sm">
        <div className="bg-gradient-to-r from-blue-800 via-blue-700 to-sky-500 p-5 text-white md:p-6">
          <div className="flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.25em] text-blue-100">
                Cleaning World
              </p>
              <h1 className="mt-2 text-3xl font-black md:text-4xl">
                Complaints Control Center
              </h1>
              <p className="mt-2 max-w-3xl text-sm font-medium text-blue-50 md:text-base">
                Review complaints, see priorities, view photos inside the app,
                and close issues with resolution notes.
              </p>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row">
              <Link
                href="/complaints/new"
                className="rounded-2xl bg-white px-5 py-3 text-center font-black text-blue-800 shadow-sm hover:bg-blue-50"
              >
                + Add Complaint
              </Link>

              <button
                type="button"
                onClick={() => window.print()}
                className="rounded-2xl bg-slate-950 px-5 py-3 font-black text-white shadow-sm hover:bg-slate-800"
              >
                Print
              </button>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 p-4 md:grid-cols-6 md:p-5">
          <button
            type="button"
            onClick={() => setStatusFilter("all")}
            className={`rounded-2xl border p-4 text-left shadow-sm ${
              statusFilter === "all"
                ? "border-blue-300 bg-blue-50"
                : "border-slate-200 bg-white"
            }`}
          >
            <p className="text-xs font-black uppercase tracking-wide text-slate-500">
              Total
            </p>
            <p className="mt-2 text-3xl font-black">{complaintStats.total}</p>
          </button>

          <button
            type="button"
            onClick={() => setStatusFilter("open")}
            className={`rounded-2xl border p-4 text-left shadow-sm ${
              statusFilter === "open"
                ? "border-red-300 bg-red-50"
                : "border-slate-200 bg-white"
            }`}
          >
            <p className="text-xs font-black uppercase tracking-wide text-slate-500">
              Open
            </p>
            <p className="mt-2 text-3xl font-black text-red-700">
              {complaintStats.open}
            </p>
          </button>

          <button
            type="button"
            onClick={() => setStatusFilter("review")}
            className={`rounded-2xl border p-4 text-left shadow-sm ${
              statusFilter === "review"
                ? "border-yellow-300 bg-yellow-50"
                : "border-slate-200 bg-white"
            }`}
          >
            <p className="text-xs font-black uppercase tracking-wide text-slate-500">
              Review
            </p>
            <p className="mt-2 text-3xl font-black text-yellow-700">
              {complaintStats.review}
            </p>
          </button>

          <button
            type="button"
            onClick={() => setStatusFilter("not-valid")}
            className={`rounded-2xl border p-4 text-left shadow-sm ${
              statusFilter === "not-valid"
                ? "border-green-300 bg-green-50"
                : "border-slate-200 bg-white"
            }`}
          >
            <p className="text-xs font-black uppercase tracking-wide text-slate-500">
              Not Valid
            </p>
            <p className="mt-2 text-3xl font-black text-green-700">
              {complaintStats.notValid}
            </p>
          </button>

          <button
            type="button"
            onClick={() => setStatusFilter("photos")}
            className={`rounded-2xl border p-4 text-left shadow-sm ${
              statusFilter === "photos"
                ? "border-purple-300 bg-purple-50"
                : "border-slate-200 bg-white"
            }`}
          >
            <p className="text-xs font-black uppercase tracking-wide text-slate-500">
              Photos
            </p>
            <p className="mt-2 text-3xl font-black text-purple-700">
              {complaintStats.withPhotos}
            </p>
          </button>

          <button
            type="button"
            onClick={() => setStatusFilter("closed")}
            className={`rounded-2xl border p-4 text-left shadow-sm ${
              statusFilter === "closed"
                ? "border-slate-400 bg-slate-100"
                : "border-slate-200 bg-white"
            }`}
          >
            <p className="text-xs font-black uppercase tracking-wide text-slate-500">
              Closed
            </p>
            <p className="mt-2 text-3xl font-black">{complaintStats.closed}</p>
          </button>
        </div>
      </section>

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

      <section className="mb-5 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm md:p-5">
        <div className="grid gap-4 md:grid-cols-[1fr_220px_180px] md:items-end">
          <label className="block">
            <span className="mb-2 block text-sm font-black text-slate-700">
              Search Complaints
            </span>
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search account, issue, subcontractor, status..."
              className="w-full rounded-2xl border border-slate-300 px-4 py-3 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
            />
          </label>

          <label className="block">
            <span className="mb-2 block text-sm font-black text-slate-700">
              Sort By
            </span>
            <select
              value={sortBy}
              onChange={(event) => setSortBy(event.target.value as SortBy)}
              className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 font-bold text-slate-800 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
            >
              <option value="recent">Most Recent</option>
              <option value="priority">Priority</option>
              <option value="status">Status</option>
            </select>
          </label>

          <button
            type="button"
            onClick={() => {
              setSearch("");
              setStatusFilter("all");
              setSortBy("recent");
            }}
            className="rounded-2xl border border-slate-300 px-4 py-3 font-black text-slate-700 hover:bg-slate-50"
          >
            Reset
          </button>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2 text-sm text-slate-500">
          <span className="font-bold">{sortedComplaints.length} showing</span>
          <span>•</span>
          <span>
            {loadingPhotos
              ? "Loading photos..."
              : `${photos.length} photo records loaded`}
          </span>
        </div>
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm md:p-5">
        <div className="mb-5 flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
          <div>
            <h2 className="text-2xl font-black">Complaint List</h2>
            <p className="mt-1 text-sm text-slate-500">
              Photos appear automatically when the complaint ID matches the
              photo Source ID.
            </p>
          </div>
        </div>

        {loading ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center font-bold text-slate-500">
            Loading complaints...
          </div>
        ) : sortedComplaints.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center">
            <p className="font-bold text-slate-700">No complaints found.</p>
            <Link
              href="/complaints/new"
              className="mt-4 inline-block rounded-2xl bg-blue-600 px-5 py-3 font-black text-white hover:bg-blue-700"
            >
              + Add Complaint
            </Link>
          </div>
        ) : (
          <div className="grid gap-4">
            {sortedComplaints.map((complaint, index) => {
              const complaintPhotos = getComplaintPhotos(complaint, photos);
              const photoCount = complaintPhotos.length;
              const firstPhotoUrl = getDriveImageUrl(
                complaintPhotos[0]?.driveUrl
              );
              const priority = complaint.severity || complaint.priority;

              return (
                <article
                  key={`${
                    complaint.id || complaint.rowNumber || "complaint"
                  }-${index}`}
                  className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-blue-200 hover:shadow-md md:p-5"
                >
                  <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
                    <div>
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <p className="text-xs font-black uppercase tracking-widest text-slate-400">
                            {formatDate(complaint.date)}
                          </p>

                          <h3 className="mt-1 text-xl font-black text-slate-950">
                            {clean(complaint.accountName) ? (
                              <Link
                                href={`/accounts/${slugify(
                                  complaint.accountName
                                )}`}
                                className="text-blue-800 hover:underline"
                              >
                                {clean(complaint.accountName)}
                              </Link>
                            ) : (
                              "No account"
                            )}
                          </h3>
                        </div>

                        <div className="flex flex-wrap gap-2">
                          <span className={getStatusClass(complaint.status)}>
                            {clean(complaint.status) || "Open"}
                          </span>

                          <span className={getSeverityClass(priority)}>
                            {clean(priority) || "Priority"}
                          </span>

                          <span
                            className={getValidityClass(
                              complaint.complaintValidity
                            )}
                          >
                            {clean(complaint.complaintValidity) ||
                              "Needs Review"}
                          </span>
                        </div>
                      </div>

                      <div className="mt-4 rounded-2xl bg-slate-50 p-4">
                        <p className="font-black text-slate-800">
                          {clean(complaint.complaintType) || "Complaint"}
                        </p>
                        <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">
                          {clean(complaint.description) || "-"}
                        </p>
                      </div>

                      <div className="mt-4 grid gap-3 text-sm text-slate-600 md:grid-cols-3">
                        <div className="rounded-2xl border border-slate-200 p-3">
                          <p className="text-xs font-black uppercase tracking-wide text-slate-400">
                            Assigned
                          </p>
                          <p className="mt-1 font-bold text-slate-800">
                            {clean(complaint.manager) ||
                              clean(complaint.subcontractor) ||
                              "-"}
                          </p>
                        </div>

                        <div className="rounded-2xl border border-slate-200 p-3">
                          <p className="text-xs font-black uppercase tracking-wide text-slate-400">
                            Follow-Up
                          </p>
                          <p className="mt-1 font-bold text-slate-800">
                            {formatDate(complaint.followUpDate)}
                          </p>
                        </div>

                        <div className="rounded-2xl border border-slate-200 p-3">
                          <p className="text-xs font-black uppercase tracking-wide text-slate-400">
                            Photos
                          </p>
                          <p className="mt-1 font-bold text-slate-800">
                            {photoCount > 0 ? `${photoCount} attached` : "None"}
                          </p>
                        </div>
                      </div>

                      {photoCount > 0 ? (
                        <div className="mt-4 rounded-2xl border border-purple-100 bg-purple-50 p-4">
                          <p className="text-xs font-black uppercase tracking-wide text-purple-700">
                            Attached Photos
                          </p>

                          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
                            {complaintPhotos.slice(0, 4).map((photo, photoIndex) => {
                              const imageUrl = getDriveImageUrl(photo.driveUrl);

                              return (
                                <a
                                  key={`${
                                    photo.photoId ||
                                    photo.rowNumber ||
                                    photo.fileName ||
                                    "photo"
                                  }-${photoIndex}`}
                                  href={imageUrl}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="group overflow-hidden rounded-2xl border border-purple-200 bg-white shadow-sm"
                                  title="Open photo only"
                                >
                                  <Image
                                    src={imageUrl}
                                    alt={
                                      clean(photo.fileName) ||
                                      `Complaint photo ${photoIndex + 1}`
                                    }
                                    width={280}
                                    height={112}
                                    unoptimized
                                    className="h-28 w-full object-cover transition group-hover:scale-105"
                                  />
                                  <div className="p-2 text-center text-xs font-black text-purple-700">
                                    View Photo
                                  </div>
                                </a>
                              );
                            })}
                          </div>

                          {photoCount > 4 ? (
                            <p className="mt-3 text-xs font-bold text-purple-700">
                              Showing 4 of {photoCount} photos. Open details to
                              view more.
                            </p>
                          ) : null}
                        </div>
                      ) : null}

                      {clean(complaint.notes) || clean(complaint.resolution) ? (
                        <div className="mt-4 rounded-2xl border border-slate-200 p-4 text-sm">
                          <p className="text-xs font-black uppercase tracking-wide text-slate-400">
                            Notes / Resolution
                          </p>
                          <p className="mt-2 whitespace-pre-wrap text-slate-700">
                            {clean(complaint.notes) ||
                              clean(complaint.resolution) ||
                              "-"}
                          </p>
                        </div>
                      ) : null}
                    </div>

                    <div className="flex flex-col gap-3">
                      <Link
                        href={getComplaintDetailHref(complaint, index)}
                        className="rounded-2xl bg-blue-600 px-5 py-3 text-center font-black text-white hover:bg-blue-700"
                      >
                        View Details
                      </Link>

                      {firstPhotoUrl ? (
                        <a
                          href={firstPhotoUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="rounded-2xl bg-purple-600 px-5 py-3 text-center font-black text-white hover:bg-purple-700"
                        >
                          📷 Open Photo
                        </a>
                      ) : (
                        <div className="rounded-2xl border border-dashed border-slate-300 px-5 py-3 text-center text-sm font-bold text-slate-400">
                          No Photos
                        </div>
                      )}

                      {!isClosedComplaint(complaint.status) ? (
                        <button
                          type="button"
                          onClick={() => openCloseModal(complaint)}
                          className="rounded-2xl bg-green-600 px-5 py-3 font-black text-white hover:bg-green-700"
                        >
                          Close Complaint
                        </button>
                      ) : (
                        <div className="rounded-2xl bg-green-50 px-5 py-3 text-center text-sm font-black text-green-700">
                          Complaint Closed
                        </div>
                      )}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      {selectedComplaint ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-lg rounded-3xl bg-white p-5 shadow-xl">
            <div className="mb-4">
              <p className="text-xs font-black uppercase tracking-widest text-green-600">
                Close Complaint
              </p>
              <h2 className="mt-2 text-2xl font-black">
                {clean(selectedComplaint.accountName) || "Complaint"}
              </h2>
              <p className="mt-2 text-sm text-slate-600">
                {clean(selectedComplaint.description) || "No issue description"}
              </p>
            </div>

            <label className="block">
              <span className="mb-2 block text-sm font-black text-slate-700">
                Resolution Note
              </span>
              <textarea
                value={resolutionNote}
                onChange={(event) => setResolutionNote(event.target.value)}
                rows={5}
                placeholder="Example: Spoke with subcontractor, issue corrected, customer satisfied."
                className="w-full rounded-2xl border border-slate-300 px-4 py-3 outline-none focus:border-green-500 focus:ring-4 focus:ring-green-100"
              />
            </label>

            <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={closeCloseModal}
                disabled={savingClose}
                className="rounded-2xl border border-slate-300 px-4 py-3 font-black text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={handleCloseComplaint}
                disabled={savingClose}
                className="rounded-2xl bg-green-600 px-4 py-3 font-black text-white hover:bg-green-700 disabled:opacity-60"
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