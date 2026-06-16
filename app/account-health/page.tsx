"use client";

import { useState } from "react";

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

function getHealthStatusClass(status: HealthStatus) {
  if (status === "Critical") {
    return "bg-red-200 text-red-900";
  }

  if (status === "Problem") {
    return "bg-red-100 text-red-800";
  }

  if (status === "Watch") {
    return "bg-yellow-100 text-yellow-800";
  }

  return "bg-green-100 text-green-800";
}

function getImprovementStatusClass(status: ImprovementStatus) {
  if (status === "Completed") {
    return "bg-green-100 text-green-800";
  }

  if (status === "In Progress") {
    return "bg-blue-100 text-blue-800";
  }

  return "bg-yellow-100 text-yellow-800";
}

export default function AccountHealthPage() {
  const [healthItems, setHealthItems] =
    useState<AccountHealthItem[]>(startingHealthItems);

  const [searchText, setSearchText] = useState("");

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

  function handleAddHealthItem(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!formData.internalNotes.trim()) {
      return;
    }

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

  return (
    <main className="min-h-screen bg-gray-100 p-4 print:bg-white sm:p-6">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">
              Account Health
            </h1>

            <p className="mt-1 text-gray-600">
              Track account condition, improvement plans, follow-up dates, and
              problem accounts before they get worse.
            </p>
          </div>

          <button
            type="button"
            onClick={() => window.print()}
            className="w-fit rounded-lg bg-gray-900 px-4 py-2 text-sm font-semibold text-white hover:bg-gray-700 print:hidden"
          >
            Print Account Health
          </button>
        </div>

        <section className="grid gap-4 md:grid-cols-4">
          <div className="rounded-xl bg-white p-5 shadow">
            <p className="text-sm text-gray-500">Tracked Items</p>
            <p className="mt-2 text-2xl font-bold text-gray-900">
              {totalTrackedAccounts}
            </p>
          </div>

          <div className="rounded-xl bg-white p-5 shadow">
            <p className="text-sm text-gray-500">Watch or Worse</p>
            <p className="mt-2 text-2xl font-bold text-gray-900">
              {watchOrWorse}
            </p>
          </div>

          <div className="rounded-xl bg-white p-5 shadow">
            <p className="text-sm text-gray-500">Open Improvements</p>
            <p className="mt-2 text-2xl font-bold text-gray-900">
              {openImprovements}
            </p>
          </div>

          <div className="rounded-xl bg-white p-5 shadow">
            <p className="text-sm text-gray-500">Avg. Health Score</p>
            <p className="mt-2 text-2xl font-bold text-gray-900">
              {averageHealthScore.toFixed(1)}/10
            </p>
          </div>
        </section>

        <section className="rounded-xl bg-white p-5 shadow print:hidden">
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <h2 className="text-lg font-bold text-gray-900">
                Smart Health Status Guide
              </h2>

              <p className="mt-1 text-sm text-gray-500">
                The system automatically calculates account health from the
                health score. Later, this can also include complaints, visits,
                follow-ups, and subcontractor performance.
              </p>
            </div>

            <div className="rounded-lg bg-blue-50 px-4 py-3 text-sm font-semibold text-blue-800">
              Current logic: score-based
            </div>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-4">
            {healthStatusOptions.map((status) => (
              <div key={status} className="rounded-lg border border-gray-200 p-3">
                <span
                  className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${getHealthStatusClass(
                    status
                  )}`}
                >
                  {status}
                </span>

                <p className="mt-2 text-sm text-gray-600">
                  {getHealthStatusDescription(status)}
                </p>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-xl bg-white p-6 shadow print:hidden">
          <h2 className="text-xl font-bold text-gray-900">
            Search Account Health
          </h2>

          <p className="mt-1 text-sm text-gray-500">
            Search by account, manager, subcontractor, status, issue category,
            follow-up date, or notes.
          </p>

          <div className="mt-5 flex flex-col gap-3 md:flex-row md:items-center">
            <input
              type="text"
              value={searchText}
              onChange={(event) => setSearchText(event.target.value)}
              placeholder="Search account health..."
              className="w-full rounded-lg border border-gray-300 px-4 py-2 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            />

            {searchText && (
              <button
                type="button"
                onClick={() => setSearchText("")}
                className="w-fit rounded-lg bg-gray-200 px-4 py-2 text-sm font-semibold text-gray-900 hover:bg-gray-300"
              >
                Clear
              </button>
            )}
          </div>
        </section>

        <section className="rounded-xl bg-white p-6 shadow print:hidden">
          <h2 className="text-xl font-bold text-gray-900">
            Add Account Health / Improvement Item
          </h2>

          <p className="mt-1 text-sm text-gray-500">
            Internal notes are required. Subcontractor instructions should only
            include information that can be shared with the subcontractor.
          </p>

          <form onSubmit={handleAddHealthItem} className="mt-5 space-y-4">
            <div className="grid gap-4 md:grid-cols-4">
              <div>
                <label className="text-sm font-medium text-gray-700">
                  Date
                </label>
                <input
                  type="date"
                  value={formData.date}
                  onChange={(event) => updateField("date", event.target.value)}
                  className="mt-1 w-full rounded-lg border border-gray-300 px-4 py-2 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="text-sm font-medium text-gray-700">
                  Account
                </label>
                <input
                  type="text"
                  list="health-account-options"
                  value={formData.accountName}
                  onChange={(event) =>
                    updateField("accountName", event.target.value)
                  }
                  placeholder="Type account name..."
                  className="mt-1 w-full rounded-lg border border-gray-300 px-4 py-2 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                />

                <datalist id="health-account-options">
                  {accountOptions.map((account) => (
                    <option key={account} value={account} />
                  ))}
                </datalist>
              </div>

              <div>
                <label className="text-sm font-medium text-gray-700">
                  Manager
                </label>
                <select
                  value={formData.manager}
                  onChange={(event) =>
                    updateField("manager", event.target.value)
                  }
                  className="mt-1 w-full rounded-lg border border-gray-300 px-4 py-2 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                >
                  {managerOptions.map((manager) => (
                    <option key={manager}>{manager}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-sm font-medium text-gray-700">
                  Subcontractor
                </label>
                <select
                  value={formData.subcontractor}
                  onChange={(event) =>
                    updateField("subcontractor", event.target.value)
                  }
                  className="mt-1 w-full rounded-lg border border-gray-300 px-4 py-2 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                >
                  {subcontractorOptions.map((subcontractor) => (
                    <option key={subcontractor}>{subcontractor}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-5">
              <div>
                <label className="text-sm font-medium text-gray-700">
                  Health Score
                </label>
                <input
                  type="number"
                  min="0"
                  max="10"
                  value={formData.healthScore}
                  onChange={(event) =>
                    updateField("healthScore", event.target.value)
                  }
                  className="mt-1 w-full rounded-lg border border-gray-300 px-4 py-2 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                />

                <p className="mt-1 text-xs text-gray-500">
                  0 = critical, 10 = excellent
                </p>
              </div>

              <div>
                <label className="text-sm font-medium text-gray-700">
                  Auto Status
                </label>
                <div
                  className={`mt-1 rounded-lg px-4 py-2 text-sm font-semibold ${getHealthStatusClass(
                    getHealthStatusFromScore(formData.healthScore)
                  )}`}
                >
                  {getHealthStatusFromScore(formData.healthScore)}
                </div>
              </div>

              <div>
                <label className="text-sm font-medium text-gray-700">
                  Issue Category
                </label>
                <select
                  value={formData.issueCategory}
                  onChange={(event) =>
                    updateField("issueCategory", event.target.value)
                  }
                  className="mt-1 w-full rounded-lg border border-gray-300 px-4 py-2 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                >
                  {issueCategoryOptions.map((category) => (
                    <option key={category}>{category}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-sm font-medium text-gray-700">
                  Improvement Status
                </label>
                <select
                  value={formData.improvementStatus}
                  onChange={(event) =>
                    updateField("improvementStatus", event.target.value)
                  }
                  className="mt-1 w-full rounded-lg border border-gray-300 px-4 py-2 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                >
                  {improvementStatusOptions.map((status) => (
                    <option key={status}>{status}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-sm font-medium text-gray-700">
                  Follow-Up Date
                </label>
                <input
                  type="date"
                  value={formData.followUpDate}
                  onChange={(event) =>
                    updateField("followUpDate", event.target.value)
                  }
                  className="mt-1 w-full rounded-lg border border-gray-300 px-4 py-2 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                />
              </div>
            </div>

            <div>
              <label className="text-sm font-medium text-gray-700">
                Visible to Subcontractor?
              </label>
              <select
                value={formData.visibleToSubcontractor}
                onChange={(event) =>
                  updateField("visibleToSubcontractor", event.target.value)
                }
                className="mt-1 w-full rounded-lg border border-gray-300 px-4 py-2 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              >
                <option>Yes</option>
                <option>No</option>
              </select>
            </div>

            <div>
              <label className="text-sm font-medium text-gray-700">
                Subcontractor Instructions
              </label>
              <textarea
                value={formData.subcontractorInstructions}
                onChange={(event) =>
                  updateField("subcontractorInstructions", event.target.value)
                }
                rows={3}
                placeholder="Only write what the subcontractor needs to know or improve."
                className="mt-1 w-full rounded-lg border border-gray-300 px-4 py-2 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="text-sm font-medium text-gray-700">
                Internal Notes / Improvement Plan
              </label>
              <textarea
                value={formData.internalNotes}
                onChange={(event) =>
                  updateField("internalNotes", event.target.value)
                }
                rows={4}
                placeholder="Internal improvement plan, risks, customer concerns, follow-up action, etc."
                className="mt-1 w-full rounded-lg border border-gray-300 px-4 py-2 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              />
            </div>

            <div className="flex flex-wrap gap-3">
              <button
                type="submit"
                className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-500"
              >
                Add Health Item
              </button>

              <button
                type="button"
                onClick={clearForm}
                className="rounded-lg bg-gray-200 px-5 py-2 text-sm font-semibold text-gray-900 hover:bg-gray-300"
              >
                Clear Form
              </button>
            </div>
          </form>
        </section>

        <section className="rounded-xl bg-white shadow">
          <div className="border-b p-4">
            <h2 className="text-xl font-bold text-gray-900">
              Account Health Log
            </h2>
            <p className="mt-1 text-sm text-gray-500">
              Latest health and improvement items appear first.
            </p>
          </div>

          <div className="divide-y">
            {filteredHealthItems.length === 0 ? (
              <div className="p-4 text-sm text-gray-600">
                No account health items found for “{searchText}”.
              </div>
            ) : (
              filteredHealthItems.map((item) => (
                <div key={item.id} className="p-4">
                  <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-lg font-bold text-gray-900">
                          {item.accountName}
                        </h3>

                        <span
                          className={`rounded-full px-3 py-1 text-xs font-semibold ${getHealthStatusClass(
                            item.healthStatus
                          )}`}
                        >
                          {item.healthStatus} • {item.healthScore}/10
                        </span>

                        <span
                          className={`rounded-full px-3 py-1 text-xs font-semibold ${getImprovementStatusClass(
                            item.improvementStatus
                          )}`}
                        >
                          {item.improvementStatus}
                        </span>

                        <span className="rounded-full bg-blue-100 px-3 py-1 text-xs font-semibold text-blue-800">
                          {item.issueCategory}
                        </span>
                      </div>

                      <p className="mt-1 text-sm text-gray-500">
                        {item.date} • Manager: {item.manager} • Subcontractor:{" "}
                        {item.subcontractor} • Follow-Up: {item.followUpDate} •
                        Visible to Sub: {item.visibleToSubcontractor}
                      </p>
                    </div>
                  </div>

                  {item.subcontractorInstructions && (
                    <div className="mt-3 rounded-lg bg-gray-50 p-3">
                      <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                        Subcontractor Instructions
                      </p>
                      <p className="mt-1 text-sm leading-6 text-gray-700">
                        {item.subcontractorInstructions}
                      </p>
                    </div>
                  )}

                  <div className="mt-3 rounded-lg bg-gray-50 p-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                      Internal Notes / Improvement Plan
                    </p>
                    <p className="mt-1 text-sm leading-6 text-gray-700">
                      {item.internalNotes}
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>

        <section className="rounded-xl bg-white p-6 shadow print:hidden">
          <h2 className="text-xl font-bold text-gray-900">
            Future Smart Connection
          </h2>

          <p className="mt-3 text-sm leading-6 text-gray-700">
            Later, account health will connect to complaints, visits, account
            updates, subcontractor performance, manager reports, and the
            dashboard. This will help identify problem accounts earlier using
            real data instead of only memory or customer complaints.
          </p>
        </section>
      </div>
    </main>
  );
}