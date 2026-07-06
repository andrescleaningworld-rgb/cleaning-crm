"use client";

import Link from "next/link";
import {
  useEffect,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";

type SettingItem = {
  id: string;
  name: string;
  status: "Active" | "Inactive";
};

type Manager = {
  sheetRow: number;
  managerId: string;
  name: string;
  phone: string;
  status: "Active" | "Inactive";
};

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

function ManagersSettingsSection({
  managers,
  setManagers,
  loading,
  loadError,
}: {
  managers: Manager[];
  setManagers: Dispatch<SetStateAction<Manager[]>>;
  loading: boolean;
  loadError: string;
}) {
  const [newManagerName, setNewManagerName] = useState("");
  const [newManagerPhone, setNewManagerPhone] = useState("");
  const [adding, setAdding] = useState(false);
  const [actionError, setActionError] = useState("");
  const [phoneDrafts, setPhoneDrafts] = useState<Record<number, string>>({});
  const [savingRow, setSavingRow] = useState<number | null>(null);

  async function handleAdd() {
    const name = newManagerName.trim();

    if (!name) {
      alert("Please enter a name first.");
      return;
    }

    setAdding(true);
    setActionError("");

    try {
      const response = await fetch("/api/admin/managers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, phone: newManagerPhone.trim() }),
      });
      const data = (await response.json()) as {
        success?: boolean;
        managerId?: string;
        error?: string;
      };

      if (!response.ok || !data.success) {
        setActionError(data.error ?? "Failed to add manager.");
        return;
      }

      const refreshed = await fetch("/api/admin/managers");
      const refreshedData = (await refreshed.json()) as Manager[];
      if (refreshed.ok && Array.isArray(refreshedData)) {
        setManagers(refreshedData);
      }

      setNewManagerName("");
      setNewManagerPhone("");
    } catch {
      setActionError("Network error adding manager.");
    } finally {
      setAdding(false);
    }
  }

  function getPhoneDraft(manager: Manager): string {
    return phoneDrafts[manager.sheetRow] ?? manager.phone;
  }

  async function savePhone(manager: Manager) {
    const draft = (phoneDrafts[manager.sheetRow] ?? manager.phone).trim();
    if (draft === manager.phone) return;

    setSavingRow(manager.sheetRow);
    setActionError("");

    try {
      const response = await fetch("/api/admin/managers", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sheetRow: manager.sheetRow,
          fields: { phone: draft },
        }),
      });
      const data = (await response.json()) as { success?: boolean; error?: string };

      if (!response.ok || !data.success) {
        setActionError(data.error ?? "Failed to save phone number.");
        return;
      }

      setManagers((current) =>
        current.map((item) =>
          item.sheetRow === manager.sheetRow ? { ...item, phone: draft } : item
        )
      );
    } catch {
      setActionError("Network error saving phone number.");
    } finally {
      setSavingRow(null);
    }
  }

  async function toggleStatus(manager: Manager) {
    const newStatus: Manager["status"] =
      manager.status === "Active" ? "Inactive" : "Active";

    setSavingRow(manager.sheetRow);
    setActionError("");

    try {
      const response = await fetch("/api/admin/managers", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sheetRow: manager.sheetRow,
          fields: { status: newStatus },
        }),
      });
      const data = (await response.json()) as { success?: boolean; error?: string };

      if (!response.ok || !data.success) {
        setActionError(data.error ?? "Failed to update status.");
        return;
      }

      setManagers((current) =>
        current.map((item) =>
          item.sheetRow === manager.sheetRow
            ? { ...item, status: newStatus }
            : item
        )
      );
    } catch {
      setActionError("Network error updating status.");
    } finally {
      setSavingRow(null);
    }
  }

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="mb-4">
        <h2 className="text-xl font-bold text-gray-900">Managers</h2>
        <p className="mt-1 text-sm text-gray-600">
          People responsible for visits, complaints, follow-ups, and account
          management.
        </p>
      </div>

      <div className="mb-4 flex flex-col gap-3 md:flex-row">
        <input
          type="text"
          value={newManagerName}
          onChange={(event) => setNewManagerName(event.target.value)}
          placeholder="Manager name..."
          className="w-full rounded-lg border border-gray-300 px-4 py-3 text-gray-900 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100 md:max-w-xs"
        />

        <input
          type="tel"
          value={newManagerPhone}
          onChange={(event) => setNewManagerPhone(event.target.value)}
          placeholder="Phone number..."
          className="w-full rounded-lg border border-gray-300 px-4 py-3 text-gray-900 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100 md:max-w-xs"
        />

        <button
          type="button"
          onClick={handleAdd}
          disabled={adding}
          className="rounded-lg bg-blue-700 px-5 py-3 font-semibold text-white shadow-sm hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-60 md:w-40"
        >
          {adding ? "Adding..." : "Add"}
        </button>
      </div>

      {loadError ? (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">
          {loadError}
        </div>
      ) : null}

      {actionError ? (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">
          {actionError}
        </div>
      ) : null}

      {loading ? (
        <div className="p-6 text-center text-gray-600">
          Loading managers...
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-sm">
            <thead>
              <tr className="border-b bg-gray-50 text-gray-600">
                <th className="px-4 py-3 font-semibold">Name</th>
                <th className="px-4 py-3 font-semibold">Phone</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 font-semibold">Action</th>
              </tr>
            </thead>

            <tbody>
              {managers.map((manager) => (
                <tr key={manager.sheetRow} className="border-b">
                  <td className="px-4 py-3 font-semibold text-gray-900">
                    {manager.name}
                  </td>

                  <td className="px-4 py-3">
                    <input
                      type="tel"
                      value={getPhoneDraft(manager)}
                      onChange={(event) =>
                        setPhoneDrafts((current) => ({
                          ...current,
                          [manager.sheetRow]: event.target.value,
                        }))
                      }
                      onBlur={() => savePhone(manager)}
                      disabled={savingRow === manager.sheetRow}
                      placeholder="Add phone..."
                      className="w-full min-w-[160px] rounded-lg border border-gray-300 px-3 py-2 text-gray-900 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100 disabled:opacity-60"
                    />
                  </td>

                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full border px-2 py-1 text-xs font-semibold ${getStatusClass(
                        manager.status
                      )}`}
                    >
                      {manager.status}
                    </span>
                  </td>

                  <td className="px-4 py-3">
                    <button
                      type="button"
                      onClick={() => toggleStatus(manager)}
                      disabled={savingRow === manager.sheetRow}
                      className="font-semibold text-blue-700 hover:underline disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {manager.status === "Active" ? "Deactivate" : "Activate"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {managers.length === 0 && (
            <div className="p-6 text-center text-gray-600">
              No managers found.
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function SupplySettingsSection() {
  return (
    <section className="rounded-xl border border-green-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-sm font-bold uppercase tracking-wide text-green-700">
            Supply Settings
          </p>

          <h2 className="mt-1 text-xl font-bold text-gray-900">
            Supply Items and Categories
          </h2>

          <p className="mt-2 max-w-3xl text-sm leading-6 text-gray-600">
            Manage the supply categories, item names, descriptions, units,
            stock levels, and active/inactive status used by subcontractors when
            placing supply orders.
          </p>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row lg:min-w-[360px]">
          <Link
            href="/supplies"
            className="rounded-lg bg-green-700 px-5 py-3 text-center text-sm font-bold text-white shadow-sm hover:bg-green-800"
          >
            Manage Supply Items
          </Link>

          <Link
            href="/supply-orders"
            className="rounded-lg border border-green-300 bg-green-50 px-5 py-3 text-center text-sm font-bold text-green-800 shadow-sm hover:bg-green-100"
          >
            View Supply Orders
          </Link>
        </div>
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-3">
        <div className="rounded-xl border border-green-100 bg-green-50 p-4">
          <p className="text-sm font-bold text-green-900">Categories</p>
          <p className="mt-1 text-sm leading-6 text-green-800">
            Categories come from the supply items list, such as Chemicals,
            Trash Bags, Paper Products, Floor Care, Tools, and Other.
          </p>
        </div>

        <div className="rounded-xl border border-blue-100 bg-blue-50 p-4">
          <p className="text-sm font-bold text-blue-900">Item Descriptions</p>
          <p className="mt-1 text-sm leading-6 text-blue-800">
            Descriptions are shown to subcontractors so they know exactly what
            they are requesting.
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
          <p className="text-sm font-bold text-slate-900">Order Log</p>
          <p className="mt-1 text-sm leading-6 text-slate-700">
            Submitted orders are tracked in the Supply Orders page for review,
            approval, denial, and completion.
          </p>
        </div>
      </div>
    </section>
  );
}

export default function SettingsPage() {
  const [managers, setManagers] = useState<Manager[]>([]);
  const [managersLoading, setManagersLoading] = useState(true);
  const [managersError, setManagersError] = useState("");
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

  useEffect(() => {
    let cancelled = false;

    async function loadManagers() {
      setManagersLoading(true);
      setManagersError("");
      try {
        const response = await fetch("/api/admin/managers");
        const data = (await response.json()) as Manager[] | { error?: string };
        if (!response.ok || !Array.isArray(data)) {
          if (!cancelled) {
            setManagersError(
              (!Array.isArray(data) && data.error) || "Failed to load managers."
            );
          }
          return;
        }
        if (!cancelled) setManagers(data);
      } catch {
        if (!cancelled) setManagersError("Network error loading managers.");
      } finally {
        if (!cancelled) setManagersLoading(false);
      }
    }

    loadManagers();
    return () => {
      cancelled = true;
    };
  }, []);

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

        {/* Portal Access shortcut */}
        <Link
          href="/settings/portal"
          className="mb-6 flex items-center justify-between rounded-xl border border-blue-200 bg-blue-50 px-5 py-4 shadow-sm transition hover:bg-blue-100"
        >
          <div>
            <p className="font-bold text-blue-900">Customer Portal Access</p>
            <p className="mt-0.5 text-sm text-blue-700">
              Enable / disable portal access and manage portal codes for each customer account.
            </p>
          </div>
          <span className="ml-4 shrink-0 text-blue-500">→</span>
        </Link>

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
          <SupplySettingsSection />

          <ManagersSettingsSection
            managers={managers}
            setManagers={setManagers}
            loading={managersLoading}
            loadError={managersError}
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