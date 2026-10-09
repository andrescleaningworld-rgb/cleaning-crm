"use client";

import { useState } from "react";
import type { PortalSubmission } from "@/lib/data/customer-portal";
import {
  BigButton,
  Card,
  CardList,
  EmptyState,
  ErrorBox,
  Field,
  SearchBar,
  SelectField,
  Sheet,
  StatusPill,
  showToast,
  type StatusKind,
} from "@/app/ui";

const TAB_LABELS: Record<string, string> = {
  "portal-complaints": "Complaint",
  "portal-service-requests": "Service Request",
  "portal-date-changes": "Date Change",
  "portal-billing-requests": "Billing",
};

const STATUS_OPTIONS = ["New", "In Progress", "Resolved", "Closed"];

const STATUS_KINDS: Record<string, StatusKind> = {
  New: "needs-you",
  "In Progress": "waiting",
  Resolved: "done",
  Closed: "off",
};

const TYPE_FILTERS = [
  { label: "All", value: "all" },
  { label: "Complaints", value: "portal-complaints" },
  { label: "Service Requests", value: "portal-service-requests" },
  { label: "Date Changes", value: "portal-date-changes" },
  { label: "Billing", value: "portal-billing-requests" },
];

const STATUS_FILTERS = ["All", "New", "In Progress", "Resolved", "Closed"];

export default function SubmissionsView({ initial }: { initial: PortalSubmission[] }) {
  const [items, setItems] = useState<PortalSubmission[]>(initial);
  const [typeFilter, setTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("All");
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ key: string; status: string; notes: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  const filtered = items.filter((s) => {
    if (typeFilter !== "all" && s.tab !== typeFilter) return false;
    if (statusFilter !== "All" && s.status !== statusFilter) return false;
    if (search && !s.accountName.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const newCount = items.filter((s) => s.status === "New").length;

  function key(s: PortalSubmission) {
    return `${s.tab}-${s.sheetRow}`;
  }

  function open(s: PortalSubmission) {
    const k = key(s);
    setSaveError("");
    setExpanded(k);
    setEditing({ key: k, status: s.status, notes: s.notes });
  }

  function close() {
    setExpanded(null);
    setEditing(null);
    setSaveError("");
  }

  async function save(s: PortalSubmission) {
    if (!editing) return;
    setSaving(true);
    setSaveError("");
    try {
      const res = await fetch("/api/staff/portal-submissions", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tab: s.tab, sheetRow: s.sheetRow, status: editing.status, notes: editing.notes }),
      });
      if (!res.ok) throw new Error("Failed");
      setItems((prev) =>
        prev.map((item) =>
          key(item) === key(s)
            ? { ...item, status: editing.status, notes: editing.notes }
            : item
        )
      );
      setExpanded(null);
      setEditing(null);
      showToast("Saved");
    } catch {
      setSaveError("Failed to save. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  const current = expanded ? items.find((s) => key(s) === expanded) ?? null : null;
  const firstField = (s: PortalSubmission) => Object.values(s.fields)[0] ?? "";

  return (
    <div className="ui-stack">
      {/* Stats row */}
      <div className="ui-stats">
        <div className="ui-stat">
          <p className="ui-stat-label">Total Requests</p>
          <p className="ui-stat-value">{items.length}</p>
        </div>
        <div className="ui-stat">
          <p className="ui-stat-label">New / Unread</p>
          <p className="ui-stat-value">{newCount}</p>
        </div>
        <div className="ui-stat">
          <p className="ui-stat-label">In Progress</p>
          <p className="ui-stat-value">{items.filter((s) => s.status === "In Progress").length}</p>
        </div>
        <div className="ui-stat">
          <p className="ui-stat-label">Resolved</p>
          <p className="ui-stat-value">{items.filter((s) => s.status === "Resolved").length}</p>
        </div>
      </div>

      {/* Filters */}
      <SearchBar value={search} onChange={setSearch} label="Search requests by account" placeholder="Search by account" />
      <div className="ui-two">
        <SelectField label="Kind" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} required={false}>
          {TYPE_FILTERS.map((f) => (
            <option key={f.value} value={f.value}>{f.label}</option>
          ))}
        </SelectField>
        <SelectField label="Status" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} required={false}>
          {STATUS_FILTERS.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </SelectField>
      </div>

      {/* List */}
      {filtered.length === 0 ? (
        <EmptyState
          icon="inbox"
          title={items.length === 0 ? "No requests yet" : "No requests match"}
          text={items.length === 0 ? "When a customer sends something from the portal, it shows up here." : "Try another kind, status or search."}
        />
      ) : (
        <CardList
          label="Portal requests"
          items={filtered}
          getKey={key}
          renderCard={(s) => (
            <Card
              title={s.accountName}
              right={<StatusPill kind={STATUS_KINDS[s.status] ?? "off"}>{s.status}</StatusPill>}
              onClick={() => open(s)}
            >
              <p className="ui-strong">{TAB_LABELS[s.tab]}</p>
              {firstField(s) ? <p>{firstField(s)}</p> : null}
              <p className="ui-muted">{s.date}</p>
            </Card>
          )}
        />
      )}

      {/* Detail */}
      <Sheet
        open={current !== null && editing !== null}
        title={current ? `${TAB_LABELS[current.tab]}: ${current.accountName}` : ""}
        text={current?.date}
        onClose={close}
        busy={saving}
        actions={
          current ? (
            <BigButton busy={saving} busyLabel="Saving…" onClick={() => save(current)}>
              Save
            </BigButton>
          ) : undefined
        }
      >
        {current && editing ? (
          <div className="ui-stack">
            <dl className="ui-details">
              {Object.entries(current.fields).map(([label, value]) =>
                value ? (
                  <div key={label} className="ui-detail ui-detail-full">
                    <dt>{label}</dt>
                    <dd>
                      {label === "Photos"
                        ? value.split(",").map((url) => url.trim()).filter(Boolean).map((url, i) => (
                            <a key={url} href={url} target="_blank" rel="noopener noreferrer" className="ui-btn ui-btn-second">
                              View Photo {i + 1}
                            </a>
                          ))
                        : value}
                    </dd>
                  </div>
                ) : null
              )}
            </dl>

            <SelectField label="Status" value={editing.status} onChange={(e) => setEditing({ ...editing, status: e.target.value })}>
              {/* A status typed by hand in the sheet stays selectable. */}
              {!STATUS_OPTIONS.includes(editing.status) ? <option value={editing.status}>{editing.status}</option> : null}
              {STATUS_OPTIONS.map((opt) => (
                <option key={opt} value={opt}>{opt}</option>
              ))}
            </SelectField>
            <Field
              label="Staff Notes"
              optional
              type="text"
              value={editing.notes}
              onChange={(e) => setEditing({ ...editing, notes: e.target.value })}
              placeholder="Add a note"
            />
            {saveError ? <ErrorBox title={saveError} onRetry={() => save(current)} /> : null}
          </div>
        ) : null}
      </Sheet>
    </div>
  );
}
