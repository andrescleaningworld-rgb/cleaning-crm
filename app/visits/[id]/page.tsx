"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { parseISO } from "@/lib/dateUtils";
import { BigButton, Card, EmptyState, ErrorBox, Field, Screen, SelectField, Sheet, SkeletonList, TextAreaField } from "@/app/ui";

type Visit = {
  id: string;
  accountId: string;
  accountName: string;
  date: string;
  visitType: string;
  completedBy: string;
  condition: string;
  followUpNeeded: string;
  followUpDate: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
};

type EditLogEntry = {
  id: string;
  visitId: string;
  editedBy: string;
  editedAt: string;
  changeSummary: string;
};

type VisitApiResponse = {
  success?: boolean;
  error?: string;
  visit?: Visit;
  editHistory?: EditLogEntry[];
};

// Raw shape returned by GET /api/accounts — only the fields this page reads.
type Account = {
  id?: string;
  accountId?: string;
  accountName?: string;
  subcontractor?: string;
};

type AccountsApiResponse = {
  success?: boolean;
  accounts?: Account[];
  data?: Account[];
};

type EditForm = {
  date: string;
  visitType: string;
  completedBy: string;
  condition: string;
  followUpNeeded: string;
  followUpDate: string;
  notes: string;
};

const VISIT_TYPE_OPTIONS = [
  "Routine Visit",
  "Complaint Follow-Up",
  "Quality Check",
  "Onboarding New Account",
  "Customer Request",
  "Subcontractor Review",
  "Other",
];

function clean(value: unknown): string {
  return String(value ?? "").trim();
}

// visit.date / visit.followUpDate always arrive as normalized "YYYY-MM-DD"
// strings from GET /api/visits/[id] (see normalizeSheetDate in
// lib/googleSheets.ts), so parseISO() — not new Date() — is the correct,
// timezone-safe way to turn them into a Date for display.
function formatDate(value: string): string {
  const text = clean(value);
  if (!text) return "No date";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  const date = parseISO(text);
  if (Number.isNaN(date.getTime())) return text;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function formatDateTime(value: string): string {
  const text = clean(value);
  if (!text) return "a time not recorded";
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) return text;
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

// Same self-declared identity used by app/documents/page.tsx, app/to-do/page.tsx,
// and app/sub-schedules/page.tsx ("cwAdminName") — there's no per-manager login
// in this app, so edits are attributed to whatever name staff last typed in,
// shared via localStorage across pages.
function getStoredAdminName(): string {
  if (typeof window === "undefined") return "";
  return window.localStorage.getItem("cwAdminName") ?? "";
}

function setStoredAdminName(value: string) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem("cwAdminName", value);
}

function visitToForm(visit: Visit): EditForm {
  return {
    date: visit.date,
    visitType: visit.visitType,
    completedBy: visit.completedBy,
    condition: visit.condition,
    followUpNeeded: visit.followUpNeeded,
    followUpDate: visit.followUpDate,
    notes: visit.notes,
  };
}

function getLoadedAccounts(data: AccountsApiResponse): Account[] {
  if (Array.isArray(data.accounts)) return data.accounts;
  if (Array.isArray(data.data)) return data.data;
  return [];
}

export default function VisitDetailPage() {
  const params = useParams();
  const visitId = clean(Array.isArray(params.id) ? params.id[0] : params.id);

  const [visit, setVisit] = useState<Visit | null>(null);
  const [editHistory, setEditHistory] = useState<EditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Visits store an Account ID that uses a different scheme than Accounts'
  // own accountId (e.g. visit "ACC-186A2" vs account "key-impact-sales--
  // systems") and never matches it — this is why clicking a visit used to
  // land on "Could not find this account." Looking the account up by name
  // instead (same key app/accounts/[id]/page.tsx already accepts) is what
  // actually resolves for ~90% of visits in production; the rest genuinely
  // have no matching account on file, so the link is shown disabled rather
  // than broken.
  const [linkedAccount, setLinkedAccount] = useState<Account | null>(null);
  const [accountLookupDone, setAccountLookupDone] = useState(false);

  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<EditForm | null>(null);
  const [editedBy, setEditedBy] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [showFullHistory, setShowFullHistory] = useState(false);

  const loadVisit = useCallback(async () => {
    if (!visitId) return;
    try {
      setLoading(true);
      setError("");
      const response = await fetch(`/api/visits/${encodeURIComponent(visitId)}`, {
        cache: "no-store",
      });
      const data = (await response.json()) as VisitApiResponse;
      if (!response.ok || data.success === false || !data.visit) {
        throw new Error(data.error || "Could not load this visit.");
      }
      setVisit(data.visit);
      setEditHistory(data.editHistory || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load this visit.");
    } finally {
      setLoading(false);
    }
  }, [visitId]);

  useEffect(() => {
    loadVisit();
  }, [loadVisit]);

  useEffect(() => {
    setEditedBy(getStoredAdminName());
  }, []);

  useEffect(() => {
    if (!visit) return;
    let cancelled = false;

    async function loadAccount() {
      try {
        const response = await fetch("/api/accounts", { cache: "no-store" });
        const data = (await response.json()) as AccountsApiResponse;
        const accounts = getLoadedAccounts(data);
        const normalizedName = clean(visit?.accountName).toLowerCase();
        const match = accounts.find(
          (a) => clean(a.accountName).toLowerCase() === normalizedName
        );
        if (!cancelled) setLinkedAccount(match || null);
      } catch {
        if (!cancelled) setLinkedAccount(null);
      } finally {
        if (!cancelled) setAccountLookupDone(true);
      }
    }

    loadAccount();
    return () => {
      cancelled = true;
    };
  }, [visit]);

  function startEditing() {
    if (!visit) return;
    setForm(visitToForm(visit));
    setSaveError("");
    setEditing(true);
  }

  function cancelEditing() {
    setEditing(false);
    setForm(null);
    setSaveError("");
  }

  function handleEditedByChange(value: string) {
    setEditedBy(value);
    setStoredAdminName(value);
  }

  function updateForm<K extends keyof EditForm>(key: K, value: EditForm[K]) {
    setForm((prev) => (prev ? { ...prev, [key]: value } : prev));
  }

  async function handleSave() {
    if (!form) return;
    const name = editedBy.trim();
    if (!name) {
      setSaveError("Enter your name so this edit can be attributed to you.");
      return;
    }

    setSaving(true);
    setSaveError("");
    try {
      const response = await fetch(`/api/visits/${encodeURIComponent(visitId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({ ...form, editedBy: name }),
      });
      const data = (await response.json()) as VisitApiResponse;
      if (!response.ok || data.success === false) {
        throw new Error(data.error || "Failed to save changes.");
      }
      setEditing(false);
      setForm(null);
      await loadVisit();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Failed to save changes.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <Screen title="Visit" backHref="/visits">
        <SkeletonList rows={2} />
      </Screen>
    );
  }

  if (error || !visit) {
    return (
      <Screen title="Visit" backHref="/visits">
        {error ? (
          <ErrorBox title="The visit did not load." text={error} onRetry={() => void loadVisit()} />
        ) : (
          <EmptyState
            title="Visit not found"
            text="It may have been removed."
            action={
              <BigButton kind="second" href="/visits">
                Back to Visits
              </BigButton>
            }
          />
        )}
      </Screen>
    );
  }

  const accountHref = linkedAccount
    ? `/accounts/${encodeURIComponent(
        linkedAccount.accountId || linkedAccount.id || linkedAccount.accountName || visit.accountName
      )}`
    : null;

  const latestEdit = editHistory[0];

  return (
    <Screen
      title={clean(visit.visitType) || "Visit"}
      subtitle={clean(visit.accountName) || "Unnamed Account"}
      backHref="/visits"
      action={
        <BigButton onClick={startEditing}>
          Edit visit
        </BigButton>
      }
    >
      <Card title="Visit Details">
        <dl className="ui-details">
          <div className="ui-detail">
            <dt>Date</dt>
            <dd>{formatDate(visit.date)}</dd>
          </div>
          <div className="ui-detail">
            <dt>Account</dt>
            <dd>
              {accountHref ? (
                <Link href={accountHref} className="ui-link">
                  {clean(visit.accountName) || "Unnamed Account"}
                </Link>
              ) : (
                <>
                  {clean(visit.accountName) || "Unnamed Account"}
                  {accountLookupDone ? <span className="ui-muted"> (no matching account on file, so no link)</span> : null}
                </>
              )}
            </dd>
          </div>
          <div className="ui-detail">
            <dt>Visit Type</dt>
            <dd>{clean(visit.visitType) || "None"}</dd>
          </div>
          <div className="ui-detail">
            <dt>Completed By</dt>
            <dd>{clean(visit.completedBy) || "None"}</dd>
          </div>
          <div className="ui-detail">
            <dt>Subcontractor</dt>
            <dd>
              {clean(linkedAccount?.subcontractor) || "None"}
              <span className="ui-muted"> (from the linked account; visits do not track their own subcontractor)</span>
            </dd>
          </div>
          <div className="ui-detail">
            <dt>Condition Score</dt>
            <dd>{clean(visit.condition) || "None"}</dd>
          </div>
          <div className="ui-detail">
            <dt>Follow-Up Needed</dt>
            <dd>{clean(visit.followUpNeeded) || "Not set"}</dd>
          </div>
          <div className="ui-detail">
            <dt>Follow-Up Date</dt>
            <dd>{clean(visit.followUpDate) ? formatDate(visit.followUpDate) : "None"}</dd>
          </div>
          <div className="ui-detail ui-detail-full">
            <dt>Notes</dt>
            <dd style={{ whiteSpace: "pre-wrap" }}>{clean(visit.notes) || "None"}</dd>
          </div>
        </dl>
      </Card>

      <Card title="Edit History">
        {editHistory.length === 0 ? (
          <p className="ui-card-text">No edits recorded yet.</p>
        ) : (
          <>
            <p className="ui-card-text">
              Last edited by <span className="ui-strong">{clean(latestEdit?.editedBy) || "someone"}</span> on{" "}
              {formatDateTime(latestEdit?.editedAt || "")}
            </p>

            {editHistory.length > 1 ? (
              <div style={{ marginTop: 8 }}>
                <BigButton kind="quiet" onClick={() => setShowFullHistory((v) => !v)} aria-expanded={showFullHistory}>
                  {showFullHistory ? "Hide full history" : `Show full history (${editHistory.length})`}
                </BigButton>
              </div>
            ) : null}

            {showFullHistory ? (
              <ul className="ui-list-plain" style={{ gap: 8, marginTop: 8 }}>
                {editHistory.map((entry) => (
                  <li key={entry.id}>
                    <span className="ui-strong">{clean(entry.editedBy) || "someone"}</span>, {formatDateTime(entry.editedAt)}
                    {entry.changeSummary ? <span className="ui-muted"> · {entry.changeSummary}</span> : null}
                  </li>
                ))}
              </ul>
            ) : null}
          </>
        )}
      </Card>

      <Sheet
        open={editing && form !== null}
        title="Edit visit"
        text={clean(visit.accountName) || undefined}
        onClose={cancelEditing}
        busy={saving}
        actions={
          <BigButton busy={saving} busyLabel="Saving…" onClick={() => void handleSave()}>
            Save changes
          </BigButton>
        }
      >
        {form ? (
          <>
            <Field
              label="Your name"
              hint="Recorded in this visit's edit history."
              value={editedBy}
              onChange={(e) => handleEditedByChange(e.target.value)}
              placeholder="Enter your name"
            />
            <Field label="Visit date" type="date" value={form.date} onChange={(e) => updateForm("date", e.target.value)} />
            <Field label="Visit type" list="visit-type-options" value={form.visitType} onChange={(e) => updateForm("visitType", e.target.value)} />
            <datalist id="visit-type-options">
              {VISIT_TYPE_OPTIONS.map((option) => (
                <option key={option} value={option} />
              ))}
            </datalist>
            <Field label="Completed by" value={form.completedBy} onChange={(e) => updateForm("completedBy", e.target.value)} />
            <Field
              label="Condition score (0-10)"
              inputMode="decimal"
              value={form.condition}
              onChange={(e) => updateForm("condition", e.target.value)}
              placeholder="0-10"
            />
            <SelectField label="Follow-up needed" value={form.followUpNeeded} onChange={(e) => updateForm("followUpNeeded", e.target.value)}>
              <option value="">Not Set</option>
              <option value="Yes">Yes</option>
              <option value="No">No</option>
            </SelectField>
            <Field label="Follow-up date" optional type="date" value={form.followUpDate} onChange={(e) => updateForm("followUpDate", e.target.value)} />
            <TextAreaField label="Notes" rows={6} value={form.notes} onChange={(e) => updateForm("notes", e.target.value)} />
            {saveError ? <ErrorBox title="The changes were not saved." text={saveError} /> : null}
          </>
        ) : null}
      </Sheet>
    </Screen>
  );
}
