"use client";

// Sub portal → My Schedule: the sub sets the schedule for each of their
// accounts with the same schedule form the office uses
// (app/components/schedule-editor.tsx), without "Time on site": subs answer
// that on their own Time on site page, where the office's review rule
// applies. Saved through POST /api/subcontractor-schedules.
//
// Same rules as before: a sub sets a schedule when there is none, and may
// update one the office set up (the office is emailed); their own submitted
// schedule is changed by the office.

import { useCallback, useEffect, useMemo, useState } from "react";
import { BigButton } from "@/app/ui";
import ScheduleEditor from "@/app/components/schedule-editor";
import { pickGroup } from "@/app/components/account-schedule";
import { describeRows, emptyPlan, groupScheduleRows, planProblems, planToEntries, rowsToPlan, type ScheduleGroup, type SchedulePlan } from "@/lib/schedule-plan";
import { isScheduleEffectivelyActive } from "@/lib/scheduleRecurrence";

type ScheduleAccount = {
  id?: string;
  accountId?: string;
  accountName?: string;
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
};

type ScheduleSubcontractor = {
  id?: string;
  subcontractorId?: string;
  name?: string;
  subcontractorName?: string;
  companyName?: string;
  contactName?: string;
  email?: string;
};

type SubScheduleRecord = {
  sheetRow: number;
  scheduleId: string;
  accountId: string;
  subId: string;
  dayOfWeek: string;
  timeWindow: string;
  recurring: string;
  effectiveStart: string;
  effectiveEnd: string;
  storedEffectiveEnd?: string;
  status: string;
  submittedBy: string;
  submittedDate: string;
  lastEditedBy: string;
  lastEditedDate: string;
  frequency: string;
  monthlyOccurrence: string;
  submittedVia: string;
  scheduleType?: string;
  startTime?: string;
  windowStart?: string;
  windowEnd?: string;
  minutesOnSite?: number | null;
};

type Props = {
  accounts: ScheduleAccount[];
  subcontractor: ScheduleSubcontractor | null;
};

function cleanText(value: unknown): string {
  return String(value ?? "").trim();
}

function getAccountId(account: ScheduleAccount): string {
  return cleanText(account.accountId || account.id || account.accountName);
}

function getAccountName(account: ScheduleAccount): string {
  return cleanText(account.accountName) || "Unnamed Account";
}

function getFullAddress(account: ScheduleAccount): string {
  return [account.address, account.city, account.state, account.zip]
    .map(cleanText)
    .filter(Boolean)
    .join(", ");
}

function getSubDisplayName(sub: ScheduleSubcontractor | null): string {
  if (!sub) return "";
  return cleanText(sub.name || sub.subcontractorName || sub.companyName || sub.contactName || sub.email);
}

function getSubId(sub: ScheduleSubcontractor | null): string {
  if (!sub) return "";
  return cleanText(sub.email || sub.id || sub.subcontractorId);
}

// The office's day (US Eastern), not the browser's UTC date: in the evening
// UTC is already tomorrow, which would start the schedule a day late.
function todayISO(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function AccountScheduleForm({
  account,
  subId,
  submittedBy,
  current,
  onSaved,
}: {
  account: ScheduleAccount;
  subId: string;
  submittedBy: string;
  /** The schedule being updated (one the office set up), or null for a new one. */
  current: ScheduleGroup<SubScheduleRecord> | null;
  onSaved: () => void;
}) {
  const [plan, setPlan] = useState<SchedulePlan>(() => (current ? rowsToPlan(current.rows) : emptyPlan()));
  const [tried, setTried] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit() {
    setTried(true);
    setError("");
    if (planProblems(plan).length > 0) return;
    setSubmitting(true);
    const asNeeded = plan.frequency === "AS_NEEDED";
    try {
      const res = await fetch("/api/subcontractor-schedules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountId: getAccountId(account),
          accountName: getAccountName(account),
          subId,
          submittedBy,
          frequency: plan.frequency,
          effectiveStart: asNeeded ? "" : todayISO(),
          // No end date: the schedule runs until it is changed.
          effectiveEnd: "",
          entries: planToEntries(plan),
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { success?: boolean; error?: string };
      if (!res.ok || !data.success) {
        setError(data.error ?? "The schedule was not saved. Please try again.");
        return;
      }
      onSaved();
    } catch {
      setError("No connection. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="ui-stat" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <ScheduleEditor value={plan} onChange={setPlan} showProblems={tried} disabled={submitting} showTimeOnSite={false} />
      {error ? <p className="ui-field-error">{error}</p> : null}
      <BigButton busy={submitting} busyLabel="Saving…" onClick={() => void handleSubmit()}>
        Save schedule
      </BigButton>
    </div>
  );
}

export default function SubScheduleTab({ accounts, subcontractor }: Props) {
  const [schedulesByAccount, setSchedulesByAccount] = useState<Record<string, ScheduleGroup<SubScheduleRecord> | null>>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [expandedAccountId, setExpandedAccountId] = useState("");

  const subId = getSubId(subcontractor);
  const submittedBy = getSubDisplayName(subcontractor) || subId;

  const load = useCallback(async () => {
    setLoadError("");
    try {
      const res = await fetch("/api/subcontractor-schedules", { cache: "no-store" });
      const data = (await res.json()) as { schedules?: SubScheduleRecord[]; error?: string };
      if (!res.ok) {
        setLoadError(data.error ?? "Your schedules did not load.");
        return;
      }
      // Only schedules still running count; for each account, the one for this sub.
      const today = todayISO();
      const byAccount: Record<string, SubScheduleRecord[]> = {};
      for (const record of data.schedules ?? []) {
        const key = record.accountId.trim();
        if (!key || !isScheduleEffectivelyActive(record, today)) continue;
        (byAccount[key] ??= []).push(record);
      }
      const picked: Record<string, ScheduleGroup<SubScheduleRecord> | null> = {};
      for (const [key, rows] of Object.entries(byAccount)) picked[key] = pickGroup(groupScheduleRows(rows), subId);
      setSchedulesByAccount(picked);
    } catch {
      setLoadError("No connection. Your schedules did not load.");
    } finally {
      setLoading(false);
    }
  }, [subId]);

  useEffect(() => {
    void load();
  }, [load]);

  const sortedAccounts = useMemo(() => {
    return [...accounts].sort((a, b) => getAccountName(a).localeCompare(getAccountName(b)));
  }, [accounts]);

  function handleSaved() {
    setExpandedAccountId("");
    void load();
  }

  return (
    <section className="ui-card">
      <h2 className="ui-card-title">My Schedule</h2>
      <p className="ui-muted">
        Set up the schedule for each account you clean. Once it is saved, call the office if anything needs to change.
      </p>

      {loading ? <p className="ui-muted">Loading your schedules...</p> : null}

      {loadError ? <div className="ui-field-error">{loadError}</div> : null}

      {!loading && !loadError && sortedAccounts.length === 0 ? <p className="ui-muted">No assigned accounts found.</p> : null}

      <div className="mt-4 space-y-3">
        {sortedAccounts.map((account) => {
          const accountId = getAccountId(account);
          const existing = schedulesByAccount[accountId] ?? null;
          const hasSchedule = Boolean(existing && existing.rows.length > 0);
          // A schedule the office set up can be updated here (the office is
          // emailed, see POST /api/subcontractor-schedules); the sub's own
          // submission is changed by the office. All days of one schedule
          // share the same origin, so the first one tells.
          const isAdminCreated = hasSchedule && existing!.rows[0]?.submittedVia === "Admin";
          const isOpen = expandedAccountId === accountId;

          return (
            <div key={accountId || getAccountName(account)} className="ui-stat">
              <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="ui-strong">{getAccountName(account)}</p>
                  {getFullAddress(account) ? <p className="ui-muted">{getFullAddress(account)}</p> : null}
                </div>

                {!hasSchedule ? (
                  <span className="inline-flex w-fit items-center rounded-full bg-amber-100 px-3 py-1 text-base font-black uppercase text-amber-800">
                    Not set
                  </span>
                ) : isAdminCreated ? (
                  <span className="inline-flex w-fit items-center rounded-full bg-blue-100 px-3 py-1 text-base font-black uppercase text-blue-800">
                    Set up by office
                  </span>
                ) : (
                  <span className="inline-flex w-fit items-center rounded-full bg-green-100 px-3 py-1 text-base font-black uppercase text-green-800">
                    Submitted
                  </span>
                )}
              </div>

              {hasSchedule && !isOpen ? (
                <div className="ui-stat">
                  <p className="ui-sched-line">{describeRows(existing!.rows)}</p>
                  <p className="ui-muted">{isAdminCreated ? "Set up by the office." : "Submitted. Call the office for changes."}</p>
                  {isAdminCreated ? (
                    <BigButton kind="second" onClick={() => setExpandedAccountId(accountId)}>
                      Update schedule
                    </BigButton>
                  ) : null}
                </div>
              ) : isOpen ? (
                <>
                  {isAdminCreated ? (
                    <p className="ui-strong">Set up by the office. Change it below if it is not right. The office will be told.</p>
                  ) : null}
                  <AccountScheduleForm
                    account={account}
                    subId={subId}
                    submittedBy={submittedBy}
                    current={isAdminCreated ? existing : null}
                    onSaved={handleSaved}
                  />
                  <BigButton kind="quiet" onClick={() => setExpandedAccountId("")}>
                    Cancel
                  </BigButton>
                </>
              ) : (
                <BigButton kind="second" onClick={() => setExpandedAccountId(accountId)}>
                  Set your schedule
                </BigButton>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
