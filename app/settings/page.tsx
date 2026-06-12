"use client";

import { useState, type Dispatch, type SetStateAction } from "react";

type SettingItem = {
  id: string;
  name: string;
  status: "Active" | "Inactive";
};

const startingManagers: SettingItem[] = [
  { id: "manager-andres", name: "Andrés", status: "Active" },
  { id: "manager-greg", name: "Greg", status: "Active" },
  { id: "manager-drew", name: "Drew", status: "Active" },
  { id: "manager-ryan", name: "Ryan", status: "Active" },
  { id: "manager-cw", name: "CW", status: "Active" },
];

const startingVisitTypes: SettingItem[] = [
  { id: "visit-routine", name: "Routine Visit", status: "Active" },
  { id: "visit-complaint", name: "Complaint Follow-Up", status: "Active" },
  { id: "visit-onboarding", name: "Onboarding New Account", status: "Active" },
];

const startingAccountUpdateTypes: SettingItem[] = [
  { id: "update-general", name: "General Note", status: "Active" },
  { id: "update-service", name: "Service Change", status: "Active" },
  { id: "update-price", name: "Price Change", status: "Active" },
  { id: "update-extra", name: "Extra Service", status: "Active" },
  { id: "update-missed", name: "Missed Cleaning", status: "Active" },
];

const startingAccountStatuses: SettingItem[] = [
  { id: "status-active", name: "Active", status: "Active" },
  { id: "status-paused", name: "Paused", status: "Active" },
  { id: "status-over-90", name: "Over 90 Days", status: "Active" },
  { id: "status-cancelled", name: "Cancelled", status: "Active" },
];

const startingHealthStatuses: SettingItem[] = [
  { id: "health-stable", name: "Stable", status: "Active" },
  { id: "health-needs-attention", name: "Needs Attention", status: "Active" },
  { id: "health-high-risk", name: "High Risk", status: "Active" },
];

const startingComplaintValidityOptions: SettingItem[] = [
  { id: "validity-valid", name: "Valid", status: "Active" },
  { id: "validity-not-valid", name: "Not Valid", status: "Active" },
  { id: "validity-subjective", name: "Subjective", status: "Active" },
  { id: "validity-needs-review", name: "Needs Review", status: "Active" },
];

function getStatusClass(status: SettingItem["status"]) {
  if (status === "Active") {
    return "bg-green-100 text-green-800 border-green-200";
  }

  return "bg-gray-100 text-gray-800 border-gray-200";
}

function SettingsSection({
  title,
  description,
  items,
  inputValue,
  onInputChange,
  onAdd,
  onToggleStatus,
  placeholder,
}: {
  title: string;
  description: string;
  items: SettingItem[];
  inputValue: string;
  onInputChange: (value: string) => void;
  onAdd: () => void;
  onToggleStatus: (id: string) => void;
  placeholder: string;
}) {
  return (
    <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="mb-4">
        <h2 className="text-xl font-bold text-gray-900">{title}</h2>
        <p className="mt-1 text-sm text-gray-600">{description}</p>
      </div>

      <div className="mb-4 flex flex-col gap-3 md:flex-row">
        <input
          type="text"
          value={inputValue}
          onChange={(event) => onInputChange(event.target.value)}
          placeholder={placeholder}
          className="w-full rounded-lg border border-gray-300 px-4 py-3 text-gray-900 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
        />

        <button
          type="button"
          onClick={onAdd}
          className="rounded-lg bg-blue-700 px-5 py-3 font-semibold text-white shadow-sm hover:bg-blue-800 md:w-40"
        >
          Add
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-left text-sm">
          <thead>
            <tr className="border-b bg-gray-50 text-gray-600">
              <th className="px-4 py-3 font-semibold">Name</th>
              <th className="px-4 py-3 font-semibold">Status</th>
              <th className="px-4 py-3 font-semibold">Action</th>
            </tr>
          </thead>

          <tbody>
            {items.map((item) => (
              <tr key={item.id} className="border-b">
                <td className="px-4 py-3 font-semibold text-gray-900">
                  {item.name}
                </td>

                <td className="px-4 py-3">
                  <span
                    className={`rounded-full border px-2 py-1 text-xs font-semibold ${getStatusClass(
                      item.status
                    )}`}
                  >
                    {item.status}
                  </span>
                </td>

                <td className="px-4 py-3">
                  <button
                    type="button"
                    onClick={() => onToggleStatus(item.id)}
                    className="font-semibold text-blue-700 hover:underline"
                  >
                    {item.status === "Active" ? "Deactivate" : "Activate"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {items.length === 0 && (
        <div className="p-6 text-center text-gray-600">No items found.</div>
      )}
    </section>
  );
}

export default function SettingsPage() {
  const [managers, setManagers] = useState<SettingItem[]>(startingManagers);
  const [visitTypes, setVisitTypes] =
    useState<SettingItem[]>(startingVisitTypes);
  const [accountUpdateTypes, setAccountUpdateTypes] = useState<SettingItem[]>(
    startingAccountUpdateTypes
  );
  const [accountStatuses, setAccountStatuses] = useState<SettingItem[]>(
    startingAccountStatuses
  );
  const [healthStatuses, setHealthStatuses] = useState<SettingItem[]>(
    startingHealthStatuses
  );
  const [complaintValidityOptions, setComplaintValidityOptions] =
    useState<SettingItem[]>(startingComplaintValidityOptions);

  const [newManager, setNewManager] = useState("");
  const [newVisitType, setNewVisitType] = useState("");
  const [newAccountUpdateType, setNewAccountUpdateType] = useState("");
  const [newAccountStatus, setNewAccountStatus] = useState("");
  const [newHealthStatus, setNewHealthStatus] = useState("");
  const [newComplaintValidityOption, setNewComplaintValidityOption] =
    useState("");

  function createItem(name: string): SettingItem {
    return {
      id: `${name.toLowerCase().replaceAll(" ", "-")}-${Date.now()}`,
      name: name.trim(),
      status: "Active",
    };
  }

  function addItem(
    value: string,
    setValue: (value: string) => void,
    setItems: Dispatch<SetStateAction<SettingItem[]>>
  ) {
    const cleanValue = value.trim();

    if (!cleanValue) {
      alert("Please enter a name first.");
      return;
    }

    setItems((currentItems) => [createItem(cleanValue), ...currentItems]);
    setValue("");
  }

  function toggleStatus(
    id: string,
    setItems: Dispatch<SetStateAction<SettingItem[]>>
  ) {
    setItems((currentItems) =>
      currentItems.map((item) => {
        if (item.id !== id) {
          return item;
        }

        return {
          ...item,
          status: item.status === "Active" ? "Inactive" : "Active",
        };
      })
    );
  }

  const activeManagers = managers.filter(
    (item) => item.status === "Active"
  ).length;

  const activeVisitTypes = visitTypes.filter(
    (item) => item.status === "Active"
  ).length;

  const activeUpdateTypes = accountUpdateTypes.filter(
    (item) => item.status === "Active"
  ).length;

  const activeComplaintValidityOptions = complaintValidityOptions.filter(
    (item) => item.status === "Active"
  ).length;

  return (
    <main className="min-h-screen bg-gray-50 p-6">
      <div className="mx-auto max-w-7xl">
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-gray-900">Settings</h1>

          <p className="mt-1 text-gray-600">
            Manage the dropdown options used throughout the app. Subcontractors
            are managed on their own dedicated Subcontractors page.
          </p>
        </div>

        <div className="mb-6 grid gap-4 md:grid-cols-4">
          <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <p className="text-sm text-gray-500">Active Managers</p>
            <p className="mt-2 text-2xl font-bold text-gray-900">
              {activeManagers}
            </p>
          </div>

          <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <p className="text-sm text-gray-500">Active Visit Types</p>
            <p className="mt-2 text-2xl font-bold text-gray-900">
              {activeVisitTypes}
            </p>
          </div>

          <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <p className="text-sm text-gray-500">Active Update Types</p>
            <p className="mt-2 text-2xl font-bold text-gray-900">
              {activeUpdateTypes}
            </p>
          </div>

          <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <p className="text-sm text-gray-500">
              Complaint Validity Options
            </p>
            <p className="mt-2 text-2xl font-bold text-gray-900">
              {activeComplaintValidityOptions}
            </p>
          </div>
        </div>

        <div className="grid gap-6">
          <SettingsSection
            title="Managers"
            description="People responsible for visits, complaints, follow-ups, and account management."
            items={managers}
            inputValue={newManager}
            onInputChange={setNewManager}
            onAdd={() => addItem(newManager, setNewManager, setManagers)}
            onToggleStatus={(id) => toggleStatus(id, setManagers)}
            placeholder="Add manager name..."
          />

          <SettingsSection
            title="Complaint Validity Options"
            description="Used to decide whether a complaint should affect scoring. Options include Valid, Not Valid, Subjective, and Needs Review."
            items={complaintValidityOptions}
            inputValue={newComplaintValidityOption}
            onInputChange={setNewComplaintValidityOption}
            onAdd={() =>
              addItem(
                newComplaintValidityOption,
                setNewComplaintValidityOption,
                setComplaintValidityOptions
              )
            }
            onToggleStatus={(id) =>
              toggleStatus(id, setComplaintValidityOptions)
            }
            placeholder="Add complaint validity option..."
          />

          <SettingsSection
            title="Visit Types"
            description="Types of visits used when logging account visits."
            items={visitTypes}
            inputValue={newVisitType}
            onInputChange={setNewVisitType}
            onAdd={() => addItem(newVisitType, setNewVisitType, setVisitTypes)}
            onToggleStatus={(id) => toggleStatus(id, setVisitTypes)}
            placeholder="Add visit type..."
          />

          <SettingsSection
            title="Account Update Types"
            description="Types of account updates used for service changes, price changes, missed cleanings, and notes."
            items={accountUpdateTypes}
            inputValue={newAccountUpdateType}
            onInputChange={setNewAccountUpdateType}
            onAdd={() =>
              addItem(
                newAccountUpdateType,
                setNewAccountUpdateType,
                setAccountUpdateTypes
              )
            }
            onToggleStatus={(id) => toggleStatus(id, setAccountUpdateTypes)}
            placeholder="Add account update type..."
          />

          <SettingsSection
            title="Account Statuses"
            description="Main account status options used on the Accounts page."
            items={accountStatuses}
            inputValue={newAccountStatus}
            onInputChange={setNewAccountStatus}
            onAdd={() =>
              addItem(newAccountStatus, setNewAccountStatus, setAccountStatuses)
            }
            onToggleStatus={(id) => toggleStatus(id, setAccountStatuses)}
            placeholder="Add account status..."
          />

          <SettingsSection
            title="Account Health Statuses"
            description="Health/risk labels used to quickly identify stable and problem accounts."
            items={healthStatuses}
            inputValue={newHealthStatus}
            onInputChange={setNewHealthStatus}
            onAdd={() =>
              addItem(newHealthStatus, setNewHealthStatus, setHealthStatuses)
            }
            onToggleStatus={(id) => toggleStatus(id, setHealthStatuses)}
            placeholder="Add health status..."
          />
        </div>
      </div>
    </main>
  );
}