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
  photos?: string;
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

type SortOption = "Newest" | "Oldest" | "Status";

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

function toIso(value: unknown): string {
  const text = clean(value);
  if (!text) return "";
  const d = new Date(text);
  return Number.isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10);
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

  if (value.includes("high") || value.includes("urgent"))
    return "rounded-full bg-red-100 px-3 py-1 text-xs font-bold text-red-700";
  if (value.includes("medium"))
    return "rounded-full bg-yellow-100 px-3 py-1 text-xs font-bold text-yellow-800";
  if (value.includes("low"))
    return "rounded-full bg-green-100 px-3 py-1 text-xs font-bold text-green-700";
  return "rounded-full bg-gray-100 px-3 py-1 text-xs font-bold text-gray-700";
}

function getValidityClass(validity: unknown): string {
  const value = normalize(validity);

  if (value === "valid")
    return "rounded-full bg-red-100 px-3 py-1 text-xs font-bold text-red-700";
  if (value === "not valid")
    return "rounded-full bg-green-100 px-3 py-1 text-xs font-bold text-green-700";
  if (value === "subjective")
    return "rounded-full bg-purple-100 px-3 py-1 text-xs font-bold text-purple-700";
  if (value === "needs review")
    return "rounded-full bg-yellow-100 px-3 py-1 text-xs font-bold text-yellow-800";
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

  // Filter + sort state
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [accountFilter, setAccountFilter] = useState("All");
  const [sortOrder, setSortOrder] = useState<SortOption>("Newest");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  // Modals
  const [detailComplaint, setDetailComplaint] = useState<Complaint | null>(null);
  const [selectedComplaint, setSelectedComplaint] = useState<Complaint | null>(null);
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

      const loaded = getLoadedComplaints(data).filter((c) =>
        clean(c.accountName) ||
        clean(c.description) ||
        clean(c.complaintType) ||
        clean(c.date) ||
        clean(c.manager)
      );
      setComplaints(loaded);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error loading complaints.");
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
    void loadComplaints();
    void loadPhotos();
  }, []);

  function openDetail(complaint: Complaint) {
    setDetailComplaint(complaint);
  }

  function closeDetail() {
    setDetailComplaint(null);
  }

  function openCloseModal(complaint: Complaint, e: React.MouseEvent) {
    e.stopPropagation();
    setSelectedComplaint(complaint);
    setResolutionNote(clean(complaint.resolution));
    setError("");
    setSuccessMessage("");
  }

  function closeCloseModal() {
    if (savingClose) return;
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
        headers: { "Content-Type": "application/json" },
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
        throw new Error("Complaints API did not return valid JSON while closing.");
      }

      if (!response.ok || data.success === false) {
        throw new Error(data.error || "Failed to close complaint.");
      }

      setSuccessMessage("Complaint closed successfully.");
      closeCloseModal();
      await loadComplaints();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error closing complaint.");
    } finally {
      setSavingClose(false);
    }
  }

  // Unique accounts for filter dropdown
  const accountNames = useMemo(() => {
    const names = Array.from(
      new Set(complaints.map((c) => clean(c.accountName)).filter(Boolean))
    ).sort();
    return ["All", ...names];
  }, [complaints]);

  // Unique statuses for filter dropdown
  const statusOptions = useMemo(() => {
    const statuses = Array.from(
      new Set(complaints.map((c) => clean(c.status)).filter(Boolean))
    ).sort();
    return ["All", ...statuses];
  }, [complaints]);

  const filteredComplaints = useMemo(() => {
    const term = search.toLowerCase().trim();

    let result = complaints.filter((c) => {
      // Text search
      if (
        term &&
        ![
          c.accountName, c.complaintType, c.priority, c.severity,
          c.status, c.complaintValidity, c.manager, c.subcontractor,
          c.description, c.notes, c.reportedBy,
        ].some((f) => clean(f).toLowerCase().includes(term))
      ) {
        return false;
      }

      // Status filter
      if (statusFilter !== "All" && clean(c.status) !== statusFilter) return false;

      // Account filter
      if (accountFilter !== "All" && clean(c.accountName) !== accountFilter) return false;

      // Date range
      if (dateFrom || dateTo) {
        const iso = toIso(c.date);
        if (dateFrom && iso && iso < dateFrom) return false;
        if (dateTo && iso && iso > dateTo) return false;
      }

      return true;
    });

    if (sortOrder === "Newest") {
      result = [...result].sort(
        (a, b) => new Date(b.date ?? "").getTime() - new Date(a.date ?? "").getTime()
      );
    } else if (sortOrder === "Oldest") {
      result = [...result].sort(
        (a, b) => new Date(a.date ?? "").getTime() - new Date(b.date ?? "").getTime()
      );
    } else if (sortOrder === "Status") {
      result = [...result].sort((a, b) =>
        clean(a.status).localeCompare(clean(b.status))
      );
    }

    return result;
  }, [complaints, search, statusFilter, accountFilter, sortOrder, dateFrom, dateTo]);

  const openComplaints = useMemo(
    () =>
      complaints.filter((c) => {
        const v = clean(c.status).toLowerCase();
        return (
          v === "open" ||
          v.includes("progress") ||
          v.includes("pending") ||
          v.includes("needs attention")
        );
      }).length,
    [complaints]
  );

  const resolvedComplaints = useMemo(
    () => complaints.filter((c) => isClosedComplaint(c.status)).length,
    [complaints]
  );

  const needsReviewComplaints = useMemo(
    () =>
      complaints.filter(
        (c) => clean(c.complaintValidity).toLowerCase() === "needs review"
      ).length,
    [complaints]
  );

  const notValidComplaints = useMemo(
    () =>
      complaints.filter(
        (c) => clean(c.complaintValidity).toLowerCase() === "not valid"
      ).length,
    [complaints]
  );

  const withPhotosComplaints = useMemo(
    () => complaints.filter((c) => getComplaintPhotoCount(c, photos) > 0).length,
    [complaints, photos]
  );

  function clearFilters() {
    setSearch("");
    setStatusFilter("All");
    setAccountFilter("All");
    setSortOrder("Newest");
    setDateFrom("");
    setDateTo("");
  }

  return (
    <main className="min-h-screen bg-gray-50 p-4 text-gray-900 md:p-6">
      <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-red-600">
            Cleaning World
          </p>
          <h1 className="mt-2 text-3xl font-bold">Complaints</h1>
          <p className="mt-2 text-gray-500">
            Track account complaints, status, validity, follow-ups, and resolution notes.
          </p>
        </div>

        <Link
          href="/complaints/new"
          className="rounded-2xl bg-white px-5 py-3 text-center font-black text-blue-800 shadow-sm hover:bg-blue-50"
        >
          + Add Complaint
        </Link>
      </div>

      {/* Stats */}
      <section className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-6 md:gap-4">
        <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm md:p-5">
          <p className="text-xs font-bold uppercase tracking-wide text-gray-500">Total</p>
          <h2 className="mt-2 text-3xl font-bold">{complaints.length}</h2>
        </div>
        <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm md:p-5">
          <p className="text-xs font-bold uppercase tracking-wide text-gray-500">Open</p>
          <h2 className="mt-2 text-3xl font-bold">{openComplaints}</h2>
        </div>
        <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm md:p-5">
          <p className="text-xs font-bold uppercase tracking-wide text-gray-500">Closed</p>
          <h2 className="mt-2 text-3xl font-bold">{resolvedComplaints}</h2>
        </div>
        <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm md:p-5">
          <p className="text-xs font-bold uppercase tracking-wide text-gray-500">Review</p>
          <h2 className="mt-2 text-3xl font-bold">{needsReviewComplaints}</h2>
        </div>
        <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm md:p-5">
          <p className="text-xs font-bold uppercase tracking-wide text-gray-500">Not Valid</p>
          <h2 className="mt-2 text-3xl font-bold">{notValidComplaints}</h2>
        </div>
        <div className="rounded-2xl border border-purple-200 bg-purple-50 p-4 shadow-sm md:p-5">
          <p className="text-xs font-bold uppercase tracking-wide text-purple-700">With Photos</p>
          <h2 className="mt-2 text-3xl font-bold text-purple-700">{withPhotosComplaints}</h2>
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

      {/* Filters */}
      <section className="mb-5 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search..."
            className="rounded-xl border border-gray-300 px-4 py-3 text-sm xl:col-span-2"
          />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-xl border border-gray-300 px-4 py-3 text-sm"
          >
            {statusOptions.map((s) => (
              <option key={s} value={s}>
                Status: {s}
              </option>
            ))}
          </select>
          <select
            value={accountFilter}
            onChange={(e) => setAccountFilter(e.target.value)}
            className="rounded-xl border border-gray-300 px-4 py-3 text-sm"
          >
            {accountNames.map((n) => (
              <option key={n} value={n}>
                Account: {n.length > 22 ? n.slice(0, 22) + "…" : n}
              </option>
            ))}
          </select>
          <select
            value={sortOrder}
            onChange={(e) => setSortOrder(e.target.value as SortOption)}
            className="rounded-xl border border-gray-300 px-4 py-3 text-sm"
          >
            <option value="Newest">Sort: Newest First</option>
            <option value="Oldest">Sort: Oldest First</option>
            <option value="Status">Sort: By Status</option>
          </select>
          <button
            type="button"
            onClick={clearFilters}
            className="rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm font-bold text-gray-700 hover:bg-gray-50"
          >
            Clear Filters
          </button>
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="flex items-center gap-2 text-sm font-semibold text-gray-600">
            From
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="flex-1 rounded-xl border border-gray-300 px-3 py-2 text-sm"
            />
          </label>
          <label className="flex items-center gap-2 text-sm font-semibold text-gray-600">
            To
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="flex-1 rounded-xl border border-gray-300 px-3 py-2 text-sm"
            />
          </label>
        </div>
      </section>

      {/* List */}
      <section className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm md:p-5">
        <div className="mb-4 flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
          <div>
            <h2 className="text-xl font-bold">Complaint List</h2>
            <p className="mt-1 text-sm text-gray-500">
              Click any row to view full details, including photos. Use the Close button to resolve.
            </p>
          </div>
          <span className="font-bold text-gray-500">
            {filteredComplaints.length} of {complaints.length}
          </span>
        </div>

        {loading ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center font-bold text-slate-500">
            Loading complaints...
          </div>
        ) : filteredComplaints.length === 0 ? (
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
          <>
            {/* Mobile cards */}
            <div className="space-y-4 md:hidden">
              {filteredComplaints.map((complaint, index) => {
                const photoCount = getComplaintPhotoCount(complaint, photos);

                return (
                  <div
                    key={`${complaint.id || "mobile-complaint"}-${index}`}
                    className="cursor-pointer rounded-2xl border border-gray-200 bg-white p-4 shadow-sm hover:border-blue-300 hover:bg-blue-50"
                    onClick={() => openDetail(complaint)}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-xs font-bold uppercase tracking-wide text-gray-500">
                          {formatDate(complaint.date)}
                        </p>
                        <h3 className="mt-1 font-bold">
                          {clean(complaint.accountName) ? (
                            <span
                              className="text-blue-700"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <Link
                                href={`/accounts/${slugify(complaint.accountName)}`}
                                className="hover:underline"
                              >
                                {clean(complaint.accountName)}
                              </Link>
                            </span>
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
                      <span className={getSeverityClass(complaint.severity || complaint.priority)}>
                        {clean(complaint.severity || complaint.priority) || "Priority"}
                      </span>
                      <span className={getValidityClass(complaint.complaintValidity)}>
                        {clean(complaint.complaintValidity) || "Needs Review"}
                      </span>
                      {photoCount > 0 ? (
                        <span className="rounded-full bg-purple-100 px-3 py-1 text-xs font-bold text-purple-700">
                          📷 {photoCount} photo{photoCount === 1 ? "" : "s"}
                        </span>
                      ) : null}
                    </div>

                    {!isClosedComplaint(complaint.status) ? (
                      <button
                        type="button"
                        onClick={(e) => openCloseModal(complaint, e)}
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
                );
              })}
            </div>

            {/* Desktop table */}
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
                    <th className="p-3">Photos</th>
                    <th className="p-3">Assigned To</th>
                    <th className="p-3">Follow-Up</th>
                    <th className="p-3">Notes</th>
                    <th className="p-3">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredComplaints.map((complaint, index) => {
                    const photoCount = getComplaintPhotoCount(complaint, photos);

                    return (
                      <tr
                        key={`${complaint.id || "complaint"}-${index}`}
                        className="cursor-pointer border-b last:border-b-0 hover:bg-blue-50"
                        onClick={() => openDetail(complaint)}
                      >
                        <td className="whitespace-nowrap p-3">
                          {formatDate(complaint.date)}
                        </td>
                        <td className="p-3 font-bold">
                          {clean(complaint.accountName) ? (
                            <span onClick={(e) => e.stopPropagation()}>
                              <Link
                                href={`/accounts/${slugify(complaint.accountName)}`}
                                className="text-blue-700 hover:underline"
                              >
                                {clean(complaint.accountName)}
                              </Link>
                            </span>
                          ) : (
                            "-"
                          )}
                        </td>
                        <td className="min-w-[260px] p-3">
                          <div className="font-semibold">
                            {clean(complaint.complaintType) || "Complaint"}
                          </div>
                          <div className="mt-1 text-gray-600">
                            {clean(complaint.description) || "-"}
                          </div>
                        </td>
                        <td className="p-3">
                          <span className={getSeverityClass(complaint.severity || complaint.priority)}>
                            {clean(complaint.severity || complaint.priority) || "-"}
                          </span>
                        </td>
                        <td className="p-3">
                          <span className={getStatusClass(complaint.status)}>
                            {clean(complaint.status) || "-"}
                          </span>
                        </td>
                        <td className="p-3">
                          <span className={getValidityClass(complaint.complaintValidity)}>
                            {clean(complaint.complaintValidity) || "Needs Review"}
                          </span>
                        </td>
                        <td className="p-3">
                          {photoCount > 0 ? (
                            <span className="rounded-full bg-purple-100 px-3 py-1 text-xs font-bold text-purple-700">
                              📷 {photoCount}
                            </span>
                          ) : (
                            <span className="text-gray-400">—</span>
                          )}
                        </td>
                        <td className="p-3">
                          {clean(complaint.manager) || clean(complaint.subcontractor) || "-"}
                        </td>
                        <td className="whitespace-nowrap p-3">
                          {formatDate(complaint.followUpDate)}
                        </td>
                        <td className="min-w-[220px] p-3">
                          {clean(complaint.notes) || clean(complaint.resolution) || "-"}
                        </td>
                        <td className="whitespace-nowrap p-3">
                          {!isClosedComplaint(complaint.status) ? (
                            <button
                              type="button"
                              onClick={(e) => openCloseModal(complaint, e)}
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
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>

      {/* Detail Modal */}
      {detailComplaint ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={closeDetail}
        >
          <div
            className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-widest text-red-600">
                  Complaint Detail
                </p>
                <h2 className="mt-1 text-2xl font-bold">
                  {clean(detailComplaint.accountName) || "Complaint"}
                </h2>
              </div>
              <button
                type="button"
                onClick={closeDetail}
                className="rounded-full bg-gray-100 px-3 py-1.5 text-sm font-bold text-gray-600 hover:bg-gray-200"
              >
                ✕
              </button>
            </div>

            <div className="grid gap-3 text-sm sm:grid-cols-2">
              <div className="rounded-xl bg-gray-50 p-3">
                <p className="text-xs font-bold uppercase text-gray-500">Date</p>
                <p className="mt-1 font-semibold">{formatDate(detailComplaint.date)}</p>
              </div>
              <div className="rounded-xl bg-gray-50 p-3">
                <p className="text-xs font-bold uppercase text-gray-500">Type</p>
                <p className="mt-1 font-semibold">{clean(detailComplaint.complaintType) || "-"}</p>
              </div>
              <div className="rounded-xl bg-gray-50 p-3">
                <p className="text-xs font-bold uppercase text-gray-500">Status</p>
                <span className={`mt-1 inline-flex ${getStatusClass(detailComplaint.status)}`}>
                  {clean(detailComplaint.status) || "-"}
                </span>
              </div>
              <div className="rounded-xl bg-gray-50 p-3">
                <p className="text-xs font-bold uppercase text-gray-500">Priority / Severity</p>
                <span
                  className={`mt-1 inline-flex ${getSeverityClass(
                    detailComplaint.severity || detailComplaint.priority
                  )}`}
                >
                  {clean(detailComplaint.severity || detailComplaint.priority) || "-"}
                </span>
              </div>
              <div className="rounded-xl bg-gray-50 p-3">
                <p className="text-xs font-bold uppercase text-gray-500">Validity</p>
                <span
                  className={`mt-1 inline-flex ${getValidityClass(detailComplaint.complaintValidity)}`}
                >
                  {clean(detailComplaint.complaintValidity) || "-"}
                </span>
              </div>
              <div className="rounded-xl bg-gray-50 p-3">
                <p className="text-xs font-bold uppercase text-gray-500">Assigned To</p>
                <p className="mt-1 font-semibold">
                  {clean(detailComplaint.manager) || clean(detailComplaint.subcontractor) || "-"}
                </p>
              </div>
              <div className="rounded-xl bg-gray-50 p-3">
                <p className="text-xs font-bold uppercase text-gray-500">Follow-Up Date</p>
                <p className="mt-1 font-semibold">{formatDate(detailComplaint.followUpDate)}</p>
              </div>
              {clean(detailComplaint.reportedBy) ? (
                <div className="rounded-xl bg-gray-50 p-3">
                  <p className="text-xs font-bold uppercase text-gray-500">Reported By</p>
                  <p className="mt-1 font-semibold">{clean(detailComplaint.reportedBy)}</p>
                </div>
              ) : null}
              <div className="rounded-xl bg-gray-50 p-3 sm:col-span-2">
                <p className="text-xs font-bold uppercase text-gray-500">Description</p>
                <p className="mt-1 font-semibold">
                  {clean(detailComplaint.description) || "-"}
                </p>
              </div>
              {clean(detailComplaint.resolution) ? (
                <div className="rounded-xl bg-green-50 p-3 sm:col-span-2">
                  <p className="text-xs font-bold uppercase text-green-700">Resolution</p>
                  <p className="mt-1 font-semibold text-green-900">
                    {clean(detailComplaint.resolution)}
                  </p>
                </div>
              ) : null}
              {clean(detailComplaint.notes) ? (
                <div className="rounded-xl bg-gray-50 p-3 sm:col-span-2">
                  <p className="text-xs font-bold uppercase text-gray-500">Notes</p>
                  <p className="mt-1 font-semibold">{clean(detailComplaint.notes)}</p>
                </div>
              ) : null}
            </div>

            {/* Photos */}
            {(() => {
              const detailPhotos = getComplaintPhotos(detailComplaint, photos);

              return detailPhotos.length > 0 ? (
                <div className="mt-4">
                  <p className="mb-2 text-xs font-bold uppercase text-gray-500">
                    Photos ({detailPhotos.length})
                  </p>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {detailPhotos.map((photo, i) => {
                      const imageUrl = getDriveImageUrl(photo.driveUrl);

                      return (
                        <a
                          key={`${photo.photoId || photo.rowNumber || photo.fileName || "photo"}-${i}`}
                          href={imageUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="block overflow-hidden rounded-xl border border-gray-200 hover:opacity-80"
                        >
                          <Image
                            src={imageUrl}
                            alt={clean(photo.fileName) || `Complaint photo ${i + 1}`}
                            width={280}
                            height={128}
                            unoptimized
                            className="h-32 w-full object-cover"
                          />
                        </a>
                      );
                    })}
                  </div>
                </div>
              ) : null;
            })()}

            <div className="mt-5 flex justify-end gap-3">
              {!isClosedComplaint(detailComplaint.status) ? (
                <button
                  type="button"
                  onClick={(e) => {
                    closeDetail();
                    openCloseModal(detailComplaint, e);
                  }}
                  className="rounded-xl bg-green-600 px-5 py-2.5 font-bold text-white hover:bg-green-700"
                >
                  Close Complaint
                </button>
              ) : null}
              <button
                type="button"
                onClick={closeDetail}
                className="rounded-xl border border-gray-300 px-5 py-2.5 font-bold text-gray-700 hover:bg-gray-50"
              >
                Dismiss
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Close Complaint Modal */}
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
                onChange={(e) => setResolutionNote(e.target.value)}
                rows={5}
                placeholder="Example: Spoke with subcontractor, issue corrected, customer satisfied."
                className="w-full rounded-2xl border border-slate-300 px-4 py-3 outline-none focus:border-green-500 focus:ring-4 focus:ring-green-100"
              />
            </label>

            {error ? (
              <div className="mt-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-bold text-red-700">
                {error}
              </div>
            ) : null}

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
                onClick={() => void handleCloseComplaint()}
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
