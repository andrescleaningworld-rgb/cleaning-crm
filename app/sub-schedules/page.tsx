"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import ScheduleModal, { type SubSchedule } from "./schedule-modal";
import ExceptionModal, { type ScheduleException } from "./exception-modal";
import AddScheduleModal from "./add-schedule-modal";
import FullCalendar from "./full-calendar";
import { isScheduleEffectivelyActive, parseMonthlyOccurrence, todayISO } from "@/lib/scheduleRecurrence";
import {
  AutocompleteField,
  useAllAccountOptions,
  useCustomerSearch,
  useDebounce,
  type SearchOption,
} from "./autocomplete";
import {
  BigButton,
  Card,
  CardList,
  ConfirmSheet,
  EmptyState,
  ErrorBox,
  Field,
  FilterChips,
  LABELS,
  Screen,
  SkeletonList,
  StatusPill,
} from "@/app/ui";

type AdminTab = "schedules" | "exceptions" | "calendar";

type SubcontractorsApiResponse = {
  success?: boolean;
  error?: string;
  subcontractors?: Array<{
    id?: string;
    ID?: string;
    subcontractorId?: string;
    email?: string;
    Email?: string;
    "Email Address"?: string;
    emailAddress?: string;
    companyName?: string;
    CompanyName?: string;
    "Company Name"?: string;
    company?: string;
    contactName?: string;
    ContactName?: string;
    "Contact Name"?: string;
    name?: string;
  }>;
};

// Company name and contact/personal name, tracked separately so Subcontractor
// search can match either one (staff often know a sub by first name rather
// than company name), with id resolved the same way as before (SubID in the
// SubSchedules sheet is the subcontractor's email).
type TeamLeaderRecord = { id: string; companyName: string; contactName: string };

function normalizeForMatch(value: string): string {
  return value.trim().toLowerCase();
}

function getStoredAdminName(): string {
  if (typeof window === "undefined") return "";
  return window.localStorage.getItem("cwAdminName") ?? "";
}

const FREQUENCY_LABELS: Record<string, string> = {
  WEEKLY: "Weekly",
  BIWEEKLY: "Every Other Week",
  MONTHLY_1X: "1x per Month",
  MONTHLY_2X: "2x per Month",
  AS_NEEDED: "As Needed",
};

function describeFrequency(schedule: SubSchedule): string {
  return FREQUENCY_LABELS[schedule.frequency] || (schedule.recurring === "Y" ? "Weekly" : "One-time");
}

function describeDayOrOccurrence(schedule: SubSchedule): string {
  if (schedule.frequency === "MONTHLY_1X" || schedule.frequency === "MONTHLY_2X") {
    const occurrence = parseMonthlyOccurrence(schedule.monthlyOccurrence);
    return occurrence ? `${occurrence.position} ${occurrence.weekday}` : "—";
  }
  if (schedule.frequency === "AS_NEEDED") return "—";
  return schedule.dayOfWeek || "—";
}

export default function SubSchedulesPage() {
  return (
    <Suspense
      fallback={
        <div className="ui-screen">
          <SkeletonList rows={3} />
        </div>
      }
    >
      <SubSchedulesPageInner />
    </Suspense>
  );
}

function SubSchedulesPageInner() {
  const [adminTab, setAdminTab] = useState<AdminTab>("schedules");
  const [adminName, setAdminName] = useState("");

  const [schedules, setSchedules] = useState<SubSchedule[]>([]);
  const [exceptions, setExceptions] = useState<ScheduleException[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Customer autocomplete (resolves to AccountID)
  const customer = useCustomerSearch();

  // Subcontractor autocomplete (resolves to SubID) — full subcontractor list is
  // small, so it's loaded once and filtered client-side, same as the
  // subcontractor dropdown already used on the Accounts page.
  const [allTeamLeaders, setAllTeamLeaders] = useState<TeamLeaderRecord[]>([]);
  const [teamLeaderLoadFailed, setTeamLeaderLoadFailed] = useState(false);
  const [teamLeaderLoading, setTeamLeaderLoading] = useState(true);
  const [teamLeaderQuery, setTeamLeaderQuery] = useState("");
  const debouncedTeamLeaderQuery = useDebounce(teamLeaderQuery, 200);
  const [selectedTeamLeader, setSelectedTeamLeader] = useState<SearchOption | null>(null);

  // AccountID -> display name, for the Exceptions table (which otherwise only
  // has raw AccountIDs). Backed by the same shared, cached account list the
  // Customer autocomplete uses, so this doesn't add its own separate fetch.
  const { options: allAccountOptions } = useAllAccountOptions();
  const accountNamesById = useMemo(() => {
    const map: Record<string, string> = {};
    for (const option of allAccountOptions) map[option.id] = option.label;
    return map;
  }, [allAccountOptions]);

  const [scheduleModal, setScheduleModal] = useState<SubSchedule | null>(null);
  const [exceptionModal, setExceptionModal] = useState<"new" | ScheduleException | null>(null);
  const [addScheduleModalOpen, setAddScheduleModalOpen] = useState(false);
  // Layout only: the "are you sure?" step before deleting an exception is a sheet now.
  const [exceptionToDelete, setExceptionToDelete] = useState<ScheduleException | null>(null);
  const [deletingException, setDeletingException] = useState(false);

  // Deep-link support for the Subs list page's "Add Schedule" action
  // (/sub-schedules?subId=<email>&addSchedule=1) — resolved against the
  // subcontractor list once it's loaded, since the URL only carries the id.
  const searchParams = useSearchParams();
  const deepLinkHandledRef = useRef(false);
  useEffect(() => {
    if (deepLinkHandledRef.current) return;
    if (searchParams.get("addSchedule") !== "1") return;
    const subId = searchParams.get("subId");
    if (!subId || allTeamLeaders.length === 0) return;
    deepLinkHandledRef.current = true;
    const match = allTeamLeaders.find((r) => normalizeForMatch(r.id) === normalizeForMatch(subId));
    if (match) {
      setSelectedTeamLeader({ id: match.id, label: formatTeamLeaderLabel(match) });
      setTeamLeaderQuery(formatTeamLeaderLabel(match));
    }
    setAddScheduleModalOpen(true);
  }, [searchParams, allTeamLeaders]);

  useEffect(() => {
    setAdminName(getStoredAdminName());
  }, []);

  const [teamLeaderReloadToken, setTeamLeaderReloadToken] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setTeamLeaderLoading(true);
    setTeamLeaderLoadFailed(false);
    (async () => {
      try {
        const res = await fetch("/api/subcontractors");
        const data = (await res.json()) as SubcontractorsApiResponse;
        if (cancelled) return;
        if (!res.ok || data.success === false) {
          // Distinguish "the fetch itself failed" (e.g. the Apps Script
          // timeout this page has already hit) from "genuinely no
          // subcontractors" — silently leaving this empty reads as a data
          // bug rather than a transient backend failure.
          setTeamLeaderLoadFailed(true);
          return;
        }
        // SubID in the SubSchedules sheet is the subcontractor's email — the
        // subcontractor portal's own schedule submission (sub-schedule-tab.tsx)
        // writes sub.email as SubID, falling back to id/subcontractorId only
        // if email is missing. Most subcontractor records have no generic
        // id/ID/subcontractorId at all (the Subcontractors admin page has a
        // dedicated "Missing ID" state for this), so matching that priority
        // order here is required for the resolved SubID to ever match real data.
        const options = (data.subcontractors ?? [])
          .map((sub) => ({
            id:
              sub.email || sub.Email || sub["Email Address"] || sub.emailAddress ||
              sub.id || sub.ID || sub.subcontractorId || "",
            companyName: sub.companyName || sub.CompanyName || sub["Company Name"] || sub.company || "",
            contactName: sub.contactName || sub.ContactName || sub["Contact Name"] || sub.name || "",
          }))
          .filter((option) => option.id && (option.companyName || option.contactName));
        setAllTeamLeaders(options);
      } catch {
        if (!cancelled) setTeamLeaderLoadFailed(true);
      } finally {
        if (!cancelled) setTeamLeaderLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [teamLeaderReloadToken]);

  function handleAdminNameChange(value: string) {
    setAdminName(value);
    if (typeof window !== "undefined") {
      window.localStorage.setItem("cwAdminName", value);
    }
  }

  function resolveAccountName(accountId: string): string {
    return accountNamesById[accountId] || accountId;
  }

  function formatTeamLeaderLabel(record: TeamLeaderRecord): string {
    return record.contactName && record.companyName
      ? `${record.contactName} — ${record.companyName}`
      : record.contactName || record.companyName;
  }

  // SubID -> "Contact — Company", same format the dropdown uses, so the
  // table and the search field are visually consistent. Keyed by normalized
  // id since SubID matching elsewhere on this page is also normalized
  // (trim + lowercase) to tolerate case/whitespace differences in the sheet.
  const teamLeaderNamesById = useMemo(() => {
    const map: Record<string, string> = {};
    for (const record of allTeamLeaders) {
      map[normalizeForMatch(record.id)] = formatTeamLeaderLabel(record);
    }
    return map;
  }, [allTeamLeaders]);

  function resolveTeamLeaderName(subId: string): string {
    return teamLeaderNamesById[normalizeForMatch(subId)] || subId;
  }

  // Subcontractor search — client-side filter of the already-loaded list,
  // matching either the company name or the contact/personal name (staff
  // often know a sub by first name rather than company name). When a record
  // has both, the dropdown shows "Contact — Company" so staff can visually
  // confirm they picked the right person when a first name is ambiguous.
  const teamLeaderOptions = useMemo(() => {
    if (selectedTeamLeader) return [];
    const q = debouncedTeamLeaderQuery.trim().toLowerCase();
    if (q.length < 2) return [];
    return allTeamLeaders
      .filter(
        (record) =>
          record.companyName.toLowerCase().includes(q) || record.contactName.toLowerCase().includes(q)
      )
      .slice(0, 8)
      .map((record) => ({ id: record.id, label: formatTeamLeaderLabel(record) }));
  }, [allTeamLeaders, debouncedTeamLeaderQuery, selectedTeamLeader]);

  const hasSearch = !!(customer.selected || selectedTeamLeader);

  async function loadSchedules() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/admin/sub-schedules");
      const data = (await res.json()) as { schedules?: SubSchedule[]; error?: string };
      if (!res.ok) {
        setError(data.error ?? "Failed to load schedules.");
        return;
      }
      setSchedules(data.schedules ?? []);
    } catch {
      setError("Network error loading schedules.");
    } finally {
      setLoading(false);
    }
  }

  async function loadExceptions() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/admin/schedule-exceptions");
      const data = (await res.json()) as { exceptions?: ScheduleException[]; error?: string };
      if (!res.ok) {
        setError(data.error ?? "Failed to load exceptions.");
        return;
      }
      setExceptions(data.exceptions ?? []);
    } catch {
      setError("Network error loading exceptions.");
    } finally {
      setLoading(false);
    }
  }

  // Search-first: nothing loads until a customer or Subcontractor is selected.
  // Schedules are always fetched once a search is active (even on the
  // Exceptions tab) because a Subcontractor search on exceptions needs to
  // cross-reference which AccountIDs that sub is scheduled for — the
  // ScheduleExceptions tab has no SubID column of its own.
  useEffect(() => {
    if (!hasSearch) {
      setSchedules([]);
      setExceptions([]);
      return;
    }
    loadSchedules();
    if (adminTab === "exceptions") loadExceptions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adminTab, customer.selected, selectedTeamLeader]);

  const today = useMemo(() => todayISO(), []);

  const filteredSchedules = useMemo(() => {
    return schedules.filter((s) => {
      const matchesAccount = !customer.selected || s.accountId === customer.selected.id;
      const matchesSub =
        !selectedTeamLeader || normalizeForMatch(s.subId) === normalizeForMatch(selectedTeamLeader.id);
      return matchesAccount && matchesSub;
    });
  }, [schedules, customer.selected, selectedTeamLeader]);

  const accountIdsForTeamLeader = useMemo(() => {
    if (!selectedTeamLeader) return null;
    const targetId = normalizeForMatch(selectedTeamLeader.id);
    return new Set(
      schedules.filter((s) => normalizeForMatch(s.subId) === targetId).map((s) => s.accountId)
    );
  }, [schedules, selectedTeamLeader]);

  const filteredExceptions = useMemo(() => {
    return exceptions.filter((ex) => {
      const matchesAccount = !customer.selected || ex.accountId === customer.selected.id;
      const matchesSub = !accountIdsForTeamLeader || accountIdsForTeamLeader.has(ex.accountId);
      return matchesAccount && matchesSub;
    });
  }, [exceptions, customer.selected, accountIdsForTeamLeader]);

  async function toggleScheduleStatus(schedule: SubSchedule) {
    if (!adminName.trim()) {
      setError("Enter your name above before making changes.");
      return;
    }
    const nextStatus = isScheduleEffectivelyActive(schedule) ? "Inactive" : "Active";
    try {
      const res = await fetch("/api/admin/sub-schedules", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sheetRow: schedule.sheetRow,
          lastEditedBy: adminName.trim(),
          fields: { status: nextStatus },
        }),
      });
      const data = (await res.json()) as { success?: boolean; error?: string };
      if (!res.ok || !data.success) {
        setError(data.error ?? "Failed to update status.");
        return;
      }
      loadSchedules();
    } catch {
      setError("Network error. Please try again.");
    }
  }

  async function deleteException(exception: ScheduleException) {
    setDeletingException(true);
    try {
      const res = await fetch("/api/admin/schedule-exceptions", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sheetRow: exception.sheetRow }),
      });
      const data = (await res.json()) as { success?: boolean; error?: string };
      if (!res.ok || !data.success) {
        setError(data.error ?? "Failed to delete exception.");
        return;
      }
      loadExceptions();
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setDeletingException(false);
      setExceptionToDelete(null);
    }
  }

  const scheduleActions = (s: SubSchedule) => (
    <div className="ui-actions-row">
      <BigButton kind="second" onClick={() => setScheduleModal(s)} aria-label={`Edit the schedule for ${resolveAccountName(s.accountId)}`}>
        {LABELS.edit}
      </BigButton>
      <BigButton kind="quiet" onClick={() => void toggleScheduleStatus(s)}>
        {isScheduleEffectivelyActive(s, today) ? "Deactivate" : "Reactivate"}
      </BigButton>
    </div>
  );
  const scheduleStatus = (s: SubSchedule) => (
    <StatusPill kind={isScheduleEffectivelyActive(s, today) ? "done" : "off"}>{s.status || "No status"}</StatusPill>
  );
  const effectiveText = (s: SubSchedule) => `${s.effectiveStart || "No start date"}${s.effectiveEnd ? ` to ${s.effectiveEnd}` : ""}`;
  const submittedText = (s: SubSchedule) =>
    `${s.submittedBy || "Not known"}${s.submittedVia === "Admin" ? " (Admin)" : ""}${s.submittedDate ? `, ${s.submittedDate}` : ""}`;
  const exceptionActions = (ex: ScheduleException) => (
    <div className="ui-actions-row">
      <BigButton kind="second" onClick={() => setExceptionModal(ex)}>
        {LABELS.edit}
      </BigButton>
      <BigButton kind="quiet" onClick={() => setExceptionToDelete(ex)}>
        {LABELS.remove}
      </BigButton>
    </div>
  );

  return (
    <Screen
      title="Sub Schedules"
      subtitle="Manage recurring subcontractor schedules and one-off schedule exceptions."
      action={
        adminTab === "schedules" ? (
          <BigButton icon="plus" onClick={() => setAddScheduleModalOpen(true)}>
            Add schedule
          </BigButton>
        ) : adminTab === "exceptions" ? (
          <BigButton icon="plus" onClick={() => setExceptionModal("new")}>
            New exception
          </BigButton>
        ) : undefined
      }
    >
      <Field
        label="Your name (for edits)"
        hint="Used when editing a schedule or creating a schedule exception."
        value={adminName}
        onChange={(e) => handleAdminNameChange(e.target.value)}
        placeholder="Enter your name"
      />

      <FilterChips
        label="Show"
        options={[
          { value: "schedules", label: "Sub Schedules" },
          { value: "exceptions", label: "Schedule Exceptions" },
          { value: "calendar", label: "Full Calendar" },
        ]}
        value={adminTab}
        onChange={setAdminTab}
      />

      {error ? <ErrorBox title="That did not work." text={error} /> : null}

      {adminTab === "calendar" ? (
        <FullCalendar
          accountOptions={allAccountOptions}
          resolveAccountName={resolveAccountName}
          teamLeaderNamesById={teamLeaderNamesById}
          resolveTeamLeaderName={resolveTeamLeaderName}
          onJumpToAccount={(accountId, accountLabel) => {
            customer.select({ id: accountId, label: accountLabel });
            setSelectedTeamLeader(null);
            setTeamLeaderQuery("");
            setAdminTab("schedules");
          }}
        />
      ) : (
        <>
          <div className="ui-two">
            <AutocompleteField
              label="Customer"
              placeholder="Search customer name"
              query={customer.query}
              onQueryChange={customer.setQuery}
              options={customer.options}
              loading={customer.loading}
              selected={customer.selected}
              onSelect={customer.select}
              onClear={customer.clear}
            />

            <div>
              <AutocompleteField
                label="Subcontractor"
                placeholder="Search subcontractor name"
                query={teamLeaderQuery}
                onQueryChange={(value) => {
                  setTeamLeaderQuery(value);
                  if (selectedTeamLeader) setSelectedTeamLeader(null);
                }}
                options={teamLeaderOptions}
                loading={teamLeaderLoading && !selectedTeamLeader}
                selected={selectedTeamLeader}
                onSelect={(option) => {
                  setSelectedTeamLeader(option);
                  setTeamLeaderQuery(option.label);
                }}
                onClear={() => {
                  setSelectedTeamLeader(null);
                  setTeamLeaderQuery("");
                }}
              />
              {teamLeaderLoadFailed && (
                <ErrorBox
                  title="The subcontractors did not load."
                  text="The backend may be slow right now."
                  onRetry={() => setTeamLeaderReloadToken((n) => n + 1)}
                />
              )}
            </div>
          </div>

          {!hasSearch ? (
            <EmptyState icon="search" title="Search to see results" text="Search by customer name or subcontractor name above." />
          ) : loading ? (
            <SkeletonList rows={3} />
          ) : adminTab === "schedules" ? (
            filteredSchedules.length === 0 ? (
              <EmptyState title="No sub schedules found" text="Nothing is scheduled for this search yet." />
            ) : (
              <CardList
                label="Sub schedules"
                items={filteredSchedules}
                getKey={(s) => String(s.sheetRow)}
                renderCard={(s) => (
                  <Card title={resolveAccountName(s.accountId)} right={scheduleStatus(s)}>
                    <p className="ui-card-text">{resolveTeamLeaderName(s.subId)}</p>
                    <p className="ui-card-text">
                      {describeFrequency(s)} · {describeDayOrOccurrence(s)} · {s.timeWindow || "No time window"}
                    </p>
                    <p className="ui-card-text">{effectiveText(s)}</p>
                    <p className="ui-card-text">Submitted by {submittedText(s)}</p>
                    <div style={{ marginTop: 12 }}>{scheduleActions(s)}</div>
                  </Card>
                )}
                columns={[
                  { header: "Customer", cell: (s) => <span className="ui-strong">{resolveAccountName(s.accountId)}</span> },
                  { header: "Subcontractor", cell: (s) => resolveTeamLeaderName(s.subId) },
                  { header: "Day / Occurrence", cell: (s) => describeDayOrOccurrence(s) },
                  { header: "Window", cell: (s) => s.timeWindow || "None" },
                  { header: "Frequency", cell: (s) => describeFrequency(s) },
                  { header: "Effective", cell: (s) => effectiveText(s) },
                  { header: "Status", cell: (s) => scheduleStatus(s) },
                  { header: "Submitted", cell: (s) => submittedText(s) },
                  { header: "Actions", cell: (s) => scheduleActions(s) },
                ]}
              />
            )
          ) : filteredExceptions.length === 0 ? (
            <EmptyState title="No schedule exceptions found" text="Nothing was skipped or moved for this search." />
          ) : (
            <CardList
              label="Schedule exceptions"
              items={filteredExceptions}
              getKey={(ex) => String(ex.sheetRow)}
              renderCard={(ex) => (
                <Card title={resolveAccountName(ex.accountId)} right={<StatusPill kind="waiting">{ex.type || "No type"}</StatusPill>}>
                  <p className="ui-card-text">
                    {ex.originalDate}
                    {ex.newDate ? ` → ${ex.newDate}` : ""}
                    {ex.newTimeWindow ? ` (${ex.newTimeWindow})` : ""}
                  </p>
                  {ex.reason ? <p className="ui-card-text">{ex.reason}</p> : null}
                  <p className="ui-card-text">
                    Created by {ex.createdBy || "Not known"}
                    {ex.createdDate ? `, ${ex.createdDate}` : ""}
                  </p>
                  <div style={{ marginTop: 12 }}>{exceptionActions(ex)}</div>
                </Card>
              )}
              columns={[
                { header: "Customer", cell: (ex) => <span className="ui-strong">{resolveAccountName(ex.accountId)}</span> },
                { header: "Original Date", cell: (ex) => <span className="ui-nowrap">{ex.originalDate}</span> },
                { header: "Type", cell: (ex) => ex.type },
                { header: "New Date", cell: (ex) => ex.newDate || "None" },
                { header: "New Window", cell: (ex) => ex.newTimeWindow || "None" },
                { header: "Reason", cell: (ex) => ex.reason },
                { header: "Created", cell: (ex) => `${ex.createdBy || "Not known"}${ex.createdDate ? `, ${ex.createdDate}` : ""}` },
                { header: "Actions", cell: (ex) => exceptionActions(ex) },
              ]}
            />
          )}
        </>
      )}

      <ConfirmSheet
        open={exceptionToDelete !== null}
        title="Remove this exception?"
        text={
          exceptionToDelete
            ? `${resolveAccountName(exceptionToDelete.accountId)}, ${exceptionToDelete.originalDate}. The regular schedule applies again on that day.`
            : ""
        }
        confirmLabel="Remove exception"
        busy={deletingException}
        busyLabel="Removing…"
        onConfirm={() => {
          if (exceptionToDelete) void deleteException(exceptionToDelete);
        }}
        onCancel={() => setExceptionToDelete(null)}
      />

      {scheduleModal ? (
        <ScheduleModal
          target={scheduleModal}
          accountName={resolveAccountName(scheduleModal.accountId)}
          adminName={adminName}
          onClose={() => setScheduleModal(null)}
          onSaved={loadSchedules}
        />
      ) : null}

      {exceptionModal ? (
        <ExceptionModal
          target={exceptionModal}
          adminName={adminName}
          accountName={exceptionModal !== "new" ? resolveAccountName(exceptionModal.accountId) : undefined}
          onClose={() => setExceptionModal(null)}
          onSaved={loadExceptions}
        />
      ) : null}

      {addScheduleModalOpen ? (
        <AddScheduleModal
          initialAccount={customer.selected}
          initialSub={selectedTeamLeader}
          allAccountOptions={allAccountOptions}
          allTeamLeaders={allTeamLeaders}
          adminName={adminName}
          onClose={() => setAddScheduleModalOpen(false)}
          onCreated={({ account, sub }) => {
            setAddScheduleModalOpen(false);
            // Selecting these triggers the page's own search effect, which
            // reloads schedules — no separate loadSchedules() call needed.
            customer.select(account);
            setSelectedTeamLeader(sub);
            setTeamLeaderQuery(sub.label);
          }}
        />
      ) : null}
    </Screen>
  );
}
