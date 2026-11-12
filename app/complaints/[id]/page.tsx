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
import { useParams, useRouter } from "next/navigation";
import AccountLink from "../../components/AccountLink";
import AccountPickerField from "../../components/AccountPickerField";
import { ManagerOptions, useManagerNames } from "../../components/manager-options";
import { ResponseClock } from "../../components/response-clock";
import { complaintIsOpen } from "@/lib/responseClock";
import { EMPTY_FIX_PROOF, FixProofFields, fixProofProblem, uploadFixPhotos, type FixProof } from "../../components/fix-proof";
import PizzaTracker from "../../components/pizza-tracker";
import { Switch } from "@/app/settings/reminders/sections";
import { COMPLAINT_STEPS, isReviewStatus, type ComplaintTrackView } from "@/lib/complaintSteps";

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

/** One time the sub was told: email or text, sent / failed / skipped (complaint_events). */
type SubNotice = { channel: string; status: string; detail: string; by: string; at: string };

/** The customer added notes / photos, or a merge into / out of this complaint (complaint_events). */
type Addition = { kind: string; detail: string; photos: string[]; by: string; at: string };

/** Another complaint on the same account that this one can be merged into. */
type MergeTarget = { key: string; day: string; text: string; status: string };

// GET /api/complaints/<id> (lib/pg/complaint-detail.ts).
type DetailResponse = {
  success?: boolean;
  error?: string;
  complaint?: Complaint & { subAtFiling?: string | null };
  photos?: string[];
  history?: HistoryEntry[];
  subNotices?: SubNotice[];
  additions?: Addition[];
  mergeTargets?: MergeTarget[];
  fixes?: Addition[];
  /** The 5-step tracker (lib/complaintSteps.ts); null for a merged complaint. */
  track?: ComplaintTrackView | null;
  /** "Customer sees this" is off: not on the customer's portal, no customer email on close. */
  hiddenFromCustomer?: boolean;
  /** What the customer was sent on "Close & send to customer" (latest). */
  customerFix?: { note: string; photos: string[]; at: string; editedAt: string } | null;
};

/** The after photos, each with "Customer sees it" / "Hidden" (the review, and "Edit what the customer sees"). */
function PhotoToggles({ urls, hidden, onChange, canToggle }: { urls: string[]; hidden: Set<string>; onChange: (next: Set<string>) => void; canToggle: boolean }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 10 }}>
      {urls.map((url, index) => {
        const off = hidden.has(barePhoto(url));
        return (
          <div key={url} className="ui-stack" style={{ gap: 6 }}>
            <a href={url} target="_blank" rel="noopener noreferrer" className="ui-photo" aria-label={`Open after photo ${index + 1} full size`} style={{ opacity: off ? 0.4 : 1 }}>
              <Image src={url} alt={`After photo ${index + 1}`} width={200} height={140} unoptimized style={{ width: "100%", height: 140, objectFit: "cover" }} />
            </a>
            {canToggle ? (
              <button
                type="button"
                aria-pressed={!off}
                className={`ui-pick ${off ? "" : "ui-pick-on"}`.trim()}
                onClick={() => {
                  const next = new Set(hidden);
                  if (next.has(barePhoto(url))) next.delete(barePhoto(url));
                  else next.add(barePhoto(url));
                  onChange(next);
                }}
              >
                <span className="min-w-0 flex-1 ui-strong">{off ? "Hidden" : "Customer sees it"}</span>
                <span className="ui-pick-mark" aria-hidden="true">
                  ✓
                </span>
              </button>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

/** The team's note as the customer reads it: without "Resolved by <team name>: " in front. */
const customerNoteOf = (resolution: unknown) =>
  String(resolution ?? "")
    .trim()
    .replace(/^resolved by [^:\n]{1,80}:\s*/i, "")
    .trim();
/** A photo link without its signature (?e=…&s=…), to compare two links to the same file. */
const barePhoto = (url: string) => url.split("?")[0];

const NOTICE_WORD: Record<string, string> = { sent: "Sent", failed: "Failed", skipped: "Not sent" };

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
  const [subNotices, setSubNotices] = useState<SubNotice[]>([]);
  const [additions, setAdditions] = useState<Addition[]>([]);
  const [mergeTargets, setMergeTargets] = useState<MergeTarget[]>([]);
  const [merging, setMerging] = useState(false);
  const [mergePick, setMergePick] = useState("");
  const [mergeBusy, setMergeBusy] = useState(false);
  const [mergeError, setMergeError] = useState("");
  const [acking, setAcking] = useState(false);
  // "Mark fixed": proof of fix (after photos, or "No photo needed" and why).
  const [fixProof, setFixProof] = useState<FixProof>(EMPTY_FIX_PROOF);
  const [fixNote, setFixNote] = useState("");
  const [fixBusy, setFixBusy] = useState(false);
  const [fixError, setFixError] = useState("");
  const [fixes, setFixes] = useState<Addition[]>([]);
  // The tracker, "Hide from customer", and the photos the office hides on "Close & send to customer".
  const [track, setTrack] = useState<ComplaintTrackView | null>(null);
  const [hiddenFromCustomer, setHiddenFromCustomer] = useState(false);
  const [customerFix, setCustomerFix] = useState<DetailResponse["customerFix"]>(null);
  const [hiddenPhotos, setHiddenPhotos] = useState<Set<string>>(new Set());
  const [visibilityBusy, setVisibilityBusy] = useState(false);
  // "Edit what the customer sees" on a closed complaint.
  const [editingCustomer, setEditingCustomer] = useState(false);
  const [customerDraft, setCustomerDraft] = useState("");
  const [customerDraftHidden, setCustomerDraftHidden] = useState<Set<string>>(new Set());
  const [customerBusy, setCustomerBusy] = useState(false);
  const [customerError, setCustomerError] = useState("");
  const afterUrls = [...new Set(fixes.flatMap((fix) => fix.photos))];
  const noPhotoReasons = fixes.filter((fix) => fix.photos.length === 0 && fix.detail).map((fix) => fix.detail);
  const router = useRouter();
  // "Send again?": shown when the sub was already told once.
  const [confirmNotify, setConfirmNotify] = useState(false);
  const lastNotified = subNotices.find((notice) => notice.status === "sent")?.at ?? "";
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
      setSubNotices(Array.isArray(data.subNotices) ? data.subNotices : []);
      setAdditions(Array.isArray(data.additions) ? data.additions : []);
      setMergeTargets(Array.isArray(data.mergeTargets) ? data.mergeTargets : []);
      setFixes(Array.isArray(data.fixes) ? data.fixes : []);
      setTrack(data.track ?? null);
      setHiddenFromCustomer(data.hiddenFromCustomer === true);
      setCustomerFix(data.customerFix ?? null);
      // Ready to review: the team's note, prefilled for the customer (no team name).
      if (isReviewStatus(data.complaint.status)) setFixNote((current) => current || customerNoteOf(data.complaint?.resolution));
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

  // The "Ready to review" email and push open /complaints/<id>#review: go straight to the review.
  useEffect(() => {
    if (loading || !complaint || window.location.hash !== "#review") return;
    document.getElementById("review")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [loading, complaint]);

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

  // "Close & send to customer" (or "Mark fixed" when hidden from the customer):
  // closes it with proof of fix (the server checks the proof too), and sends
  // the customer the note and the photos not hidden. The button is the approval.
  async function markFixed() {
    if (!complaint) return;
    if (!fixNote.trim()) return setFixError(hiddenFromCustomer ? "Say what was done." : "Write what was done, for the customer.");
    const review = isReviewStatus(complaint.status);
    // Already has proof (the sub's after photo): no new photo needed.
    const problem = fixes.length > 0 ? "" : fixProofProblem(fixProof);
    if (problem) return setFixError(problem);
    setFixBusy(true);
    setFixError("");
    try {
      const key = clean(complaint.id) || clean(complaint.rowNumber);
      const fixPhotos = fixProof.noPhoto ? [] : await uploadFixPhotos(key, fixProof.files);
      const response = await fetch("/api/complaints", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "closeComplaint",
          // Ready to review: the team's own resolution text stays (empty keeps it); the edited note goes to the customer.
          complaint: { rowNumber: complaint.rowNumber || "", id: complaint.id || "", status: "Closed", resolution: review ? "" : fixNote.trim() },
          fixPhotos,
          noPhotoReason: fixProof.noPhoto ? fixProof.reason.trim() : "",
          sendToCustomer: true,
          customerNote: fixNote.trim(),
          hidePhotos: [...hiddenPhotos],
        }),
      });
      const data = (await response.json().catch(() => ({}))) as { success?: boolean; error?: string; customerEmail?: string; hidden?: boolean };
      if (!response.ok || data.success !== true) throw new Error(data.error || "Not closed. Try again.");
      setFixProof(EMPTY_FIX_PROOF);
      setFixNote("");
      setHiddenPhotos(new Set());
      setSuccessMessage(
        data.hidden
          ? "Fixed and closed. Hidden from the customer: nothing was sent."
          : data.customerEmail === "sent"
            ? "Closed. The customer sees it as Fixed and got the email."
            : "Closed. The customer sees it as Fixed in the portal. The email was not sent (no email on the account, or sending failed)."
      );
      await loadComplaints();
    } catch (err) {
      setFixError(err instanceof Error ? err.message : "Not closed. Try again.");
    } finally {
      setFixBusy(false);
    }
  }

  // What the customer reads now under "How we fixed it": what the office sent / last changed,
  // else (closed before Nov 12, 2026, or from Edit) the resolution note and every after photo.
  const customerNoteNow = customerFix ? customerFix.note : customerNoteOf(complaint?.resolution);
  const customerPhotosNow = customerFix ? customerFix.photos : afterUrls;

  function startCustomerEdit() {
    const shown = new Set(customerPhotosNow.map(barePhoto));
    setCustomerDraft(customerNoteNow);
    setCustomerDraftHidden(new Set(afterUrls.map(barePhoto).filter((url) => !shown.has(url))));
    setCustomerError("");
    setEditingCustomer(true);
  }

  // "Edit what the customer sees" → Save: new wording / photos on the portal. No email.
  async function saveCustomerFix() {
    if (!complaint) return;
    if (!customerDraft.trim()) return setCustomerError("Write what was done, for the customer.");
    setCustomerBusy(true);
    setCustomerError("");
    try {
      const response = await fetch("/api/complaints", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "editCustomerFix",
          complaint: { id: complaint.id || "", rowNumber: complaint.rowNumber || "" },
          customerNote: customerDraft.trim(),
          hidePhotos: [...customerDraftHidden],
        }),
      });
      const data = (await response.json().catch(() => ({}))) as { success?: boolean; error?: string; message?: string };
      if (!response.ok || data.success !== true) throw new Error(data.error || "Not saved. Try again.");
      setEditingCustomer(false);
      setSuccessMessage(data.message || "Saved.");
      await loadComplaints();
    } catch (err) {
      setCustomerError(err instanceof Error ? err.message : "Not saved. Try again.");
    } finally {
      setCustomerBusy(false);
    }
  }

  // "Hide from customer" / "Show to customer": whether this complaint shows on the customer's portal.
  async function setCustomerVisibility(hidden: boolean) {
    if (!complaint) return;
    setVisibilityBusy(true);
    setError("");
    try {
      const response = await fetch("/api/complaints", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "customerVisibility", hidden, complaint: { id: complaint.id || "", rowNumber: complaint.rowNumber || "" } }),
      });
      const data = (await response.json().catch(() => ({}))) as { success?: boolean; error?: string; message?: string };
      if (!response.ok || data.success !== true) throw new Error(data.error || "Not saved. Try again.");
      setHiddenFromCustomer(hidden);
      setSuccessMessage(data.message || "Saved.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Not saved. Try again.");
    } finally {
      setVisibilityBusy(false);
    }
  }

  // "Got it": answers the complaint without changing anything else (the response clock stops).
  async function acknowledge() {
    if (!complaint) return;
    setAcking(true);
    setError("");
    try {
      const response = await fetch("/api/complaints", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "acknowledge", complaint: { id: complaint.id || "", rowNumber: complaint.rowNumber || "" } }),
      });
      const data = (await response.json().catch(() => ({}))) as { success?: boolean; error?: string };
      if (!response.ok || data.success !== true) throw new Error(data.error || "Not saved. Try again.");
      setSuccessMessage("Got it. The clock stopped.");
      await loadComplaints();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Not saved. Try again.");
    } finally {
      setAcking(false);
    }
  }

  // "Merge into another complaint": this one's text and photos go into the picked one; this one is closed as Merged.
  async function mergeInto() {
    if (!complaint || !mergePick) return;
    setMergeBusy(true);
    setMergeError("");
    try {
      const response = await fetch("/api/complaints", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "mergeComplaint", from: complaint.id || String(complaint.rowNumber ?? ""), into: mergePick }),
      });
      const data = (await response.json().catch(() => ({}))) as { success?: boolean; error?: string; intoKey?: string };
      if (!response.ok || data.success !== true || !data.intoKey) throw new Error(data.error || "The complaints were not merged.");
      setMerging(false);
      router.push(`/complaints/${encodeURIComponent(data.intoKey)}`);
    } catch (err) {
      setMergeError(err instanceof Error ? err.message : "The complaints were not merged.");
    } finally {
      setMergeBusy(false);
    }
  }

  /** "Notify sub": asks "Send again?" first when the sub was already told. */
  function askNotifySub() {
    if (lastNotified) setConfirmNotify(true);
    else void notifySub();
  }

  // Email + text to the account's sub (POST /api/complaints, action "notifySub"); each try is written on the complaint.
  async function notifySub() {
    if (!complaint) return;
    setConfirmNotify(false);

    try {
      setResending(true);
      setError("");
      setSuccessMessage("");

      const response = await fetch("/api/complaints", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "notifySub", complaint: { rowNumber: complaint.rowNumber || "", id: complaint.id || "" } }),
      });
      const data = (await response.json().catch(() => ({}))) as SaveResponse & {
        result?: { email: string; text: string; subName: string; reasons: string[] };
      };
      if (!response.ok || data.success !== true || !data.result) {
        throw new Error(data.error || "The notice was not sent. Try again.");
      }

      const { email, text, subName, reasons } = data.result;
      const parts = [email === "sent" ? "email" : "", text === "sent" ? "text" : ""].filter(Boolean);
      if (parts.length > 0) {
        setSuccessMessage(`${subName || "The sub"} was notified by ${parts.join(" and ")}.${reasons.length ? ` (${reasons.join(" ")})` : ""}`);
      } else {
        setError(`Not sent: ${reasons.join(" ") || "unknown reason."}`);
      }
      await loadComplaints();
    } catch (err) {
      setError(err instanceof Error ? err.message : "The notice was not sent.");
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
              { label: resending ? "Sending…" : "Notify sub", onSelect: askNotifySub },
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
              <ResponseClock createdAt={clean(complaint.createdAt)} answeredAt={complaint.firstResponseAt === undefined ? undefined : String(complaint.firstResponseAt)} status={clean(complaint.status)} />
            </div>
            {/* Where it stands: Received → Sent to team → Team on it → Ready to review → Fixed, and who it waits on. */}
            {track ? (
              <div style={{ marginTop: 12 }}>
                <PizzaTracker view={track} size="list" steps={COMPLAINT_STEPS} label="Complaint steps" finish="Fixed" formatWhen={formatWhen} />
              </div>
            ) : null}
            {/* Still waiting for a first answer: one tap says "we are on it" (stops the clock). */}
            {complaint.firstResponseAt === "" && complaintIsOpen(complaint.status) ? (
              <div style={{ marginTop: 12 }}>
                <BigButton busy={acking} busyLabel="Saving…" onClick={() => void acknowledge()}>
                  ✓ Got it
                </BigButton>
              </div>
            ) : null}
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
              {clean(complaint.firstResponseAt) && complaint.firstResponseAt !== "none" ? (
                <div className="ui-detail">
                  <dt>First answer</dt>
                  <dd>
                    {formatWhen(clean(complaint.firstResponseAt))}
                    {clean(complaint.firstResponseBy) ? ` · ${clean(complaint.firstResponseBy)}` : ""}
                  </dd>
                </div>
              ) : null}
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

          {/* Merged into another complaint: say where it went. */}
          {/^merged/i.test(clean(complaint.status)) ? (
            <Card title="Merged">
              <p className="ui-card-text">This complaint was merged into another one. It does not count on its own.</p>
              {(() => {
                const into = /Merged into complaint (\S+?)\.?(?:\s|$)/.exec(clean(complaint.notes))?.[1] ?? "";
                return into ? (
                  <div style={{ marginTop: 12 }}>
                    <BigButton href={`/complaints/${encodeURIComponent(into)}`}>Open the main complaint</BigButton>
                  </div>
                ) : null;
              })()}
            </Card>
          ) : null}

          {/* What the customer added from the portal, and merges (newest first). */}
          {additions.length > 0 ? (
            <Card title="Added later">
              <ul className="ui-list-plain">
                {additions.map((item, index) => (
                  <li key={`${item.at}-${index}`} className="ui-stack" style={{ padding: "8px 0", borderBottom: "1px solid var(--ui-line-soft)" }}>
                    <p className="ui-strong">
                      {item.kind === "customer_added" ? "The customer added" : item.kind === "merged_from" ? "Merged in" : "Merged out"} ·{" "}
                      <span className="ui-muted">{formatWhen(item.at)}</span>
                    </p>
                    {item.detail ? (
                      <p className="ui-card-text" style={{ whiteSpace: "pre-wrap" }}>
                        {item.detail}
                      </p>
                    ) : null}
                    {item.kind === "merged_from" || item.kind === "merged_into" ? (
                      <p className="ui-muted">by {item.by}</p>
                    ) : null}
                    {item.photos.length > 0 ? (
                      <div className="ui-photos">
                        {item.photos.map((url, photoIndex) => (
                          <a key={`${url}-${photoIndex}`} href={getGoogleDrivePreviewUrl(url)} target="_blank" rel="noopener noreferrer" className="ui-photo" aria-label={`Open photo ${photoIndex + 1} full size`}>
                            <Image src={getGoogleDrivePreviewUrl(url)} alt={`Added photo ${photoIndex + 1}`} width={200} height={120} unoptimized style={{ width: "100%", height: 120, objectFit: "cover" }} />
                          </a>
                        ))}
                      </div>
                    ) : null}
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}

          {/* Tell the account's sub: email + text (sent by itself when the complaint is made; by hand here any time). */}
          <Card title="Sub">
            <p className="ui-card-text">
              {lastNotified ? `Last notified: ${formatWhen(lastNotified)}` : "Not notified yet."}
            </p>
            <div style={{ marginTop: 12 }}>
              <BigButton busy={resending} busyLabel="Sending…" onClick={askNotifySub}>
                {lastNotified ? "Notify sub again" : "Notify sub"}
              </BigButton>
            </div>
            {subNotices.length > 0 ? (
              <ul className="ui-list-plain" style={{ marginTop: 12 }}>
                {subNotices.slice(0, 6).map((notice, index) => (
                  <li key={`${notice.at}-${notice.channel}-${index}`} className="ui-card-text">
                    {formatWhen(notice.at)} · {notice.channel === "text" ? "Text" : "Email"}: {NOTICE_WORD[notice.status] ?? notice.status}
                    {notice.detail ? ` (${notice.detail})` : ""}
                    {notice.by && notice.by !== "System" ? ` · by ${notice.by}` : ""}
                  </li>
                ))}
              </ul>
            ) : null}
          </Card>

          {/* Still open, or Ready to review (the team marked it resolved): the review, then close it.
              The note and the photos left on are what the customer sees and gets by email. */}
          {complaintIsOpen(complaint.status) || isReviewStatus(complaint.status) ? (
            <div id="review" style={{ scrollMarginTop: 16 }}>
              <Card title={isReviewStatus(complaint.status) ? "Ready to review" : "Mark fixed"}>
                <div className="ui-stack">
                  {isReviewStatus(complaint.status) ? (
                    <p className="ui-card-text">The team says it is fixed. Check the note and the photos. The customer sees &quot;Team on it&quot; until you close it.</p>
                  ) : null}
                  <TextAreaField
                    label={hiddenFromCustomer ? "What was done?" : "What was done? (the customer sees this)"}
                    rows={4}
                    value={fixNote}
                    onChange={(event) => setFixNote(event.target.value)}
                  />
                  {afterUrls.length > 0 ? (
                    <div className="ui-stack">
                      <p className="ui-strong">{hiddenFromCustomer ? "After photos" : "After photos: tap one off if the customer should not see it"}</p>
                      <PhotoToggles urls={afterUrls} hidden={hiddenPhotos} onChange={setHiddenPhotos} canToggle={!hiddenFromCustomer} />
                      <p className="ui-muted">More photos (optional):</p>
                    </div>
                  ) : null}
                  <FixProofFields value={fixProof} onChange={setFixProof} />
                  {fixError ? <ErrorBox title="Not closed." text={fixError} /> : null}
                  <BigButton busy={fixBusy} busyLabel="Closing…" onClick={() => void markFixed()}>
                    {hiddenFromCustomer ? "✓ Mark fixed" : "✓ Close & send to customer"}
                  </BigButton>
                </div>
              </Card>
            </div>
          ) : null}

          {/* The customer's portal: every complaint on the account shows there (Received → Team on it → Fixed), unless hidden here. */}
          {!/^merged/i.test(clean(complaint.status)) ? (
            <Card title="Customer portal">
              <Switch
                label="Customer sees this"
                text={
                  hiddenFromCustomer
                    ? "Off: the customer does not see this complaint, and closing it sends them nothing."
                    : "On: the customer sees this complaint and where it stands (Received → Team on it → Fixed). Never Ready to review, notes, the team's name or the score."
                }
                on={!hiddenFromCustomer}
                canEdit={!visibilityBusy}
                onChange={(on) => void setCustomerVisibility(!on)}
              />
              {/* Closed: what the customer reads under "How we fixed it", and a way to change it (no email). */}
              {track?.step === "fixed" && !hiddenFromCustomer ? (
                <div className="ui-stack" style={{ marginTop: 16, paddingTop: 12, borderTop: "1px solid var(--ui-line-soft)" }}>
                  <p className="ui-strong">What the customer sees under &quot;How we fixed it&quot;</p>
                  {editingCustomer ? (
                    <>
                      <TextAreaField label="Wording for the customer" rows={4} value={customerDraft} onChange={(event) => setCustomerDraft(event.target.value)} />
                      {afterUrls.length > 0 ? (
                        <>
                          <p className="ui-strong">Photos: tap one off if the customer should not see it</p>
                          <PhotoToggles urls={afterUrls} hidden={customerDraftHidden} onChange={setCustomerDraftHidden} canToggle />
                        </>
                      ) : null}
                      {customerError ? <ErrorBox title="Not saved." text={customerError} /> : null}
                      <BigButton busy={customerBusy} busyLabel="Saving…" onClick={() => void saveCustomerFix()}>
                        Save (no email is sent)
                      </BigButton>
                      <BigButton kind="quiet" disabled={customerBusy} onClick={() => setEditingCustomer(false)}>
                        Cancel
                      </BigButton>
                    </>
                  ) : (
                    <>
                      <p className="ui-card-text" style={{ whiteSpace: "pre-wrap" }}>
                        {customerNoteNow || "(no note)"}
                      </p>
                      <p className="ui-muted">
                        {customerPhotosNow.length} photo{customerPhotosNow.length === 1 ? "" : "s"}
                        {customerFix ? ` · sent ${formatWhen(customerFix.at)}` : ""}
                        {customerFix?.editedAt ? ` · changed ${formatWhen(customerFix.editedAt)}` : ""}
                      </p>
                      <BigButton kind="second" onClick={startCustomerEdit}>
                        Edit what the customer sees
                      </BigButton>
                    </>
                  )}
                </div>
              ) : null}
            </Card>
          ) : null}

          {/* The same problem logged twice on this account: fold this one into the other. */}
          {!/^merged/i.test(clean(complaint.status)) && mergeTargets.length > 0 ? (
            <Card title="Same problem twice?">
              <p className="ui-card-text">Move this complaint into another one on this account. It closes as Merged and does not count.</p>
              <div style={{ marginTop: 12 }}>
                <BigButton
                  kind="second"
                  onClick={() => {
                    setMergePick("");
                    setMergeError("");
                    setMerging(true);
                  }}
                >
                  Merge into another complaint
                </BigButton>
              </div>
            </Card>
          ) : null}

          {/* Before (what was reported) and After (proof of fix), side by side. */}
          <Card title="Photos">
            {photoUrls.length === 0 && afterUrls.length === 0 && noPhotoReasons.length === 0 ? (
              <p className="ui-card-text">No photos attached.</p>
            ) : (
              <>
                <p className="ui-card-text">Tap a picture to open it full size.</p>
                <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)", gap: 12, marginTop: 12, alignItems: "start" }}>
                  {[
                    { title: "Before", urls: photoUrls, empty: "No photos." },
                    { title: "After", urls: afterUrls, empty: noPhotoReasons.length > 0 ? noPhotoReasons.join(" ") : "Not fixed yet." },
                  ].map((side) => (
                    <div key={side.title} className="ui-stack">
                      <p className="ui-strong">{side.title}</p>
                      {side.urls.length === 0 ? <p className="ui-muted">{side.empty}</p> : null}
                      {side.urls.map((url, index) => {
                        // Old Drive photos: the picture itself, not the Drive page.
                        const pictureUrl = getGoogleDrivePreviewUrl(url);
                        return (
                          <a key={`${url}-${index}`} href={pictureUrl} target="_blank" rel="noopener noreferrer" className="ui-photo" aria-label={`Open ${side.title.toLowerCase()} photo ${index + 1} full size`}>
                            <Image
                              src={pictureUrl}
                              alt={`${side.title} photo ${index + 1}`}
                              width={280}
                              height={180}
                              unoptimized
                              style={{ width: "100%", height: 180, objectFit: "cover" }}
                            />
                          </a>
                        );
                      })}
                    </div>
                  ))}
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

      {/* Merge: pick the main complaint (same account), then Merge. */}
      <Sheet
        open={merging}
        title="Merge into which complaint?"
        text="This complaint's text and photos move into the one you pick."
        onClose={() => setMerging(false)}
        busy={mergeBusy}
        actions={
          <BigButton busy={mergeBusy} busyLabel="Merging…" disabled={!mergePick} onClick={() => void mergeInto()}>
            Merge
          </BigButton>
        }
      >
        <div className="ui-stack" role="group" aria-label="Complaints on this account">
          {mergeTargets.map((target) => {
            const on = mergePick === target.key;
            return (
              <button key={target.key} type="button" aria-pressed={on} className={`ui-pick ${on ? "ui-pick-on" : ""}`.trim()} onClick={() => setMergePick(target.key)}>
                <span className="min-w-0 flex-1">
                  <span className="ui-strong">
                    {formatDate(target.day)} · {target.status || "Open"}
                  </span>
                  <span className="ui-card-text ui-clamp" style={{ display: "block" }}>
                    {target.text || "No description"}
                  </span>
                </span>
                <span className="ui-pick-mark" aria-hidden="true">
                  ✓
                </span>
              </button>
            );
          })}
        </div>
        {mergeError ? <ErrorBox title="Not merged." text={mergeError} /> : null}
      </Sheet>

      {/* The sub was already told: ask before sending again. */}
      <Sheet
        open={confirmNotify}
        title="Send again?"
        text={lastNotified ? `The sub was last notified ${formatWhen(lastNotified)}.` : undefined}
        onClose={() => setConfirmNotify(false)}
        actions={
          <BigButton busy={resending} busyLabel="Sending…" onClick={() => void notifySub()}>
            Yes, send again
          </BigButton>
        }
      />

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
