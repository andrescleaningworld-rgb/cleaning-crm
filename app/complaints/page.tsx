"use client";

import Link from "next/link";
import { PinButton, usePinInfo } from "../components/pin-to-board";
import AccountLink from "../components/AccountLink";
import { AccountScopeBar, useAccountScope } from "../components/account-scope";
import { useEffect, useMemo, useState } from "react";
import {
  AddButton,
  BigButton,
  Card,
  CardList,
  Counts,
  EmptyState,
  ErrorBox,
  Field,
  Screen,
  SearchBar,
  SelectField,
  Sheet,
  PullToRefresh,
  SkeletonList,
  StatusPill,
  TextAreaField,
  CHEER,
  Tips,
  showToast,
  undoable,
  type StatusKind,
} from "@/app/ui";

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

function statusKind(status: unknown): StatusKind {
  const value = normalize(status);
  if (value.includes("resolved") || value.includes("closed")) return "done";
  if (value.includes("open") || !value) return "needs-you";
  if (value.includes("progress") || value.includes("pending") || value.includes("review")) return "waiting";
  return "off";
}

function priorityKind(severity: unknown): StatusKind {
  const value = normalize(severity);
  if (value.includes("high") || value.includes("urgent")) return "needs-you";
  if (value.includes("medium")) return "waiting";
  if (value.includes("low")) return "done";
  return "off";
}

/** The Complaint Detail page (app/complaints/[id]). */
function complaintHref(complaint: Complaint): string {
  return `/complaints/${encodeURIComponent(clean(complaint.id) || clean(complaint.rowNumber))}`;
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
  const [allComplaints, setComplaints] = useState<Complaint[]>([]);
  // Opened from an account's page (?accountId=): only that account's complaints, with a way back.
  const scope = useAccountScope();
  const complaints = useMemo(() => (scope.active ? allComplaints.filter((complaint) => scope.matches(complaint.accountId, complaint.accountName)) : allComplaints), [allComplaints, scope]);
  // "Pin to board" (Settings -> Pin Board).
  const { info: pinInfo } = usePinInfo();
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

  // Modals (a complaint itself opens its own page, /complaints/<id>)
  const [selectedComplaint, setSelectedComplaint] = useState<Complaint | null>(null);
  const [resolutionNote, setResolutionNote] = useState("");
  // Layout only: filters open in a sheet.
  const [showFilters, setShowFilters] = useState(false);
  // Redesign: the big counts are filters. "open" = not closed yet.
  const [quick, setQuick] = useState<"all" | "open" | "review" | "closed">("all");

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("status") === "open") setQuick("open");
  }, []);

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


  function openCloseModal(complaint: Complaint) {
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
      showToast(CHEER.logged);
      await loadComplaints();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error closing complaint.");
      // After an Undo wait the sheet is closed: open it again so the error is seen.
      setSelectedComplaint(selectedComplaint);
    } finally {
      setSavingClose(false);
    }
  }

  // Closing a complaint is hard to take back, so it waits 5 seconds behind an
  // Undo button before anything is saved.
  function requestCloseComplaint() {
    const target = selectedComplaint;
    if (!target) return;
    if (!clean(resolutionNote)) {
      setError("Please enter a resolution note before closing the complaint.");
      return;
    }
    setError("");
    setSelectedComplaint(null);
    undoable({
      message: "Closing this complaint…",
      run: () => handleCloseComplaint(),
      onUndo: () => setSelectedComplaint(target),
      undoneMessage: "Not closed. Nothing was changed.",
    });
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
      if (quick === "open" && isClosedComplaint(c.status)) return false;
      if (quick === "closed" && !isClosedComplaint(c.status)) return false;
      if (quick === "review" && clean(c.complaintValidity).toLowerCase() !== "needs review") return false;

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
  }, [complaints, search, statusFilter, accountFilter, sortOrder, dateFrom, dateTo, quick]);

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
    setQuick("all");
    setSearch("");
    setStatusFilter("All");
    setAccountFilter("All");
    setSortOrder("Newest");
    setDateFrom("");
    setDateTo("");
  }

  const filtersOn =
    (statusFilter !== "All" ? 1 : 0) + (accountFilter !== "All" ? 1 : 0) + (sortOrder !== "Newest" ? 1 : 0) + (dateFrom ? 1 : 0) + (dateTo ? 1 : 0);
  const priorityOf = (c: Complaint) => clean(c.severity || c.priority);
  const statusPill = (c: Complaint) => <StatusPill kind={statusKind(c.status)}>{clean(c.status) || "Open"}</StatusPill>;
  const priorityPill = (c: Complaint) => <StatusPill kind={priorityKind(priorityOf(c))}>{priorityOf(c) ? `${priorityOf(c)} priority` : "No priority"}</StatusPill>;
  const photoText = (c: Complaint) => {
    const n = getComplaintPhotoCount(c, photos);
    return n > 0 ? `${n} photo${n === 1 ? "" : "s"}` : "";
  };
  const accountLink = (c: Complaint) =>
    clean(c.accountName) ? (
      <AccountLink accountId={clean(c.accountId)} name={clean(c.accountName)} className="ui-link" />
    ) : (
      "No account"
    );
  const rowActions = (c: Complaint) => (
    <div className="ui-actions-row">
      <BigButton href={complaintHref(c)} aria-label={`Open the complaint for ${clean(c.accountName) || "this account"}`} data-tip="open">
        Open complaint
      </BigButton>
      {!isClosedComplaint(c.status) ? (
        <BigButton kind="second" onClick={() => openCloseModal(c)}>
          Close complaint
        </BigButton>
      ) : null}
    </div>
  );

  return (
    <Screen
      title="Complaints"
      backHref="/"
      addAction={<AddButton href="/complaints/new">Add complaint</AddButton>}
    >
      <AccountScopeBar scope={scope} what="complaints" />
      {error && !selectedComplaint ? <ErrorBox title="That did not work." text={error} /> : null}
      {successMessage ? (
        <p className="ui-savestatus ui-savestatus-saved" role="status">
          {successMessage}
        </p>
      ) : null}

      <Tips
        id="complaints"
        ready={!loading}
        steps={[
          { target: '[data-tip="counts"]', text: "Tap a number to see only those complaints." },
          { target: '[data-tip="open"]', text: "Tap Open to read a complaint and its photos." },
          { target: ".ui-page-add .ui-btn-main", text: "Tap Add complaint to log a new one." },
        ]}
      />
      <PullToRefresh
        onRefresh={async () => {
          await loadComplaints();
          showToast("Updated ✓");
        }}
      />

      <SearchBar value={search} onChange={setSearch} label="Find a complaint" placeholder="Find a complaint" />

      {/* At a glance: tap a number to see those complaints. */}
      <Counts
        data-tip="counts"
        items={[
          { label: "Open", value: complaints.length - resolvedComplaints, tone: complaints.length - resolvedComplaints > 0 ? "bad" : "good", pressed: quick === "open", onClick: () => setQuick(quick === "open" ? "all" : "open") },
          { label: "To review", value: needsReviewComplaints, tone: "info", pressed: quick === "review", onClick: () => setQuick(quick === "review" ? "all" : "review") },
          { label: "Closed", value: resolvedComplaints, tone: "off", pressed: quick === "closed", onClick: () => setQuick(quick === "closed" ? "all" : "closed") },
        ]}
      />

      <div className="ui-actions-row">
        <BigButton kind="second" onClick={() => setShowFilters(true)}>
          {filtersOn ? `Filter and sort (${filtersOn} on)` : "Filter and sort"}
        </BigButton>
        <BigButton kind="quiet" onClick={clearFilters}>
          Clear filters
        </BigButton>
      </div>

      <p className="ui-muted" role="status">
        {loading
          ? "Loading complaints…"
          : `Showing ${filteredComplaints.length} of ${complaints.length} · In progress: ${openComplaints} · Not valid: ${notValidComplaints} · With photos: ${loadingPhotos ? "…" : withPhotosComplaints}`}
      </p>

      {loading ? (
        <SkeletonList rows={3} />
      ) : filteredComplaints.length === 0 ? (
        <EmptyState
          title={quick === "open" ? "No open complaints" : "No complaints here"}
          text={quick === "open" ? "Nothing needs you. Tap Add complaint at the top to log a new one." : "Tap Clear filters to see them all, or Add complaint at the top to log one."}
        />
      ) : (
        <CardList
          label="Complaints"
          items={filteredComplaints.map((complaint, index) => ({ complaint, index }))}
          getKey={({ complaint, index }) => `${complaint.id || "complaint"}-${index}`}
          renderCard={({ complaint }) => (
            <Card title={<AccountLink accountId={clean(complaint.accountId)} name={clean(complaint.accountName) || "No account"} />} right={statusPill(complaint)}>
              <p className="ui-card-text">
                {formatDate(complaint.date)}
                {clean(complaint.complaintType) ? ` · ${clean(complaint.complaintType)}` : ""}
              </p>
              <p className="ui-card-text ui-clamp">
                <Link href={complaintHref(complaint)} className="ui-link">
                  {clean(complaint.description) || "No description"}
                </Link>
              </p>
              <div className="ui-actions-row" style={{ marginTop: 8 }}>
                {priorityPill(complaint)}
                <StatusPill kind="off">{clean(complaint.complaintValidity) || "Needs Review"}</StatusPill>
              </div>
              {photoText(complaint) ? <p className="ui-card-text">{photoText(complaint)}</p> : null}
              {clean(complaint.accountName) ? <p className="ui-card-text">{accountLink(complaint)}</p> : null}
              <div style={{ marginTop: 12 }}>{rowActions(complaint)}</div>
              {clean(complaint.id) ? (
                <div style={{ marginTop: 8 }}>
                  <PinButton
                    info={pinInfo}
                    type="complaint"
                    record={{ recordId: clean(complaint.id), title: clean(complaint.accountName) || "Complaint", accountName: clean(complaint.accountName) }}
                    managerName={clean(complaint.manager)}
                  />
                </div>
              ) : null}
            </Card>
          )}
          columns={[
            { header: "Date", cell: ({ complaint }) => <span className="ui-nowrap">{formatDate(complaint.date)}</span> },
            { header: "Account", cell: ({ complaint }) => accountLink(complaint) },
            {
              header: "Issue",
              cell: ({ complaint }) => (
                <>
                  {clean(complaint.complaintType) ? <p className="ui-strong">{clean(complaint.complaintType)}</p> : null}
                  <p className="ui-clamp">
                    <Link href={complaintHref(complaint)} className="ui-link">
                      {clean(complaint.description) || "No description"}
                    </Link>
                  </p>
                </>
              ),
            },
            { header: "Priority", cell: ({ complaint }) => priorityPill(complaint) },
            { header: "Status", cell: ({ complaint }) => statusPill(complaint) },
            { header: "Validity", cell: ({ complaint }) => clean(complaint.complaintValidity) || "Needs Review" },
            { header: "Photos", cell: ({ complaint }) => photoText(complaint) || "None" },
            { header: "Assigned To", cell: ({ complaint }) => clean(complaint.manager) || clean(complaint.subcontractor) || "No one" },
            { header: "Reported By", cell: ({ complaint }) => clean(complaint.reportedBy) || "Not recorded" },
            { header: "Follow-Up", cell: ({ complaint }) => (clean(complaint.followUpDate) ? formatDate(complaint.followUpDate) : "None") },
            { header: "Notes", cell: ({ complaint }) => <span className="ui-clamp">{clean(complaint.notes) || clean(complaint.resolution) || "None"}</span> },
            { header: "Action", cell: ({ complaint }) => rowActions(complaint) },
          ]}
        />
      )}

      <Sheet open={showFilters} title="Filter and sort" onClose={() => setShowFilters(false)} closeLabel="Done">
        <SelectField label="Status" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          {statusOptions.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </SelectField>
        <SelectField label="Account" value={accountFilter} onChange={(e) => setAccountFilter(e.target.value)}>
          {accountNames.map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </SelectField>
        <SelectField label="Sort" value={sortOrder} onChange={(e) => setSortOrder(e.target.value as SortOption)}>
          <option value="Newest">Newest First</option>
          <option value="Oldest">Oldest First</option>
          <option value="Status">By Status</option>
        </SelectField>
        <Field label="From date" optional type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
        <Field label="To date" optional type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
        <p className="ui-muted" role="status">
          {filteredComplaints.length} of {complaints.length}
        </p>
        <div>
          <BigButton kind="quiet" onClick={clearFilters}>
            Clear filters
          </BigButton>
        </div>
      </Sheet>

      {/* Close a complaint */}
      <Sheet
        open={selectedComplaint !== null}
        title="Close complaint"
        text={
          selectedComplaint
            ? `${clean(selectedComplaint.accountName) || "Complaint"}: ${clean(selectedComplaint.description) || "No issue description"}`
            : undefined
        }
        onClose={closeCloseModal}
        busy={savingClose}
        actions={
          <BigButton busy={savingClose} busyLabel="Closing…" onClick={requestCloseComplaint}>
            Close complaint
          </BigButton>
        }
      >
        <TextAreaField
          label="Resolution note"
          rows={5}
          value={resolutionNote}
          onChange={(e) => setResolutionNote(e.target.value)}
          placeholder="Example: Spoke with subcontractor, issue corrected, customer satisfied."
        />
        {error ? <ErrorBox title="The complaint was not closed." text={error} /> : null}
      </Sheet>
    </Screen>
  );
}
