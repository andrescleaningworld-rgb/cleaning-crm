"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
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
import AccountLink from "../../components/AccountLink";
import AccountPickerField from "../../components/AccountPickerField";
import { ManagerOptions, useManagerNames } from "../../components/manager-options";

type Complaint = {
  rowNumber?: number | string;
  id?: string;
  date?: string;
  accountId?: string;
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

type HistoryEntry = { who: string; when: string; what: string };

// GET /api/complaints/<id> (lib/pg/complaint-detail.ts).
type DetailResponse = {
  success?: boolean;
  error?: string;
  complaint?: Complaint & { subAtFiling?: string | null };
  photos?: string[];
  history?: HistoryEntry[];
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

function formatWhen(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
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
  // "Assigned to": the active managers on the Staff list.
  const managerList = useManagerNames();
  const complaintId = decodeURIComponent(String(params.id || ""));

  const [complaint, setComplaint] = useState<(Complaint & { subAtFiling?: string | null }) | undefined>(undefined);
  const [photoUrls, setPhotoUrls] = useState<string[]>([]);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [showFullHistory, setShowFullHistory] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  const [isEditing, setIsEditing] = useState(false);
  const [resending, setResending] = useState(false);
  const [editForm, setEditForm] = useState({
    date: "",
    accountId: "",
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

  // One complaint, its photos and its edit history (GET /api/complaints/<id>).
  async function loadComplaints() {
    try {
      setLoading(true);
      setError("");

      const response = await fetch(`/api/complaints/${encodeURIComponent(complaintId)}`, { cache: "no-store" });
      const data = (await response.json().catch(() => ({}))) as DetailResponse;

      if (response.status === 404) {
        setComplaint(undefined);
        return;
      }
      if (!response.ok || data.success !== true || !data.complaint) {
        throw new Error(data.error || "The complaint did not load.");
      }

      setComplaint(data.complaint);
      setPhotoUrls(Array.isArray(data.photos) ? data.photos : []);
      setHistory(Array.isArray(data.history) ? data.history : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error loading complaint.");
      setComplaint(undefined);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadComplaints();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [complaintId]);

  function startEditing() {
    if (!complaint) return;

    setEditForm({
      date: clean(complaint.date),
      accountId: clean(complaint.accountId),
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
            accountId: editForm.accountId,
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

      // Only a real "saved" from the server counts (the server now updates this same complaint, or says why not).
      if (!response.ok || data.success !== true) {
        throw new Error(data.error || "The changes were not saved. Try again.");
      }

      setSuccessMessage(data.message || "Complaint updated.");
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
              { label: "Edit", onSelect: startEditing },
              { label: resending ? "Resending…" : "Resend subcontractor email", onSelect: () => void resendSubcontractorEmail() },
              { label: LABELS.print, onSelect: () => window.print() },
            ]}
          />
        ) : undefined
      }
      onEdit={complaint && !isEditing ? startEditing : undefined}
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
          <Card title={<AccountLink accountId={clean(complaint.accountId)} name={clean(complaint.accountName) || "No account"} />}>
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
                <dt>Sub at filing</dt>
                <dd>{clean(complaint.subAtFiling) || "Not recorded"}</dd>
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
              <>
                <p className="ui-card-text">Tap a picture to open it full size.</p>
                <div className="ui-photos" style={{ marginTop: 12 }}>
                  {photoUrls.map((url, index) => {
                    // Old Drive photos: the picture itself, not the Drive page.
                    const pictureUrl = getGoogleDrivePreviewUrl(url);
                    return (
                      <a key={`${url}-${index}`} href={pictureUrl} target="_blank" rel="noopener noreferrer" className="ui-photo" aria-label={`Open photo ${index + 1} full size`}>
                        <Image
                          src={pictureUrl}
                          alt={`Complaint photo ${index + 1}`}
                          width={280}
                          height={160}
                          unoptimized
                          style={{ width: "100%", height: 160, objectFit: "cover" }}
                        />
                      </a>
                    );
                  })}
                </div>
              </>
            )}
          </Card>

          {/* Who changed what and when (the activity log, written on every Save). */}
          <Card title="Edit History">
            {history.length === 0 ? (
              <p className="ui-card-text">No changes recorded yet.</p>
            ) : (
              <>
                <ul className="ui-list-plain">
                  {(showFullHistory ? history : history.slice(0, 3)).map((entry, index) => (
                    <li key={`${entry.when}-${index}`} className="ui-stack" style={{ padding: "8px 0", borderBottom: "1px solid var(--ui-line, #e5e7eb)" }}>
                      <p className="ui-strong">
                        {entry.who} · <span className="ui-muted">{formatWhen(entry.when)}</span>
                      </p>
                      <ul className="ui-list-plain">
                        {entry.what.split("; ").map((part, partIndex) => (
                          <li key={partIndex} className="ui-card-text">
                            {part}
                          </li>
                        ))}
                      </ul>
                    </li>
                  ))}
                </ul>
                {history.length > 3 ? (
                  <div style={{ marginTop: 12 }}>
                    <BigButton kind="quiet" onClick={() => setShowFullHistory((value) => !value)} aria-expanded={showFullHistory}>
                      {showFullHistory ? "Hide full history" : `Show full history (${history.length})`}
                    </BigButton>
                  </div>
                ) : null}
              </>
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
        {/* The account picker: an older complaint with only a name keeps it, and links when exactly one account has that name. */}
        <AccountPickerField
          label="Account"
          includeCancelled
          value={editForm.accountName || editForm.accountId ? { id: editForm.accountId, name: editForm.accountName } : null}
          onChange={(next) => setEditForm((current) => ({ ...current, accountId: next?.id ?? "", accountName: next?.name ?? "" }))}
        />
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
        <SelectField label="Assigned to" optional value={editForm.manager} onChange={set("manager")}>
          <option value="">{managerList.loading ? "Loading managers…" : "No one"}</option>
          <ManagerOptions names={managerList.names} current={editForm.manager} />
        </SelectField>
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
