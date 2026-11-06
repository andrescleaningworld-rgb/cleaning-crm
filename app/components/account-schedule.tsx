"use client";

// An account's cleaning schedule, with the shared schedule form
// (./schedule-editor.tsx):
//   useAccountSchedule(accountId)   its schedules (one per sub) and its own sub
//   saveSchedule(…)                 saves through /api/admin/sub-schedules
//   <AccountScheduleSection />      the optional section on Add / Edit Account
//   <AccountScheduleDetail />       the "Schedule" line on the account page;
//                                   tap it to change the schedule
// Everything is stored in Sub Schedules, so the calendar, Coverage and the
// sub's portal see it.

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { BigButton, Card, ErrorBox, Field, Sheet, showToast } from "@/app/ui";
import ScheduleEditor from "./schedule-editor";
import {
  describeRows,
  emptyPlan,
  groupScheduleRows,
  planIsEmpty,
  planProblems,
  planToEntries,
  rowsToPlan,
  samePlan,
  type GroupableRow,
  type ScheduleGroup,
  type SchedulePlan,
} from "@/lib/schedule-plan";
import { isScheduleEffectivelyActive, todayISO } from "@/lib/scheduleRecurrence";

export type StoredScheduleRow = GroupableRow & { sheetRow: number };
export type AccountSub = { email: string; name: string };

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/** The account's running schedules (one per sub, usually one), and the sub on the account. */
export function useAccountSchedule(accountId: string) {
  const [state, setState] = useState<"loading" | "ready" | "failed">("loading");
  const [groups, setGroups] = useState<ScheduleGroup<StoredScheduleRow>[]>([]);
  const [accountSub, setAccountSub] = useState<AccountSub>({ email: "", name: "" });
  const [version, setVersion] = useState(0);

  useEffect(() => {
    if (!accountId) return;
    let alive = true;
    fetch(`/api/admin/sub-schedules?accountId=${encodeURIComponent(accountId)}`, { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("not loaded");
        return (await response.json()) as { schedules?: StoredScheduleRow[]; accountSub?: AccountSub };
      })
      .then((data) => {
        if (!alive) return;
        const today = todayISO();
        const running = (data.schedules ?? []).filter((row) => isScheduleEffectivelyActive(row, today));
        setGroups(withoutReplaced(groupScheduleRows(running)));
        setAccountSub(data.accountSub ?? { email: "", name: "" });
        setState("ready");
      })
      .catch(() => {
        if (alive) setState("failed");
      });
    return () => {
      alive = false;
    };
  }, [accountId, version]);

  const reload = useCallback(() => setVersion((value) => value + 1), []);
  return { state, groups, accountSub, reload };
}

/**
 * A schedule that ends because a newer one for the same sub takes over after
 * it (a Price & frequency change with a later start) is still running until
 * then, but the account shows and edits the new one.
 */
function withoutReplaced<Row extends GroupableRow>(groups: ScheduleGroup<Row>[]): ScheduleGroup<Row>[] {
  const endOf = (group: ScheduleGroup<Row>) => group.rows[0]?.storedEffectiveEnd ?? group.rows[0]?.effectiveEnd ?? "";
  const startOf = (group: ScheduleGroup<Row>) => group.rows[0]?.effectiveStart ?? "";
  return groups.filter((group) => {
    const end = endOf(group);
    if (!end) return true;
    return !groups.some((other) => other !== group && same(other.subId, group.subId) && startOf(other) > end);
  });
}

/** The schedule a form edits: the one for this sub, else the first one running. */
export function pickGroup<Row extends GroupableRow>(groups: ScheduleGroup<Row>[], subEmail: string): ScheduleGroup<Row> | null {
  return groups.find((group) => subEmail && same(group.subId, subEmail)) ?? groups[0] ?? null;
}

export async function saveSchedule(input: {
  accountId: string;
  accountName: string;
  /** The sub's email; "" when the account has no sub yet. */
  subId: string;
  plan: SchedulePlan;
  /** The rows this schedule replaces (closed the day before it starts). */
  closeScheduleIds: string[];
  startDate?: string;
  submittedBy?: string;
  /** Keep the old rows running (Active) up to the day before the start, instead of marking them Superseded. */
  keepOldUntilStart?: boolean;
}): Promise<{ ok: true; summary: string; startDate: string } | { ok: false; error: string }> {
  try {
    const response = await fetch("/api/admin/sub-schedules", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "replaceSchedule",
        accountId: input.accountId,
        accountName: input.accountName,
        subId: input.subId,
        submittedBy: input.submittedBy ?? "",
        frequency: input.plan.frequency,
        entries: planToEntries(input.plan),
        closeScheduleIds: input.closeScheduleIds,
        startDate: input.startDate ?? "",
        keepOldUntilStart: input.keepOldUntilStart === true,
      }),
    });
    const data = (await response.json().catch(() => ({}))) as { success?: boolean; error?: string; summary?: string; startDate?: string };
    if (!response.ok || !data.success) return { ok: false, error: data.error || "The schedule was not saved." };
    return { ok: true, summary: data.summary ?? "", startDate: data.startDate ?? "" };
  } catch {
    return { ok: false, error: "No connection. The schedule was not saved." };
  }
}

/** The optional schedule section on Add Account and Edit Account. */
export function AccountScheduleSection({
  plan,
  onChange,
  showProblems,
  disabled,
  note,
}: {
  plan: SchedulePlan;
  onChange: (plan: SchedulePlan) => void;
  showProblems?: boolean;
  disabled?: boolean;
  note?: ReactNode;
}) {
  return (
    <Card title="Cleaning schedule">
      <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 12 }}>
        <p className="ui-hint" style={{ margin: 0 }}>
          Add schedule if you know it. You can leave it empty and add it later.
        </p>
        {note}
        <ScheduleEditor value={plan} onChange={onChange} showProblems={showProblems} disabled={disabled} />
        {!planIsEmpty(plan) ? (
          <div>
            <BigButton kind="quiet" onClick={() => onChange(emptyPlan())} disabled={disabled}>
              Clear schedule
            </BigButton>
          </div>
        ) : null}
      </div>
    </Card>
  );
}

/**
 * "Schedule" in the account's Snapshot: the schedule in words. Tap it to
 * change it. With no schedule: an Add schedule button, then `fallback`
 * (the account's old Cleaning Days / Time / Frequency fields).
 */
export function AccountScheduleDetail({
  accountId,
  accountName,
  fallback,
  onSaved,
}: {
  accountId: string;
  accountName: string;
  fallback?: ReactNode;
  onSaved?: () => void;
}) {
  const { state, groups, accountSub, reload } = useAccountSchedule(accountId);
  const [editing, setEditing] = useState<ScheduleGroup<StoredScheduleRow> | "new" | null>(null);

  if (state === "loading") {
    return (
      <div className="ui-detail">
        <dt>Schedule</dt>
        <dd className="ui-muted">Checking…</dd>
      </div>
    );
  }

  const sheet = editing ? (
    <ScheduleSheet
      accountId={accountId}
      accountName={accountName}
      subId={editing === "new" ? accountSub.email : editing.subId}
      rows={editing === "new" ? [] : editing.rows}
      onClose={() => setEditing(null)}
      onSaved={() => {
        setEditing(null);
        reload();
        onSaved?.();
      }}
    />
  ) : null;

  if (groups.length === 0) {
    return (
      <>
        <div className="ui-detail">
          <dt>Schedule</dt>
          <dd>
            {state === "failed" ? <span className="ui-muted">The schedule did not load. </span> : null}
            <button type="button" className="ui-sched-line underline decoration-dotted underline-offset-4" onClick={() => setEditing("new")}>
              + Add schedule
            </button>
            {sheet}
          </dd>
        </div>
        {fallback}
      </>
    );
  }

  return (
    <>
      {groups.map((group) => (
        <div key={group.key} className="ui-detail ui-detail-full">
          <dt>{groups.length > 1 ? `Schedule (${same(group.subId, accountSub.email) && accountSub.name ? accountSub.name : group.subId || "no sub"})` : "Schedule"}</dt>
          <dd>
            <button
              type="button"
              className="ui-sched-line text-left underline decoration-dotted underline-offset-4"
              onClick={() => setEditing(group)}
              aria-label={`Change the schedule: ${describeRows(group.rows)}`}
            >
              {describeRows(group.rows)}
            </button>
          </dd>
        </div>
      ))}
      {sheet}
    </>
  );
}

/** The schedule form in a sheet: change a schedule (rows) or add one (no rows). */
export function ScheduleSheet({
  accountId,
  accountName,
  subId,
  rows,
  submittedBy,
  onClose,
  onSaved,
  title,
}: {
  accountId: string;
  accountName: string;
  subId: string;
  rows: StoredScheduleRow[];
  submittedBy?: string;
  onClose: () => void;
  onSaved: (summary: string) => void;
  title?: string;
}) {
  const [initial] = useState(() => rowsToPlan(rows));
  const [plan, setPlan] = useState<SchedulePlan>(initial);
  const [startDate, setStartDate] = useState(todayISO());
  const [saving, setSaving] = useState(false);
  const [tried, setTried] = useState(false);
  const [error, setError] = useState("");
  const isNew = rows.length === 0;
  const changed = !samePlan(plan, initial);

  async function save() {
    setTried(true);
    setError("");
    if (planProblems(plan).length > 0) return;
    if (!changed) {
      onClose();
      return;
    }
    setSaving(true);
    const result = await saveSchedule({
      accountId,
      accountName,
      subId,
      plan,
      closeScheduleIds: rows.map((row) => row.scheduleId),
      startDate,
      submittedBy,
    });
    setSaving(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    showToast("Schedule saved ✓");
    onSaved(result.summary);
  }

  return (
    <Sheet
      open
      title={title ?? (isNew ? "Add schedule" : "Change schedule")}
      text={accountName}
      onClose={() => {
        if (!saving) onClose();
      }}
      busy={saving}
      actions={
        <BigButton busy={saving} busyLabel="Saving…" onClick={() => void save()}>
          Save schedule
        </BigButton>
      }
    >
      <ScheduleEditor value={plan} onChange={setPlan} showProblems={tried} disabled={saving} />
      {!isNew && changed ? (
        <Field
          label="Starts on"
          hint="Cleanings before this day stay as they were."
          type="date"
          min={todayISO()}
          value={startDate}
          onChange={(event) => setStartDate(event.target.value)}
        />
      ) : null}
      {error ? <ErrorBox title="The schedule was not saved." text={error} /> : null}
    </Sheet>
  );
}
