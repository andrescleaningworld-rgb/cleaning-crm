"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import {
  BigButton,
  Card,
  EmptyState,
  ErrorBox,
  Field,
  LABELS,
  MoreMenu,
  Screen,
  SelectField,
  Sheet,
  SkeletonList,
  StatusPill,
  TextAreaField,
  type StatusKind,
} from "@/app/ui";
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
  notification?: {
    sent?: boolean;
    reason?: string;
  };
};

function clean(value: unknown): string {
  return String(value ?? "").trim();
}

function formatDate(value: unknown): string {
  const text = clean(value);

  if (!text) return "No date";

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

function statusKind(status: unknown): StatusKind {
  const value = clean(status).toLowerCase();
  if (value.includes("resolved") || value.includes("closed")) return "done";
  if (value.includes("open") || !value) return "needs-you";
  if (value.includes("progress") || value.includes("pending") || value.includes("review")) return "waiting";
  return "off";
}

function priorityKind(severity: unknown): StatusKind {
  const value = clean(severity).toLowerCase();
  if (value.includes("high") || value.includes("urgent")) return "needs-you";
  if (value.includes("medium")) return "waiting";
  if (value.includes("low")) return "done";
  return "off";
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
  const [resending, setResending] = useState(false);
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

  async function resendSubcontractorEmail() {
    if (!complaint) return;

    try {
      setResending(true);
      setError("");
      setSuccessMessage("");

      const response = await fetch("/api/complaints", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "resendComplaintNotification",
          complaint: {
            rowNumber: complaint.rowNumber || "",
            id: complaint.id || "",
          },
        }),
      });

      const text = await response.text();

      let data: SaveResponse;

      try {
        data = JSON.parse(text) as SaveResponse;
      } catch {
        throw new Error(
          "Complaints API did not return valid JSON while resending the email."
        );
      }

      if (!response.ok || data.success === false) {
        throw new Error(data.error || "Failed to resend subcontractor email.");
      }

      if (data.notification?.sent) {
        setSuccessMessage(
          `Email sent to ${clean(complaint.subcontractor) || "the subcontractor"}.`
        );
      } else {
        setError(
          data.notification?.reason
            ? `Not sent: ${data.notification.reason}`
            : "Not sent: unknown reason."
        );
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unknown error resending subcontractor email."
      );
    } finally {
      setResending(false);
    }
  }

  const set = (key: keyof typeof editForm) => (event: { target: { value: string } }) =>
    setEditForm((current) => ({ ...current, [key]: event.target.value }));
  const priority = complaint ? clean(complaint.severity || complaint.priority) : "";

  return (
    <Screen
      title={complaint ? clean(complaint.accountName) || "No account" : "Complaint"}
      subtitle={complaint ? `${formatDate(complaint.date)}${clean(complaint.complaintType) ? ` · ${clean(complaint.complaintType)}` : ""}` : undefined}
      backHref="/complaints"
      headerRight={
        complaint ? (
          <MoreMenu
            items={[
              { label: resending ? "Resending…" : "Resend subcontractor email", onSelect: () => void resendSubcontractorEmail() },
              { label: LABELS.print, onSelect: () => window.print() },
            ]}
          />
        ) : undefined
      }
      action={complaint ? <BigButton onClick={startEditing}>Edit complaint</BigButton> : undefined}
    >
      {error && complaint && !isEditing ? <ErrorBox title="That did not work." text={error} /> : null}
      {successMessage ? (
        <p className="ui-savestatus ui-savestatus-saved" role="status">
          {successMessage}
        </p>
      ) : null}

      {loading ? (
        <SkeletonList rows={3} />
      ) : error && !complaint ? (
        <ErrorBox title="The complaint did not load." text={error} onRetry={() => void loadComplaints()} />
      ) : !complaint ? (
        <EmptyState
          title="Complaint not found"
          text="This complaint may have been deleted, or the link may not match the current list."
          action={
            <BigButton kind="second" href="/complaints">
              Back to Complaints
            </BigButton>
          }
        />
      ) : (
        <div className="ui-print-view ui-screen-body">
          <Card title={clean(complaint.accountName) || "No account"}>
            <div className="ui-actions-row" style={{ marginTop: 4 }}>
              <StatusPill kind={statusKind(complaint.status)}>{clean(complaint.status) || "Open"}</StatusPill>
              <StatusPill kind={priorityKind(priority)}>{priority ? `${priority} priority` : "No priority"}</StatusPill>
              <StatusPill kind="off">{clean(complaint.complaintValidity) || "Needs Review"}</StatusPill>
            </div>
            <dl className="ui-details">
              <div className="ui-detail">
                <dt>Date</dt>
                <dd>{formatDate(complaint.date)}</dd>
              </div>
              <div className="ui-detail">
                <dt>Complaint Type</dt>
                <dd>{clean(complaint.complaintType) || "None"}</dd>
              </div>
              <div className="ui-detail">
                <dt>Assigned To</dt>
                <dd>{clean(complaint.manager) || clean(complaint.subcontractor) || "No one"}</dd>
              </div>
              <div className="ui-detail">
                <dt>Reported By</dt>
                <dd>{clean(complaint.reportedBy) || "Not recorded"}</dd>
              </div>
              <div className="ui-detail">
                <dt>Follow-Up Date</dt>
                <dd>{clean(complaint.followUpDate) ? formatDate(complaint.followUpDate) : "None"}</dd>
              </div>
              <div className="ui-detail ui-detail-full">
                <dt>Description</dt>
                <dd style={{ whiteSpace: "pre-wrap" }}>{clean(complaint.description) || "None"}</dd>
              </div>
              <div className="ui-detail ui-detail-full">
                <dt>Notes</dt>
                <dd style={{ whiteSpace: "pre-wrap" }}>{clean(complaint.notes) || "None"}</dd>
              </div>
              <div className="ui-detail ui-detail-full">
                <dt>Resolution</dt>
                <dd style={{ whiteSpace: "pre-wrap" }}>{clean(complaint.resolution) || "None"}</dd>
              </div>
            </dl>
          </Card>

          <Card title="Photos">
            {photoUrls.length === 0 ? (
              <p className="ui-card-text">No photos attached.</p>
            ) : (
              <div className="ui-three" style={{ marginTop: 12 }}>
                {photoUrls.map((url, index) => {
                  const previewUrl = getGoogleDrivePreviewUrl(url);
                  return (
                    <div key={`${url}-${index}`}>
                      {isImageUrl(url) ? (
                        <a href={url} target="_blank" rel="noopener noreferrer" className="ui-photo" style={{ display: "block", aspectRatio: "16 / 9" }}>
                          <Image src={previewUrl} alt={`Complaint photo ${index + 1}`} width={400} height={224} unoptimized />
                        </a>
                      ) : null}
                      <a href={url} target="_blank" rel="noopener noreferrer" className="ui-btn ui-btn-quiet">
                        Open photo {index + 1}
                      </a>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
        </div>
      )}

      <Sheet
        open={isEditing && complaint !== undefined}
        title="Edit complaint"
        text="Fix typos or update complaint details, then tap Save changes."
        onClose={cancelEditing}
        busy={saving}
        actions={
          <BigButton busy={saving} busyLabel="Saving…" onClick={() => void saveComplaintChanges()}>
            Save changes
          </BigButton>
        }
      >
        <Field label="Account" value={editForm.accountName} onChange={set("accountName")} />
        <Field label="Date" value={editForm.date} onChange={set("date")} />
        <Field label="Complaint type" optional value={editForm.complaintType} onChange={set("complaintType")} />
        <SelectField label="Status" value={editForm.status} onChange={set("status")}>
          <option value="">Select Status</option>
          <option value="Open">Open</option>
          <option value="In Progress">In Progress</option>
          <option value="Pending">Pending</option>
          <option value="Needs Attention">Needs Attention</option>
          <option value="Closed">Closed</option>
          <option value="Resolved">Resolved</option>
        </SelectField>
        <SelectField
          label="Priority"
          value={editForm.priority || editForm.severity}
          onChange={(event) => setEditForm((current) => ({ ...current, priority: event.target.value, severity: event.target.value }))}
        >
          <option value="">Select Priority</option>
          <option value="Low">Low</option>
          <option value="Medium">Medium</option>
          <option value="High">High</option>
          <option value="Urgent">Urgent</option>
        </SelectField>
        <SelectField label="Validity" value={editForm.complaintValidity} onChange={set("complaintValidity")}>
          <option value="">Select Validity</option>
          <option value="Needs Review">Needs Review</option>
          <option value="Valid">Valid</option>
          <option value="Not Valid">Not Valid</option>
          <option value="Subjective">Subjective</option>
        </SelectField>
        <Field label="Assigned to" optional value={editForm.manager} onChange={set("manager")} />
        <Field label="Follow-up date" optional value={editForm.followUpDate} onChange={set("followUpDate")} />
        <TextAreaField label="Description" rows={5} value={editForm.description} onChange={set("description")} />
        <TextAreaField label="Notes" optional rows={4} value={editForm.notes} onChange={set("notes")} />
        <TextAreaField label="Resolution" optional rows={4} value={editForm.resolution} onChange={set("resolution")} />
        <Field label="Reported by" optional value={editForm.reportedBy} onChange={set("reportedBy")} />
        {error ? <ErrorBox title="The changes were not saved." text={error} /> : null}
      </Sheet>
    </Screen>
  );
}
