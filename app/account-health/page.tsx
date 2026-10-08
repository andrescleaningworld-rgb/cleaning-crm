"use client";

import { useState } from "react";
import {
  BigButton,
  Card,
  EmptyState,
  Field,
  LABELS,
  MoreMenu,
  Screen,
  SearchBar,
  SelectField,
  Sheet,
  StatusPill,
  TextAreaField,
  type StatusKind,
} from "@/app/ui";

type HealthStatus = "Good" | "Watch" | "Problem" | "Critical";
type ImprovementStatus = "Open" | "In Progress" | "Completed";

type AccountHealthItem = {
  id: number;
  date: string;
  accountName: string;
  manager: string;
  subcontractor: string;
  healthScore: number;
  healthStatus: HealthStatus;
  issueCategory: string;
  improvementStatus: ImprovementStatus;
  followUpDate: string;
  visibleToSubcontractor: string;
  internalNotes: string;
  subcontractorInstructions: string;
};

const startingHealthItems: AccountHealthItem[] = [
  {
    id: 1,
    date: "2026-06-08",
    accountName: "Independent Chemical",
    manager: "Andrés",
    subcontractor: "Vicky",
    healthScore: 5,
    healthStatus: "Problem",
    issueCategory: "Quality",
    improvementStatus: "In Progress",
    followUpDate: "2026-06-12",
    visibleToSubcontractor: "Yes",
    internalNotes:
      "Account has repeated quality concerns. Needs close monitoring, follow-up visits, and improvement tracking.",
    subcontractorInstructions:
      "Please pay extra attention to restrooms, common areas, trash, and detail cleaning. Report back after each service.",
  },
  {
    id: 2,
    date: "2026-06-08",
    accountName: "Lehmann Pools",
    manager: "Andrés",
    subcontractor: "Edgar",
    healthScore: 8,
    healthStatus: "Good",
    issueCategory: "General",
    improvementStatus: "Completed",
    followUpDate: "2026-06-20",
    visibleToSubcontractor: "Yes",
    internalNotes:
      "Account is stable. Continue routine monitoring and maintain communication.",
    subcontractorInstructions:
      "Continue current cleaning quality. Keep focus on restrooms and breakroom.",
  },
  {
    id: 3,
    date: "2026-06-07",
    accountName: "Paris Baguette",
    manager: "Drew",
    subcontractor: "Juana",
    healthScore: 6,
    healthStatus: "Watch",
    issueCategory: "Customer Expectations",
    improvementStatus: "Open",
    followUpDate: "2026-06-14",
    visibleToSubcontractor: "Yes",
    internalNotes:
      "High frequency account. Customer expectations need to be watched closely.",
    subcontractorInstructions:
      "Please keep customer-facing areas, floors, and back-of-house areas consistent every service.",
  },
];

const accountOptions = [
  "Lehmann Pools",
  "4Wall Entertainment",
  "Paris Baguette",
  "Independent Chemical",
];

const managerOptions = ["Andrés", "Greg", "Drew"];

const subcontractorOptions = ["Edgar", "Fernando", "Juana", "Vicky"];

const issueCategoryOptions = [
  "Quality",
  "Communication",
  "Customer Expectations",
  "Schedule",
  "Supplies",
  "Access",
  "Staffing",
  "General",
  "Other",
];

const healthStatusOptions: HealthStatus[] = [
  "Good",
  "Watch",
  "Problem",
  "Critical",
];

const improvementStatusOptions: ImprovementStatus[] = [
  "Open",
  "In Progress",
  "Completed",
];

function getTodayDate() {
  return new Date().toISOString().slice(0, 10);
}

function getHealthStatusFromScore(score: number): HealthStatus {
  if (score <= 3) {
    return "Critical";
  }

  if (score <= 5) {
    return "Problem";
  }

  if (score <= 7) {
    return "Watch";
  }

  return "Good";
}

function getHealthStatusDescription(status: HealthStatus) {
  if (status === "Critical") {
    return "0–3: Immediate attention required";
  }

  if (status === "Problem") {
    return "4–5: Active issue or repeated concern";
  }

  if (status === "Watch") {
    return "6–7: Monitor closely";
  }

  return "8–10: Stable account";
}

function healthKind(status: HealthStatus): StatusKind {
  if (status === "Critical" || status === "Problem") return "needs-you";
  if (status === "Watch") return "waiting";
  return "done";
}

function improvementKind(status: ImprovementStatus): StatusKind {
  return status === "Completed" ? "done" : "waiting";
}

export default function AccountHealthPage() {
  const [healthItems, setHealthItems] =
    useState<AccountHealthItem[]>(startingHealthItems);

  const [searchText, setSearchText] = useState("");
  // Layout only: the add form opens in a sheet.
  const [showForm, setShowForm] = useState(false);
  const [formError, setFormError] = useState("");

  const [formData, setFormData] = useState({
    date: getTodayDate(),
    accountName: "Lehmann Pools",
    manager: "Andrés",
    subcontractor: "Edgar",
    healthScore: 8,
    issueCategory: "General",
    improvementStatus: "Open" as ImprovementStatus,
    followUpDate: getTodayDate(),
    visibleToSubcontractor: "Yes",
    internalNotes: "",
    subcontractorInstructions: "",
  });

  const filteredHealthItems = healthItems.filter((item) => {
    const search = searchText.toLowerCase();

    return (
      item.date.toLowerCase().includes(search) ||
      item.accountName.toLowerCase().includes(search) ||
      item.manager.toLowerCase().includes(search) ||
      item.subcontractor.toLowerCase().includes(search) ||
      item.healthStatus.toLowerCase().includes(search) ||
      item.issueCategory.toLowerCase().includes(search) ||
      item.improvementStatus.toLowerCase().includes(search) ||
      item.followUpDate.toLowerCase().includes(search) ||
      item.visibleToSubcontractor.toLowerCase().includes(search) ||
      item.internalNotes.toLowerCase().includes(search) ||
      item.subcontractorInstructions.toLowerCase().includes(search)
    );
  });

  const totalTrackedAccounts = healthItems.length;

  const watchOrWorse = healthItems.filter(
    (item) =>
      item.healthStatus === "Watch" ||
      item.healthStatus === "Problem" ||
      item.healthStatus === "Critical"
  ).length;

  const openImprovements = healthItems.filter(
    (item) =>
      item.improvementStatus === "Open" ||
      item.improvementStatus === "In Progress"
  ).length;

  const averageHealthScore =
    healthItems.length > 0
      ? healthItems.reduce((total, item) => total + item.healthScore, 0) /
        healthItems.length
      : 0;

  function updateField(field: string, value: string) {
    setFormData((current) => {
      if (field === "healthScore") {
        return {
          ...current,
          [field]: Number(value),
        };
      }

      return {
        ...current,
        [field]: value,
      };
    });
  }

  function handleAddHealthItem(event?: React.FormEvent<HTMLFormElement>) {
    event?.preventDefault();

    if (!formData.internalNotes.trim()) {
      setFormError("Internal notes are required.");
      return;
    }
    setFormError("");
    setShowForm(false);

    const healthStatus = getHealthStatusFromScore(formData.healthScore);

    const newHealthItem: AccountHealthItem = {
      id: healthItems.length + 1,
      date: formData.date,
      accountName: formData.accountName,
      manager: formData.manager,
      subcontractor: formData.subcontractor,
      healthScore: formData.healthScore,
      healthStatus,
      issueCategory: formData.issueCategory,
      improvementStatus: formData.improvementStatus,
      followUpDate: formData.followUpDate,
      visibleToSubcontractor: formData.visibleToSubcontractor,
      internalNotes: formData.internalNotes,
      subcontractorInstructions: formData.subcontractorInstructions,
    };

    setHealthItems((current) => [newHealthItem, ...current]);

    setFormData((current) => ({
      ...current,
      healthScore: 8,
      issueCategory: "General",
      improvementStatus: "Open",
      followUpDate: getTodayDate(),
      visibleToSubcontractor: "Yes",
      internalNotes: "",
      subcontractorInstructions: "",
    }));
  }

  function clearForm() {
    setFormData({
      date: getTodayDate(),
      accountName: "Lehmann Pools",
      manager: "Andrés",
      subcontractor: "Edgar",
      healthScore: 8,
      issueCategory: "General",
      improvementStatus: "Open",
      followUpDate: getTodayDate(),
      visibleToSubcontractor: "Yes",
      internalNotes: "",
      subcontractorInstructions: "",
    });
  }

  const autoStatus = getHealthStatusFromScore(formData.healthScore);

  return (
    <Screen
      title="Account Health"
      subtitle="Track account condition, improvement plans, follow-up dates, and problem accounts before they get worse."
      headerRight={<MoreMenu items={[{ label: LABELS.print, onSelect: () => window.print() }]} />}
      action={
        <BigButton
          icon="plus"
          onClick={() => {
            setFormError("");
            setShowForm(true);
          }}
        >
          Add health item
        </BigButton>
      }
    >
      <div className="ui-stats">
        <div className="ui-stat">
          <p className="ui-stat-label">Tracked Items</p>
          <p className="ui-stat-value">{totalTrackedAccounts}</p>
        </div>
        <div className="ui-stat">
          <p className="ui-stat-label">Watch or Worse</p>
          <p className="ui-stat-value">{watchOrWorse}</p>
        </div>
        <div className="ui-stat">
          <p className="ui-stat-label">Open Improvements</p>
          <p className="ui-stat-value">{openImprovements}</p>
        </div>
        <div className="ui-stat">
          <p className="ui-stat-label">Avg. Health Score</p>
          <p className="ui-stat-value">{averageHealthScore.toFixed(1)}/10</p>
        </div>
      </div>

      <div className="no-print">
        <Card title="Smart Health Status Guide">
          <p className="ui-card-text">
            The system automatically calculates account health from the health score. Later, this can also include complaints, visits,
            follow-ups, and subcontractor performance.
          </p>
          <p className="ui-card-text ui-strong">Current logic: score-based</p>
          <div className="ui-stats" style={{ marginTop: 12 }}>
            {healthStatusOptions.map((status) => (
              <div key={status} className="ui-stat">
                <StatusPill kind={healthKind(status)}>{status}</StatusPill>
                <p className="ui-muted">{getHealthStatusDescription(status)}</p>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <div className="no-print">
        <SearchBar value={searchText} onChange={setSearchText} label="Search account health" placeholder="Search account health" />
        <p className="ui-hint">Search by account, manager, subcontractor, status, issue category, follow-up date, or notes.</p>
      </div>

      <div>
        <p className="ui-strong">Account Health Log</p>
        <p className="ui-muted">Latest health and improvement items appear first.</p>
      </div>

      {filteredHealthItems.length === 0 ? (
        <EmptyState icon="search" title="No account health items found" text={`Nothing matches “${searchText}”.`} />
      ) : (
        filteredHealthItems.map((item) => (
          <Card key={item.id} title={item.accountName}>
            <div className="ui-actions-row" style={{ marginTop: 4 }}>
              <StatusPill kind={healthKind(item.healthStatus)}>
                {item.healthStatus} • {item.healthScore}/10
              </StatusPill>
              <StatusPill kind={improvementKind(item.improvementStatus)}>{item.improvementStatus}</StatusPill>
              <StatusPill kind="off">{item.issueCategory}</StatusPill>
            </div>
            <p className="ui-card-text">
              {item.date} • Manager: {item.manager} • Subcontractor: {item.subcontractor} • Follow-Up: {item.followUpDate} • Visible to Sub:{" "}
              {item.visibleToSubcontractor}
            </p>
            <dl className="ui-details">
              {item.subcontractorInstructions ? (
                <div className="ui-detail ui-detail-full">
                  <dt>Subcontractor Instructions</dt>
                  <dd>{item.subcontractorInstructions}</dd>
                </div>
              ) : null}
              <div className="ui-detail ui-detail-full">
                <dt>Internal Notes / Improvement Plan</dt>
                <dd>{item.internalNotes}</dd>
              </div>
            </dl>
          </Card>
        ))
      )}

      <div className="no-print">
        <Card title="Future Smart Connection">
          <p className="ui-card-text">
            Later, account health will connect to complaints, visits, account updates, subcontractor performance, manager reports, and the
            dashboard. This will help identify problem accounts earlier using real data instead of only memory or customer complaints.
          </p>
        </Card>
      </div>

      <Sheet
        open={showForm}
        title="Add health item"
        text="Internal notes are required. Subcontractor instructions should only include information that can be shared with the subcontractor."
        onClose={() => setShowForm(false)}
        actions={<BigButton onClick={() => handleAddHealthItem()}>Add health item</BigButton>}
      >
        <Field label="Date" type="date" value={formData.date} onChange={(event) => updateField("date", event.target.value)} />
        <Field
          label="Account"
          list="health-account-options"
          value={formData.accountName}
          onChange={(event) => updateField("accountName", event.target.value)}
          placeholder="Type account name..."
        />
        <datalist id="health-account-options">
          {accountOptions.map((account) => (
            <option key={account} value={account} />
          ))}
        </datalist>
        <SelectField label="Manager" value={formData.manager} onChange={(event) => updateField("manager", event.target.value)}>
          {managerOptions.map((manager) => (
            <option key={manager}>{manager}</option>
          ))}
        </SelectField>
        <SelectField label="Subcontractor" value={formData.subcontractor} onChange={(event) => updateField("subcontractor", event.target.value)}>
          {subcontractorOptions.map((subcontractor) => (
            <option key={subcontractor}>{subcontractor}</option>
          ))}
        </SelectField>
        <Field
          label="Health score"
          hint="0 = critical, 10 = excellent"
          type="number"
          min="0"
          max="10"
          value={formData.healthScore}
          onChange={(event) => updateField("healthScore", event.target.value)}
        />
        <div>
          <p className="ui-label">Auto status</p>
          <StatusPill kind={healthKind(autoStatus)}>{autoStatus}</StatusPill>
        </div>
        <SelectField label="Issue category" value={formData.issueCategory} onChange={(event) => updateField("issueCategory", event.target.value)}>
          {issueCategoryOptions.map((category) => (
            <option key={category}>{category}</option>
          ))}
        </SelectField>
        <SelectField
          label="Improvement status"
          value={formData.improvementStatus}
          onChange={(event) => updateField("improvementStatus", event.target.value)}
        >
          {improvementStatusOptions.map((status) => (
            <option key={status}>{status}</option>
          ))}
        </SelectField>
        <Field label="Follow-up date" type="date" value={formData.followUpDate} onChange={(event) => updateField("followUpDate", event.target.value)} />
        <SelectField
          label="Visible to subcontractor?"
          value={formData.visibleToSubcontractor}
          onChange={(event) => updateField("visibleToSubcontractor", event.target.value)}
        >
          <option>Yes</option>
          <option>No</option>
        </SelectField>
        <TextAreaField
          label="Subcontractor instructions"
          optional
          rows={3}
          value={formData.subcontractorInstructions}
          onChange={(event) => updateField("subcontractorInstructions", event.target.value)}
          placeholder="Only write what the subcontractor needs to know or improve."
        />
        <TextAreaField
          label="Internal notes / improvement plan"
          rows={4}
          error={formError || undefined}
          value={formData.internalNotes}
          onChange={(event) => updateField("internalNotes", event.target.value)}
          placeholder="Internal improvement plan, risks, customer concerns, follow-up action, etc."
        />
        <div>
          <BigButton kind="quiet" onClick={clearForm}>
            Clear form
          </BigButton>
        </div>
      </Sheet>
    </Screen>
  );
}
