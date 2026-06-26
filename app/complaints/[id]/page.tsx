"use client";

import Link from "next/link";
import Image from "next/image";
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

  photoUrl?: string;
  photoUrls?: string;
  photos?: string;
  photoLinks?: string;
  imageUrl?: string;
  imageUrls?: string;
  attachmentUrl?: string;
  attachmentUrls?: string;

  "Photo URL"?: string;
  "Photo URLs"?: string;
  Photos?: string;
  "Photo Links"?: string;
  "Image URL"?: string;
  "Image URLs"?: string;
  "Attachment URL"?: string;
  "Attachment URLs"?: string;

  [key: string]: unknown;
};

type ComplaintsApiResponse = {
  success?: boolean;
  error?: string;
  complaints?: Complaint[];
  data?: Complaint[];
};

type SaveResponse = {
  success?: boolean;
  error?: string;
  message?: string;
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

function splitPhotoText(value: unknown): string[] {
  const text = clean(value);

  if (!text) return [];

  return text
    .split(/[\n,|]+/g)
    .map((item) => item.trim())
    .filter(Boolean);
}

function getPhotoUrls(complaint: Complaint): string[] {
  const possiblePhotoValues = [
    complaint.photoUrl,
    complaint.photoUrls,
    complaint.photos,
    complaint.photoLinks,
    complaint.imageUrl,
    complaint.imageUrls,
    complaint.attachmentUrl,
    complaint.attachmentUrls,
    complaint["Photo URL"],
    complaint["Photo URLs"],
    complaint.Photos,
    complaint["Photo Links"],
    complaint["Image URL"],
    complaint["Image URLs"],
    complaint["Attachment URL"],
    complaint["Attachment URLs"],
  ];

  const urls = possiblePhotoValues.flatMap((value) => splitPhotoText(value));

  return Array.from(new Set(urls));
}

function isImageUrl(url: string): boolean {
  const cleanUrl = url.toLowerCase();

  return (
    cleanUrl.includes("googleusercontent.com") ||
    cleanUrl.includes("drive.google.com") ||
    cleanUrl.endsWith(".jpg") ||
    cleanUrl.endsWith(".jpeg") ||
    cleanUrl.endsWith(".png") ||
    cleanUrl.endsWith(".webp") ||
    cleanUrl.endsWith(".gif")
  );
}

function getGoogleDrivePreviewUrl(url: string): string {
  const text = clean(url);

  const fileMatch = text.match(/\/file\/d\/([^/]+)/);
  if (fileMatch?.[1]) {
    return `https://drive.google.com/uc?export=view&id=${fileMatch[1]}`;
  }

  const idMatch = text.match(/[?&]id=([^&]+)/);
  if (idMatch?.[1]) {
    return `https://drive.google.com/uc?export=view&id=${idMatch[1]}`;
  }

  return text;
}

export default function ComplaintDetailPage() {
  const params = useParams();
  const complaintId = decodeURIComponent(String(params.id || ""));

  const [complaints, setComplaints] = useState<Complaint[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState({
    date: "",
    accountName: "",
    complaintType: "",
    priority: "",
    severity: "",
    status: "",
    complaintValidity: "",
    manager: "",
    subcontractor: "",
    description: "",
    resolution: "",
    followUpDate: "",
    notes: "",
    reportedBy: "",
  });

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

  const photoUrls = useMemo(() => {
    if (!complaint) return [];
    return getPhotoUrls(complaint);
  }, [complaint]);

  function startEditing() {
    if (!complaint) return;

    setEditForm({
      date: clean(complaint.date),
      accountName: clean(complaint.accountName),
      complaintType: clean(complaint.complaintType),
      priority: clean(complaint.priority),
      severity: clean(complaint.severity),
      status: clean(complaint.status),
      complaintValidity: clean(complaint.complaintValidity),
      manager: clean(complaint.manager),
      subcontractor: clean(complaint.subcontractor),
      description: clean(complaint.description),
      resolution: clean(complaint.resolution),
      followUpDate: clean(complaint.followUpDate),
      notes: clean(complaint.notes),
      reportedBy: clean(complaint.reportedBy),
    });

    setError("");
    setSuccessMessage("");
    setIsEditing(true);
  }

  function cancelEditing() {
    setIsEditing(false);
    setError("");
    setSuccessMessage("");
  }

  async function saveComplaintChanges() {
    if (!complaint) return;

    try {
      setSaving(true);
      setError("");
      setSuccessMessage("");

      const response = await fetch("/api/complaints", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "editComplaint",
          complaint: {
            rowNumber: complaint.rowNumber || "",
            id: complaint.id || "",
            complaintId: complaint.id || "",
            date: editForm.date,
            complaintDate: editForm.date,
            accountName: editForm.accountName,
            complaintType: editForm.complaintType,
            issue: editForm.description,
            description: editForm.description,
            priority: editForm.priority || editForm.severity,
            severity: editForm.severity || editForm.priority,
            status: editForm.status,
            complaintValidity: editForm.complaintValidity,
            validity: editForm.complaintValidity,
            manager: editForm.manager,
            assignedTo: editForm.manager,
            subcontractor: editForm.subcontractor,
            resolution: editForm.resolution,
            resolutionNotes: editForm.resolution,
            followUpDate: editForm.followUpDate,
            notes: editForm.notes,
            reportedBy: editForm.reportedBy,
          },
        }),
      });

      const text = await response.text();

      let data: SaveResponse;

      try {
        data = JSON.parse(text) as SaveResponse;
      } catch {
        throw new Error("Complaints API did not return valid JSON while saving.");
      }

      if (!response.ok || data.success === false) {
        throw new Error(data.error || "Failed to save complaint changes.");
      }

      setSuccessMessage("Complaint updated successfully.");
      setIsEditing(false);
      await loadComplaints();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Unknown error saving complaint."
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="min-h-screen bg-gray-50 p-4 text-gray-900 md:p-6">
      <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-start md:justify-between print:hidden">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-blue-600">
            Cleaning World
          </p>
          <h1 className="mt-2 text-3xl font-bold">Complaint Details</h1>
          <p className="mt-2 text-gray-500">
            Review the full complaint information, photos, follow-up, validity,
            and resolution notes.
          </p>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row">
          <Link
            href="/complaints"
            className="rounded-xl border border-gray-300 bg-white px-4 py-3 text-center font-bold text-gray-700 hover:bg-gray-50"
          >
            Back to Complaints
          </Link>

          {complaint && !isEditing ? (
            <button
              type="button"
              onClick={startEditing}
              className="rounded-xl bg-yellow-500 px-4 py-3 font-bold text-white shadow-sm hover:bg-yellow-600"
            >
              Edit
            </button>
          ) : null}

          <button
            type="button"
            onClick={() => window.print()}
            className="rounded-xl bg-gray-900 px-4 py-3 font-bold text-white shadow-sm"
          >
            Print
          </button>
        </div>
      </div>

      <div className="mb-6 hidden print:block">
        <p className="text-xs font-bold uppercase tracking-widest text-blue-600">
          Cleaning World
        </p>
        <h1 className="mt-2 text-2xl font-bold">Complaint Details</h1>
      </div>

      {error ? (
        <div className="mb-5 rounded-2xl border border-red-200 bg-red-50 p-5 font-bold text-red-700 print:hidden">
          {error}
        </div>
      ) : null}

      {successMessage ? (
        <div className="mb-5 rounded-2xl border border-green-200 bg-green-50 p-5 font-bold text-green-700 print:hidden">
          {successMessage}
        </div>
      ) : null}

      {loading ? (
        <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
          <p className="font-semibold text-gray-600">Loading complaint...</p>
        </div>
      ) : error && !complaint ? (
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
        <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm print:border-0 print:p-0 print:shadow-none">
          <div className="mb-5 flex flex-col gap-3 border-b border-gray-200 pb-5 md:flex-row md:items-start md:justify-between">
            <div>
              <p className="text-sm font-bold uppercase tracking-wide text-gray-500">
                {formatDate(isEditing ? editForm.date : complaint.date)}
              </p>
              <h2 className="mt-2 text-2xl font-bold">
                {clean(isEditing ? editForm.accountName : complaint.accountName) ||
                  "No account"}
              </h2>
              <p className="mt-2 text-gray-600">
                {clean(
                  isEditing ? editForm.complaintType : complaint.complaintType
                ) || "Complaint"}
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <span
                className={getStatusClass(
                  isEditing ? editForm.status : complaint.status
                )}
              >
                {clean(isEditing ? editForm.status : complaint.status) || "Open"}
              </span>

              <span
                className={getSeverityClass(
                  isEditing
                    ? editForm.severity || editForm.priority
                    : complaint.severity || complaint.priority
                )}
              >
                {clean(
                  isEditing
                    ? editForm.severity || editForm.priority
                    : complaint.severity || complaint.priority
                ) || "Priority"}
              </span>

              <span
                className={getValidityClass(
                  isEditing
                    ? editForm.complaintValidity
                    : complaint.complaintValidity
                )}
              >
                {clean(
                  isEditing
                    ? editForm.complaintValidity
                    : complaint.complaintValidity
                ) || "Needs Review"}
              </span>
            </div>
          </div>

          {isEditing ? (
            <div className="mb-5 rounded-2xl border border-yellow-200 bg-yellow-50 p-4 print:hidden">
              <p className="font-bold text-yellow-800">Edit Mode</p>
              <p className="mt-1 text-sm text-yellow-700">
                Fix typos or update complaint details, then click Save Changes.
              </p>
            </div>
          ) : null}

          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-2xl bg-gray-50 p-4 print:border print:bg-white">
              <p className="text-xs font-bold uppercase tracking-wide text-gray-500">
                Account
              </p>
              {isEditing ? (
                <input
                  value={editForm.accountName}
                  onChange={(event) =>
                    setEditForm((current) => ({
                      ...current,
                      accountName: event.target.value,
                    }))
                  }
                  className="mt-2 w-full rounded-xl border border-gray-300 px-4 py-3 print:hidden"
                />
              ) : (
                <p className="mt-2 font-bold">
                  {clean(complaint.accountName) || "-"}
                </p>
              )}
            </div>

            <div className="rounded-2xl bg-gray-50 p-4 print:border print:bg-white">
              <p className="text-xs font-bold uppercase tracking-wide text-gray-500">
                Date
              </p>
              {isEditing ? (
                <input
                  value={editForm.date}
                  onChange={(event) =>
                    setEditForm((current) => ({
                      ...current,
                      date: event.target.value,
                    }))
                  }
                  className="mt-2 w-full rounded-xl border border-gray-300 px-4 py-3 print:hidden"
                />
              ) : (
                <p className="mt-2 font-bold">{formatDate(complaint.date)}</p>
              )}
            </div>

            <div className="rounded-2xl bg-gray-50 p-4 print:border print:bg-white">
              <p className="text-xs font-bold uppercase tracking-wide text-gray-500">
                Complaint Type
              </p>
              {isEditing ? (
                <input
                  value={editForm.complaintType}
                  onChange={(event) =>
                    setEditForm((current) => ({
                      ...current,
                      complaintType: event.target.value,
                    }))
                  }
                  className="mt-2 w-full rounded-xl border border-gray-300 px-4 py-3 print:hidden"
                />
              ) : (
                <p className="mt-2 font-bold">
                  {clean(complaint.complaintType) || "-"}
                </p>
              )}
            </div>

            <div className="rounded-2xl bg-gray-50 p-4 print:border print:bg-white">
              <p className="text-xs font-bold uppercase tracking-wide text-gray-500">
                Status
              </p>
              {isEditing ? (
                <select
                  value={editForm.status}
                  onChange={(event) =>
                    setEditForm((current) => ({
                      ...current,
                      status: event.target.value,
                    }))
                  }
                  className="mt-2 w-full rounded-xl border border-gray-300 bg-white px-4 py-3 print:hidden"
                >
                  <option value="">Select Status</option>
                  <option value="Open">Open</option>
                  <option value="In Progress">In Progress</option>
                  <option value="Pending">Pending</option>
                  <option value="Needs Attention">Needs Attention</option>
                  <option value="Closed">Closed</option>
                  <option value="Resolved">Resolved</option>
                </select>
              ) : (
                <p className="mt-2 font-bold">
                  {clean(complaint.status) || "-"}
                </p>
              )}
            </div>

            <div className="rounded-2xl bg-gray-50 p-4 print:border print:bg-white">
              <p className="text-xs font-bold uppercase tracking-wide text-gray-500">
                Priority
              </p>
              {isEditing ? (
                <select
                  value={editForm.priority || editForm.severity}
                  onChange={(event) =>
                    setEditForm((current) => ({
                      ...current,
                      priority: event.target.value,
                      severity: event.target.value,
                    }))
                  }
                  className="mt-2 w-full rounded-xl border border-gray-300 bg-white px-4 py-3 print:hidden"
                >
                  <option value="">Select Priority</option>
                  <option value="Low">Low</option>
                  <option value="Medium">Medium</option>
                  <option value="High">High</option>
                  <option value="Urgent">Urgent</option>
                </select>
              ) : (
                <p className="mt-2 font-bold">
                  {clean(complaint.severity || complaint.priority) || "-"}
                </p>
              )}
            </div>

            <div className="rounded-2xl bg-gray-50 p-4 print:border print:bg-white">
              <p className="text-xs font-bold uppercase tracking-wide text-gray-500">
                Validity
              </p>
              {isEditing ? (
                <select
                  value={editForm.complaintValidity}
                  onChange={(event) =>
                    setEditForm((current) => ({
                      ...current,
                      complaintValidity: event.target.value,
                    }))
                  }
                  className="mt-2 w-full rounded-xl border border-gray-300 bg-white px-4 py-3 print:hidden"
                >
                  <option value="">Select Validity</option>
                  <option value="Needs Review">Needs Review</option>
                  <option value="Valid">Valid</option>
                  <option value="Not Valid">Not Valid</option>
                  <option value="Subjective">Subjective</option>
                </select>
              ) : (
                <p className="mt-2 font-bold">
                  {clean(complaint.complaintValidity) || "-"}
                </p>
              )}
            </div>

            <div className="rounded-2xl bg-gray-50 p-4 print:border print:bg-white">
              <p className="text-xs font-bold uppercase tracking-wide text-gray-500">
                Assigned To
              </p>
              {isEditing ? (
                <input
                  value={editForm.manager}
                  onChange={(event) =>
                    setEditForm((current) => ({
                      ...current,
                      manager: event.target.value,
                    }))
                  }
                  className="mt-2 w-full rounded-xl border border-gray-300 px-4 py-3 print:hidden"
                />
              ) : (
                <p className="mt-2 font-bold">
                  {clean(complaint.manager) ||
                    clean(complaint.subcontractor) ||
                    "-"}
                </p>
              )}
            </div>

            <div className="rounded-2xl bg-gray-50 p-4 print:border print:bg-white">
              <p className="text-xs font-bold uppercase tracking-wide text-gray-500">
                Follow-Up Date
              </p>
              {isEditing ? (
                <input
                  value={editForm.followUpDate}
                  onChange={(event) =>
                    setEditForm((current) => ({
                      ...current,
                      followUpDate: event.target.value,
                    }))
                  }
                  className="mt-2 w-full rounded-xl border border-gray-300 px-4 py-3 print:hidden"
                />
              ) : (
                <p className="mt-2 font-bold">
                  {formatDate(complaint.followUpDate)}
                </p>
              )}
            </div>

            <div className="rounded-2xl bg-gray-50 p-4 md:col-span-2 print:border print:bg-white">
              <p className="text-xs font-bold uppercase tracking-wide text-gray-500">
                Description
              </p>
              {isEditing ? (
                <textarea
                  value={editForm.description}
                  onChange={(event) =>
                    setEditForm((current) => ({
                      ...current,
                      description: event.target.value,
                    }))
                  }
                  rows={5}
                  className="mt-2 w-full rounded-xl border border-gray-300 px-4 py-3 print:hidden"
                />
              ) : (
                <p className="mt-2 whitespace-pre-wrap text-gray-800">
                  {clean(complaint.description) || "-"}
                </p>
              )}
            </div>

            <div className="rounded-2xl bg-gray-50 p-4 md:col-span-2 print:border print:bg-white">
              <p className="text-xs font-bold uppercase tracking-wide text-gray-500">
                Photos
              </p>

              {photoUrls.length === 0 ? (
                <p className="mt-2 text-gray-700">No photos attached.</p>
              ) : (
                <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {photoUrls.map((url, index) => {
                    const previewUrl = getGoogleDrivePreviewUrl(url);

                    return (
                      <div
                        key={`${url}-${index}`}
                        className="overflow-hidden rounded-2xl border border-gray-200 bg-white"
                      >
                        {isImageUrl(url) ? (
                          <a
                            href={url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="block"
                          >
                            <Image
                              src={previewUrl}
                              alt={`Complaint photo ${index + 1}`}
                              width={400}
                              height={224}
                              unoptimized
                              className="h-56 w-full object-cover"
                            />
                          </a>
                        ) : null}

                        <div className="p-3">
                          <a
                            href={url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-sm font-bold text-blue-700 hover:underline"
                          >
                            Open Photo {index + 1}
                          </a>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="rounded-2xl bg-gray-50 p-4 md:col-span-2 print:border print:bg-white">
              <p className="text-xs font-bold uppercase tracking-wide text-gray-500">
                Notes
              </p>
              {isEditing ? (
                <textarea
                  value={editForm.notes}
                  onChange={(event) =>
                    setEditForm((current) => ({
                      ...current,
                      notes: event.target.value,
                    }))
                  }
                  rows={4}
                  className="mt-2 w-full rounded-xl border border-gray-300 px-4 py-3 print:hidden"
                />
              ) : (
                <p className="mt-2 whitespace-pre-wrap text-gray-800">
                  {clean(complaint.notes) || "-"}
                </p>
              )}
            </div>

            <div className="rounded-2xl bg-gray-50 p-4 md:col-span-2 print:border print:bg-white">
              <p className="text-xs font-bold uppercase tracking-wide text-gray-500">
                Resolution
              </p>
              {isEditing ? (
                <textarea
                  value={editForm.resolution}
                  onChange={(event) =>
                    setEditForm((current) => ({
                      ...current,
                      resolution: event.target.value,
                    }))
                  }
                  rows={4}
                  className="mt-2 w-full rounded-xl border border-gray-300 px-4 py-3 print:hidden"
                />
              ) : (
                <p className="mt-2 whitespace-pre-wrap text-gray-800">
                  {clean(complaint.resolution) || "-"}
                </p>
              )}
            </div>

            <div className="rounded-2xl bg-gray-50 p-4 print:border print:bg-white">
              <p className="text-xs font-bold uppercase tracking-wide text-gray-500">
                Reported By
              </p>
              {isEditing ? (
                <input
                  value={editForm.reportedBy}
                  onChange={(event) =>
                    setEditForm((current) => ({
                      ...current,
                      reportedBy: event.target.value,
                    }))
                  }
                  className="mt-2 w-full rounded-xl border border-gray-300 px-4 py-3 print:hidden"
                />
              ) : (
                <p className="mt-2 font-bold">
                  {clean(complaint.reportedBy) || "-"}
                </p>
              )}
            </div>

            <div className="rounded-2xl bg-gray-50 p-4 print:border print:bg-white">
              <p className="text-xs font-bold uppercase tracking-wide text-gray-500">
                Complaint ID
              </p>
              <p className="mt-2 font-bold">
                {clean(complaint.id) || clean(complaint.rowNumber) || "-"}
              </p>
            </div>
          </div>

          {isEditing ? (
            <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-end print:hidden">
              <button
                type="button"
                onClick={cancelEditing}
                disabled={saving}
                className="rounded-xl border border-gray-300 bg-white px-4 py-3 font-bold text-gray-700 hover:bg-gray-50 disabled:opacity-60"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={saveComplaintChanges}
                disabled={saving}
                className="rounded-xl bg-blue-600 px-4 py-3 font-bold text-white hover:bg-blue-700 disabled:opacity-60"
              >
                {saving ? "Saving..." : "Save Changes"}
              </button>
            </div>
          ) : null}
        </section>
      )}
    </main>
  );
}