"use client";

import { ShellTitle, Tile } from "@/app/ui";
import { useHandoffs } from "../components/handoffs";
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
  calendarColorId: string;
};

// Google Calendar's fixed 11-color event palette (colorId "1"-"11") — not
// configurable, this is the exact set Calendar itself offers. Manually
// assigned per manager here rather than round-robin so people can pick
// something meaningful (e.g. a favorite color) and keep it stable.
const CALENDAR_COLORS: Array<{ id: string; name: string; hex: string }> = [
  { id: "1", name: "Lavender", hex: "#7986cb" },
  { id: "2", name: "Sage", hex: "#33b679" },
  { id: "3", name: "Grape", hex: "#8e24aa" },
  { id: "4", name: "Flamingo", hex: "#e67c73" },
  { id: "5", name: "Banana", hex: "#f6bf26" },
  { id: "6", name: "Tangerine", hex: "#f4511e" },
  { id: "7", name: "Peacock", hex: "#039be5" },
  { id: "8", name: "Graphite", hex: "#616161" },
  { id: "9", name: "Blueberry", hex: "#3f51b5" },
  { id: "10", name: "Basil", hex: "#0b8043" },
  { id: "11", name: "Tomato", hex: "#d60000" },
];

function getCalendarColor(id: string) {
  return CALENDAR_COLORS.find((color) => color.id === id);
}

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
    <section className="ui-card">
      <div className="mb-4">
        <h2 className="ui-card-title">{title}</h2>
        <p className="ui-muted">{description}</p>
      </div>

      <div className="mb-4 flex flex-col gap-3 md:flex-row">
        <input
          type="text"
          value={inputValue}
          onChange={(event) => onInputChange(event.target.value)}
          placeholder={placeholder}
          className="ui-input w-full"
        />

        <button
          type="button"
          onClick={onAdd}
          className="ui-btn ui-btn-main"
        >
          Add
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="ui-table w-full">
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
                    className={`rounded-full border px-2 py-1 text-base font-semibold ${getStatusClass(
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
                    className="ui-btn ui-btn-quiet"
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

  async function saveColor(manager: Manager, calendarColorId: string) {
    if (calendarColorId === manager.calendarColorId) return;

    setSavingRow(manager.sheetRow);
    setActionError("");

    try {
      const response = await fetch("/api/admin/managers", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sheetRow: manager.sheetRow,
          fields: { calendarColorId },
        }),
      });
      const data = (await response.json()) as { success?: boolean; error?: string };

      if (!response.ok || !data.success) {
        setActionError(data.error ?? "Failed to save calendar color.");
        return;
      }

      setManagers((current) =>
        current.map((item) =>
          item.sheetRow === manager.sheetRow ? { ...item, calendarColorId } : item
        )
      );
    } catch {
      setActionError("Network error saving calendar color.");
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
    <section className="ui-card">
      <div className="mb-4">
        <h2 className="ui-card-title">Managers</h2>
        <p className="ui-muted">
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
          className="ui-input w-full"
        />

        <input
          type="tel"
          value={newManagerPhone}
          onChange={(event) => setNewManagerPhone(event.target.value)}
          placeholder="Phone number..."
          className="ui-input w-full"
        />

        <button
          type="button"
          onClick={handleAdd}
          disabled={adding}
          className="ui-btn ui-btn-main"
        >
          {adding ? "Adding..." : "Add"}
        </button>
      </div>

      {loadError ? (
        <div className="ui-field-error">
          {loadError}
        </div>
      ) : null}

      {actionError ? (
        <div className="ui-field-error">
          {actionError}
        </div>
      ) : null}

      {loading ? (
        <div className="p-6 text-center text-gray-600">
          Loading managers...
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="ui-table w-full">
            <thead>
              <tr className="border-b bg-gray-50 text-gray-600">
                <th className="px-4 py-3 font-semibold">Name</th>
                <th className="px-4 py-3 font-semibold">Phone</th>
                <th className="px-4 py-3 font-semibold">Calendar Color</th>
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
                      className="ui-input w-full"
                    />
                  </td>

                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span
                        aria-hidden
                        className="h-4 w-4 shrink-0 rounded-full border border-gray-300"
                        style={{
                          backgroundColor: getCalendarColor(manager.calendarColorId)?.hex ?? "transparent",
                        }}
                      />
                      <select
                        value={manager.calendarColorId}
                        onChange={(event) => saveColor(manager, event.target.value)}
                        disabled={savingRow === manager.sheetRow}
                        className="ui-input"
                      >
                        <option value="">None</option>
                        {CALENDAR_COLORS.map((color) => (
                          <option key={color.id} value={color.id}>
                            {color.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  </td>

                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full border px-2 py-1 text-base font-semibold ${getStatusClass(
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
                      className="ui-btn ui-btn-quiet"
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

type ManagerLoginAccount = {
  staffId: string;
  name: string;
  needsSetup: boolean;
  accountId?: string;
};

// Owner-only. Individual admin-login passwords are keyed off the Staff
// table (role === "Manager" && active), NOT the Managers Sheet tab above —
// see lib/managerAccounts.ts. Deliberately a separate section rather than a
// column grafted onto ManagersSettingsSection, since these can be different
// people/ids entirely.
function ManagerLoginAccountsSection() {
  const [accounts, setAccounts] = useState<ManagerLoginAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [actionError, setActionError] = useState("");
  const [savingId, setSavingId] = useState<string | null>(null);
  const [resetNotice, setResetNotice] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setLoadError("");
      try {
        const response = await fetch("/api/admin/manager-accounts");
        const data = (await response.json()) as {
          success?: boolean;
          identities?: ManagerLoginAccount[];
          error?: string;
        };
        if (!response.ok || data.success === false) {
          if (!cancelled) setLoadError(data.error || "Failed to load manager login accounts.");
          return;
        }
        if (!cancelled) setAccounts(data.identities ?? []);
      } catch {
        if (!cancelled) setLoadError("Network error loading manager login accounts.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  async function resetPassword(account: ManagerLoginAccount) {
    if (
      !window.confirm(
        `Reset ${account.name}'s login password? They'll need to set a new one at their next login.`
      )
    ) {
      return;
    }
    setSavingId(account.staffId);
    setActionError("");
    try {
      const response = await fetch("/api/admin/manager-accounts", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ staffId: account.staffId, action: "reset-password" }),
      });
      const data = (await response.json()) as { success?: boolean; error?: string };
      if (!response.ok || !data.success) {
        setActionError(data.error ?? "Failed to reset password.");
        return;
      }
      setAccounts((current) =>
        current.map((a) => (a.staffId === account.staffId ? { ...a, needsSetup: true } : a))
      );
      setResetNotice(account.staffId);
      setTimeout(() => setResetNotice((current) => (current === account.staffId ? null : current)), 4000);
    } catch {
      setActionError("Network error resetting password.");
    } finally {
      setSavingId(null);
    }
  }

  return (
    <section className="ui-card">
      <div className="mb-4">
        <h2 className="ui-card-title">Manager Login Accounts</h2>
        <p className="ui-muted">
          Individual admin-login passwords for Active, Manager-role Staff (Equipment
          Categories &amp; Staff page). Office/Inside Staff never appear here and can&apos;t
          log in as a manager.
        </p>
      </div>

      {loadError ? (
        <div className="ui-field-error">
          {loadError}
        </div>
      ) : null}

      {actionError ? (
        <div className="ui-field-error">
          {actionError}
        </div>
      ) : null}

      {loading ? (
        <div className="p-6 text-center text-gray-600">Loading...</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="ui-table w-full">
            <thead>
              <tr className="border-b bg-gray-50 text-gray-600">
                <th className="px-4 py-3 font-semibold">Name</th>
                <th className="px-4 py-3 font-semibold">Login Status</th>
                <th className="px-4 py-3 font-semibold">Action</th>
              </tr>
            </thead>

            <tbody>
              {accounts.map((account) => (
                <tr key={account.staffId} className="border-b">
                  <td className="px-4 py-3 font-semibold text-gray-900">{account.name}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full border px-2 py-1 text-base font-semibold ${
                        account.needsSetup
                          ? "border-amber-200 bg-amber-100 text-amber-800"
                          : "border-green-200 bg-green-100 text-green-800"
                      }`}
                    >
                      {account.needsSetup ? "Setup pending" : "Active"}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      onClick={() => resetPassword(account)}
                      disabled={savingId === account.staffId || account.needsSetup}
                      className="ui-btn ui-btn-quiet"
                    >
                      Reset Password
                    </button>
                    {resetNotice === account.staffId ? (
                      <p className="ui-strong">Password cleared.</p>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {accounts.length === 0 && (
            <div className="p-6 text-center text-gray-600">
              No active Manager-role Staff found.
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
          <p className="ui-strong">
            Supply Settings
          </p>

          <h2 className="ui-card-title">
            Supply Items and Categories
          </h2>

          <p className="ui-muted">
            Manage the supply categories, item names, descriptions, units,
            stock levels, and active/inactive status used by subcontractors when
            placing supply orders.
          </p>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row lg:min-w-[360px]">
          <Link
            href="/supplies"
            className="ui-btn ui-btn-main"
          >
            Manage Supply Items
          </Link>

          <Link
            href="/supply-orders"
            className="ui-btn ui-btn-second"
          >
            View Supply Orders
          </Link>
        </div>
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-3">
        <div className="ui-stat">
          <p className="ui-strong">Categories</p>
          <p className="ui-muted">
            Categories come from the supply items list, such as Chemicals,
            Trash Bags, Paper Products, Floor Care, Tools, and Other.
          </p>
        </div>

        <div className="ui-stat">
          <p className="ui-strong">Item Descriptions</p>
          <p className="ui-muted">
            Descriptions are shown to subcontractors so they know exactly what
            they are requesting.
          </p>
        </div>

        <div className="ui-stat">
          <p className="ui-strong">Order Log</p>
          <p className="ui-muted">
            Submitted orders are tracked in the Supply Orders page for review,
            approval, denial, and completion.
          </p>
        </div>
      </div>
    </section>
  );
}

export default function SettingsPage() {
  const [isOwner, setIsOwner] = useState(false);
  // Settings -> Team only exists where handoffs are turned on.
  const handoffsOn = useHandoffs().state === "ready";
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
    fetch("/api/session-role", { cache: "no-store" })
      .then((response) => response.json())
      .then((data: { role?: string }) => setIsOwner(data.role === "owner"))
      .catch(() => setIsOwner(false));
  }, []);

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
    <main className="ui-screen">
      <div className="ui-screen-body">
        <ShellTitle title="Settings" backHref="/" />
        <h1 className="ui-screen-title">Settings</h1>

        {/* The places to go, one tap each. The Activity Log tile is owner-only, as before. */}
        <div className="ui-acttiles">
          {handoffsOn ? <Tile icon="status" label="Team" detail="Who does the Office steps, and when things turn red" href="/settings/team" /> : null}
          <Tile icon="key" label="Customer Portal Access" detail="Turn the portal on or off for an account" href="/settings/portal" />
          <Tile icon="note" label="Extra Services" detail="What customers can request" href="/settings/extra-services" />
          <Tile icon="status" label="Equipment Categories and Staff" href="/settings/equipment-categories" />
          {isOwner ? <Tile icon="visit" label="Activity Log" detail="Who changed what" href="/settings/activity-log" /> : null}
          <Tile icon="print" label="Logs" detail="Account update history" href="/settings/logs" />
        </div>

        <h2 className="ui-section-title">Lists used in the app</h2>
        <p className="ui-muted">
          Active now: {activeManagers} managers · {activeVisitTypes} visit types · {activeUpdateTypes} update types · {activeComplaintValidityOptions} complaint validity options.
          Subcontractors are managed on the Subcontractors page.
        </p>

        <div className="grid gap-6">
          <SupplySettingsSection />

          {isOwner ? (
            <ManagersSettingsSection
              managers={managers}
              setManagers={setManagers}
              loading={managersLoading}
              loadError={managersError}
            />
          ) : null}

          {isOwner ? <ManagerLoginAccountsSection /> : null}

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