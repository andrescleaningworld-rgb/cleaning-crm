"use client";

import { useMemo, useState } from "react";
import { AutocompleteField, useDebounce, type SearchOption } from "./autocomplete";
import { BigButton, ErrorBox, Sheet, showToast } from "@/app/ui";
import ScheduleEditor from "@/app/components/schedule-editor";
import { saveSchedule } from "@/app/components/account-schedule";
import { emptyPlan, planProblems, type SchedulePlan } from "@/lib/schedule-plan";

type TeamLeaderRecord = { id: string; companyName: string; contactName: string };

function formatTeamLeaderLabel(record: TeamLeaderRecord): string {
  return record.contactName && record.companyName
    ? `${record.contactName} — ${record.companyName}`
    : record.contactName || record.companyName;
}

type Props = {
  initialAccount: SearchOption | null;
  initialSub: SearchOption | null;
  allAccountOptions: SearchOption[];
  allTeamLeaders: TeamLeaderRecord[];
  adminName: string;
  onClose: () => void;
  onCreated: (created: { account: SearchOption; sub: SearchOption }) => void;
};

// Sub Center → Add schedule: pick the customer and the sub, then the shared
// schedule form (app/components/schedule-editor.tsx). Saved like every other
// schedule form; the sub is emailed and sees it in their portal.
export default function AddScheduleModal({
  initialAccount,
  initialSub,
  allAccountOptions,
  allTeamLeaders,
  adminName,
  onClose,
  onCreated,
}: Props) {
  const [accountQuery, setAccountQuery] = useState(initialAccount?.label ?? "");
  const [accountSelected, setAccountSelected] = useState<SearchOption | null>(initialAccount);
  const debouncedAccountQuery = useDebounce(accountQuery, 200);
  const accountOptions = useMemo(() => {
    if (accountSelected) return [];
    const q = debouncedAccountQuery.trim().toLowerCase();
    if (q.length < 2) return [];
    return allAccountOptions.filter((o) => o.label.toLowerCase().includes(q)).slice(0, 8);
  }, [allAccountOptions, debouncedAccountQuery, accountSelected]);

  const [subQuery, setSubQuery] = useState(initialSub?.label ?? "");
  const [subSelected, setSubSelected] = useState<SearchOption | null>(initialSub);
  const debouncedSubQuery = useDebounce(subQuery, 200);
  const subOptions = useMemo(() => {
    if (subSelected) return [];
    const q = debouncedSubQuery.trim().toLowerCase();
    if (q.length < 2) return [];
    return allTeamLeaders
      .filter((r) => r.companyName.toLowerCase().includes(q) || r.contactName.toLowerCase().includes(q))
      .slice(0, 8)
      .map((r) => ({ id: r.id, label: formatTeamLeaderLabel(r) }));
  }, [allTeamLeaders, debouncedSubQuery, subSelected]);

  const [plan, setPlan] = useState<SchedulePlan>(emptyPlan);
  const [tried, setTried] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const missing = !accountSelected ? "Pick the customer." : !subSelected ? "Pick the subcontractor." : "";

  async function handleSubmit() {
    setTried(true);
    setError("");
    if (missing || !accountSelected || !subSelected) return;
    if (planProblems(plan).length > 0) return;
    setSubmitting(true);
    const result = await saveSchedule({
      accountId: accountSelected.id,
      accountName: accountSelected.label,
      subId: subSelected.id,
      plan,
      closeScheduleIds: [],
      submittedBy: adminName.trim(),
    });
    setSubmitting(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    showToast("Schedule saved ✓");
    onCreated({ account: accountSelected, sub: subSelected });
  }

  return (
    <Sheet
      open
      title="Add schedule"
      text="The sub is emailed and sees it in their portal."
      onClose={() => {
        if (!submitting) onClose();
      }}
      busy={submitting}
      actions={
        <BigButton busy={submitting} busyLabel="Saving…" onClick={() => void handleSubmit()}>
          Save schedule
        </BigButton>
      }
    >
      <AutocompleteField
        label="Customer"
        placeholder="Search customer name"
        query={accountQuery}
        onQueryChange={setAccountQuery}
        options={accountOptions}
        loading={false}
        selected={accountSelected}
        onSelect={(o) => {
          setAccountSelected(o);
          setAccountQuery(o.label);
        }}
        onClear={() => {
          setAccountSelected(null);
          setAccountQuery("");
        }}
      />
      <AutocompleteField
        label="Subcontractor"
        placeholder="Search subcontractor name"
        query={subQuery}
        onQueryChange={setSubQuery}
        options={subOptions}
        loading={false}
        selected={subSelected}
        onSelect={(o) => {
          setSubSelected(o);
          setSubQuery(o.label);
        }}
        onClear={() => {
          setSubSelected(null);
          setSubQuery("");
        }}
      />

      <ScheduleEditor value={plan} onChange={setPlan} showProblems={tried} disabled={submitting} />

      {tried && missing ? <p className="ui-field-error">⚠ {missing}</p> : null}
      {error ? <ErrorBox title="The schedule was not saved." text={error} /> : null}
    </Sheet>
  );
}
