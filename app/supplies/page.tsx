"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type SupplyItem = {
  id?: string;
  ID?: string;
  supplyId?: string;
  "Supply ID"?: string;

  supplyItem?: string;
  item?: string;
  itemName?: string;
  name?: string;
  "Supply Item"?: string;

  category?: string;
  Category?: string;

  unit?: string;
  Unit?: string;

  active?: string;
  Active?: string;
  status?: string;
  Status?: string;

  currentStock?: string;
  CurrentStock?: string;
  "Current Stock"?: string;
  stock?: string;

  minimumStock?: string;
  MinimumStock?: string;
  "Minimum Stock"?: string;
  minStock?: string;

  notes?: string;
  Notes?: string;

  lastUpdated?: string;
  LastUpdated?: string;
  "Last Updated"?: string;

  rowNumber?: number;
};

type SuppliesApiResponse = {
  success?: boolean;
  error?: string;
  supplyItems?: SupplyItem[];
  supplies?: SupplyItem[];
  data?: SupplyItem[];
};

type SupplyForm = {
  supplyId: string;
  rowNumber: string;
  supplyItem: string;
  category: string;
  unit: string;
  active: string;
  currentStock: string;
  minimumStock: string;
  notes: string;
};
const supplyCategories = [
  "Paper",
  "Trash Bags",
  "Soap",
  "Chemicals / Cleaners",
  "Equipment",
  "Misc",
];
const emptyForm: SupplyForm = {
  supplyId: "",
  rowNumber: "",
  supplyItem: "",
  category: "",
  unit: "",
  active: "Yes",
  currentStock: "",
  minimumStock: "",
  notes: "",
};

function getSupplyId(item: SupplyItem) {
  return item.supplyId || item.id || item.ID || item["Supply ID"] || "";
}

function getSupplyName(item: SupplyItem) {
  return (
    item.supplyItem ||
    item["Supply Item"] ||
    item.item ||
    item.itemName ||
    item.name ||
    "Unnamed Supply"
  );
}

function getCategory(item: SupplyItem) {
  return item.category || item.Category || "";
}

function getUnit(item: SupplyItem) {
  return item.unit || item.Unit || "";
}

function getActive(item: SupplyItem) {
  return item.active || item.Active || item.status || item.Status || "Yes";
}

function getCurrentStock(item: SupplyItem) {
  return (
    item.currentStock ||
    item.CurrentStock ||
    item["Current Stock"] ||
    item.stock ||
    ""
  );
}

function getMinimumStock(item: SupplyItem) {
  return (
    item.minimumStock ||
    item.MinimumStock ||
    item["Minimum Stock"] ||
    item.minStock ||
    ""
  );
}

function getNotes(item: SupplyItem) {
  return item.notes || item.Notes || "";
}

function getLastUpdated(item: SupplyItem) {
  return item.lastUpdated || item.LastUpdated || item["Last Updated"] || "";
}

function getLoadedSupplyItems(data: SuppliesApiResponse | SupplyItem[]) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data.supplyItems)) return data.supplyItems;
  if (Array.isArray(data.supplies)) return data.supplies;
  if (Array.isArray(data.data)) return data.data;
  return [];
}

function isActiveSupply(item: SupplyItem) {
  const active = String(getActive(item) || "").toLowerCase().trim();

  if (!active) return true;

  return !["no", "inactive", "false", "disabled", "removed"].includes(active);
}

function isLowStock(item: SupplyItem) {
  const current = Number(String(getCurrentStock(item)).replace(/,/g, ""));
  const minimum = Number(String(getMinimumStock(item)).replace(/,/g, ""));

  if (Number.isNaN(current) || Number.isNaN(minimum)) return false;
  if (minimum <= 0) return false;

  return current <= minimum;
}

export default function SuppliesPage() {
  const [supplies, setSupplies] = useState<SupplyItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<SupplyForm>(emptyForm);

  async function loadSupplies() {
    try {
      setLoading(true);
      setError("");

      const res = await fetch("/api/supplies?action=getSupplyItemsAdmin", {
        cache: "no-store",
      });

      const data = (await res.json()) as SuppliesApiResponse | SupplyItem[];

      if (!res.ok || (!Array.isArray(data) && data.success === false)) {
        throw new Error(
          !Array.isArray(data) && data.error
            ? data.error
            : "Failed to load supplies."
        );
      }

      setSupplies(getLoadedSupplyItems(data));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadSupplies();
  }, []);

  const filteredSupplies = useMemo(() => {
    const q = search.toLowerCase().trim();

    if (!q) return supplies;

    return supplies.filter((item) => {
      return [
        getSupplyId(item),
        getSupplyName(item),
        getCategory(item),
        getUnit(item),
        getActive(item),
        getCurrentStock(item),
        getMinimumStock(item),
        getNotes(item),
      ]
        .join(" ")
        .toLowerCase()
        .includes(q);
    });
  }, [supplies, search]);

  function updateForm(field: keyof SupplyForm, value: string) {
    setForm((prev) => ({
      ...prev,
      [field]: value,
    }));
  }

  function resetForm() {
    setForm(emptyForm);
    setEditing(false);
    setShowForm(false);
  }

  function startAdd() {
    setForm(emptyForm);
    setEditing(false);
    setShowForm(true);
    setSuccessMessage("");
    setError("");
  }

  function startEdit(item: SupplyItem) {
    setForm({
      supplyId: getSupplyId(item),
      rowNumber: item.rowNumber ? String(item.rowNumber) : "",
      supplyItem: getSupplyName(item),
      category: getCategory(item),
      unit: getUnit(item),
      active: getActive(item) || "Yes",
      currentStock: getCurrentStock(item),
      minimumStock: getMinimumStock(item),
      notes: getNotes(item),
    });

    setEditing(true);
    setShowForm(true);
    setSuccessMessage("");
    setError("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    try {
      setSaving(true);
      setError("");
      setSuccessMessage("");

      const action = editing ? "updateSupplyItem" : "addSupplyItem";

      const res = await fetch("/api/supplies", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action,
          ...form,
          rowNumber: form.rowNumber ? Number(form.rowNumber) : undefined,
        }),
      });

      const data = (await res.json()) as SuppliesApiResponse;

      if (!res.ok || data.success === false) {
        throw new Error(data.error || "Failed to save supply item.");
      }

      setSuccessMessage(
        editing
          ? "Supply item updated successfully."
          : "Supply item added successfully."
      );

      resetForm();
      await loadSupplies();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDeactivate(item: SupplyItem) {
    const supplyName = getSupplyName(item);
    const confirmed = window.confirm(
      `Remove ${supplyName} from the active supply list? This will deactivate it, not delete history.`
    );

    if (!confirmed) return;

    try {
      setSaving(true);
      setError("");
      setSuccessMessage("");

      const res = await fetch("/api/supplies", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "deactivateSupplyItem",
          supplyId: getSupplyId(item),
          supplyItem: supplyName,
          rowNumber: item.rowNumber,
        }),
      });

      const data = (await res.json()) as SuppliesApiResponse;

      if (!res.ok || data.success === false) {
        throw new Error(data.error || "Failed to remove supply item.");
      }

      setSuccessMessage("Supply item deactivated successfully.");
      await loadSupplies();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setSaving(false);
    }
  }

  const activeCount = supplies.filter(isActiveSupply).length;
  const inactiveCount = supplies.length - activeCount;
  const lowStockCount = supplies.filter(isLowStock).length;

  // Later we can connect this to the real Supply Orders tab.
  // For now, the button is ready but will not show a badge unless this number is above 0.
  const newSupplyOrdersCount = 0;

  return (
    <main className="min-h-screen bg-gray-100 px-4 py-6 text-slate-900 sm:px-6 sm:py-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="rounded-2xl bg-white p-5 shadow-sm sm:p-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <h1 className="text-2xl font-bold sm:text-3xl">Supplies</h1>
              <p className="mt-1 text-sm leading-6 text-slate-600">
                Manage the supply list used by the subcontractor portal.
              </p>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
  <Link
    href="/supply-orders"
    className="relative rounded-lg border border-blue-200 bg-white px-4 py-3 text-center text-sm font-semibold text-blue-800 hover:bg-blue-50"
  >
    <span className="mr-2">🔔</span>
    Supply Orders

    {newSupplyOrdersCount > 0 ? (
      <span className="absolute -right-2 -top-2 rounded-full bg-red-600 px-2 py-1 text-xs font-black text-white">
        {newSupplyOrdersCount}
      </span>
    ) : null}
  </Link>

  <button
    type="button"
    onClick={showForm ? resetForm : startAdd}
    className="rounded-lg bg-blue-700 px-4 py-3 text-sm font-semibold text-white hover:bg-blue-800"
  >
    {showForm ? "Cancel" : "Add Supply"}
  </button>
</div>
          </div>

          <div className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-3">
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs font-semibold uppercase text-slate-500">
                Active Supplies
              </p>
              <p className="mt-1 text-2xl font-bold">{activeCount}</p>
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs font-semibold uppercase text-slate-500">
                Inactive Supplies
              </p>
              <p className="mt-1 text-2xl font-bold">{inactiveCount}</p>
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs font-semibold uppercase text-slate-500">
                Low Stock
              </p>
              <p className="mt-1 text-2xl font-bold">{lowStockCount}</p>
            </div>
          </div>

          <div className="mt-5">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search supplies..."
              className="min-h-[48px] w-full rounded-lg border border-slate-300 px-4 py-3 text-base outline-none focus:border-blue-600 sm:text-sm"
            />
          </div>

          {successMessage && (
            <div className="mt-4 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
              {successMessage}
            </div>
          )}

          {error && (
            <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
              {error}
            </div>
          )}
        </div>

        {showForm && (
          <form
            onSubmit={handleSubmit}
            className="rounded-2xl bg-white p-5 shadow-sm sm:p-6"
          >
            <h2 className="text-lg font-bold">
              {editing ? "Edit Supply" : "Add Supply"}
            </h2>

            <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <label className="text-sm font-semibold">Supply Item</label>
                <input
                  value={form.supplyItem}
                  onChange={(e) => updateForm("supplyItem", e.target.value)}
                  required
                  className="mt-1 min-h-[48px] w-full rounded-lg border border-slate-300 px-3 py-3 text-base sm:text-sm"
                />
              </div>

              <div>
  <label className="text-sm font-semibold">Category</label>
  <select
    value={form.category}
    onChange={(e) => updateForm("category", e.target.value)}
    className="mt-1 min-h-[48px] w-full rounded-lg border border-slate-300 bg-white px-3 py-3 text-base sm:text-sm"
  >
    <option value="">Select category</option>
    {supplyCategories.map((category) => (
      <option key={category} value={category}>
        {category}
      </option>
    ))}
  </select>
</div>

              <div>
                <label className="text-sm font-semibold">Unit</label>
                <input
                  value={form.unit}
                  onChange={(e) => updateForm("unit", e.target.value)}
                  placeholder="Case, box, gallon, each..."
                  className="mt-1 min-h-[48px] w-full rounded-lg border border-slate-300 px-3 py-3 text-base sm:text-sm"
                />
              </div>

              <div>
                <label className="text-sm font-semibold">Active</label>
                <select
                  value={form.active}
                  onChange={(e) => updateForm("active", e.target.value)}
                  className="mt-1 min-h-[48px] w-full rounded-lg border border-slate-300 px-3 py-3 text-base sm:text-sm"
                >
                  <option value="Yes">Yes</option>
                  <option value="No">No</option>
                </select>
              </div>

              <div>
                <label className="text-sm font-semibold">Current Stock</label>
                <input
                  type="number"
                  min="0"
                  value={form.currentStock}
                  onChange={(e) => updateForm("currentStock", e.target.value)}
                  className="mt-1 min-h-[48px] w-full rounded-lg border border-slate-300 px-3 py-3 text-base sm:text-sm"
                />
              </div>

              <div>
                <label className="text-sm font-semibold">Minimum Stock</label>
                <input
                  type="number"
                  min="0"
                  value={form.minimumStock}
                  onChange={(e) => updateForm("minimumStock", e.target.value)}
                  className="mt-1 min-h-[48px] w-full rounded-lg border border-slate-300 px-3 py-3 text-base sm:text-sm"
                />
              </div>

              <div className="md:col-span-2">
                <label className="text-sm font-semibold">Notes</label>
                <textarea
                  value={form.notes}
                  onChange={(e) => updateForm("notes", e.target.value)}
                  rows={4}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-3 text-base sm:text-sm"
                />
              </div>
            </div>

            <div className="mt-5 grid grid-cols-1 gap-3 sm:flex sm:flex-wrap">
              <button
                type="submit"
                disabled={saving}
                className="rounded-lg bg-blue-700 px-4 py-3 text-sm font-semibold text-white hover:bg-blue-800 disabled:opacity-60"
              >
                {saving
                  ? "Saving..."
                  : editing
                    ? "Update Supply"
                    : "Save Supply"}
              </button>

              <button
                type="button"
                onClick={resetForm}
                className="rounded-lg border border-slate-300 px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
            </div>
          </form>
        )}

        <section className="rounded-2xl bg-white p-5 shadow-sm sm:p-6">
          <div className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="text-lg font-bold">Supply List</h2>
            <p className="text-sm text-slate-600">
              {filteredSupplies.length} shown
            </p>
          </div>

          {loading ? (
            <p className="text-sm text-slate-600">Loading supplies...</p>
          ) : filteredSupplies.length === 0 ? (
            <p className="text-sm text-slate-600">No supplies found.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b bg-slate-50 text-slate-700">
                    <th className="px-4 py-3 font-semibold">Supply</th>
                    <th className="px-4 py-3 font-semibold">Category</th>
                    <th className="px-4 py-3 font-semibold">Unit</th>
                    <th className="px-4 py-3 font-semibold">Stock</th>
                    <th className="px-4 py-3 font-semibold">Minimum</th>
                    <th className="px-4 py-3 font-semibold">Status</th>
                    <th className="px-4 py-3 font-semibold">Last Updated</th>
                    <th className="px-4 py-3 font-semibold">Actions</th>
                  </tr>
                </thead>

                <tbody>
                  {filteredSupplies.map((item, index) => {
                    const id = getSupplyId(item);
                    const active = isActiveSupply(item);
                    const lowStock = isLowStock(item);

                    return (
                      <tr
                        key={id || `${getSupplyName(item)}-${index}`}
                        className="border-b last:border-b-0 hover:bg-slate-50"
                      >
                        <td className="px-4 py-3 font-semibold">
                          <div>{getSupplyName(item)}</div>
                          {getNotes(item) && (
                            <div className="mt-1 text-xs font-normal text-slate-500">
                              {getNotes(item)}
                            </div>
                          )}
                        </td>

                        <td className="px-4 py-3">{getCategory(item) || "-"}</td>
                        <td className="px-4 py-3">{getUnit(item) || "-"}</td>

                        <td className="px-4 py-3">
                          <span className={lowStock ? "font-bold text-red-700" : ""}>
                            {getCurrentStock(item) || "-"}
                          </span>
                          {lowStock && (
                            <span className="ml-2 rounded-full bg-red-100 px-2 py-1 text-xs font-semibold text-red-700">
                              Low
                            </span>
                          )}
                        </td>

                        <td className="px-4 py-3">
                          {getMinimumStock(item) || "-"}
                        </td>

                        <td className="px-4 py-3">
                          <span
                            className={
                              active
                                ? "rounded-full bg-green-100 px-3 py-1 text-xs font-semibold text-green-800"
                                : "rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700"
                            }
                          >
                            {active ? "Active" : "Inactive"}
                          </span>
                        </td>

                        <td className="px-4 py-3">
                          {getLastUpdated(item) || "-"}
                        </td>

                        <td className="px-4 py-3">
                          <div className="flex flex-col gap-2 sm:flex-row">
                            <button
                              type="button"
                              onClick={() => startEdit(item)}
                              className="rounded-lg bg-blue-700 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-800"
                            >
                              Edit
                            </button>

                            {active && (
                              <button
                                type="button"
                                disabled={saving}
                                onClick={() => handleDeactivate(item)}
                                className="rounded-lg border border-red-200 px-3 py-2 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:opacity-60"
                              >
                                Remove
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}