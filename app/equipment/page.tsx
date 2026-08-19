"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import CheckoutReturnModal from "./CheckoutReturnModal";
import { STATUS_LABELS, statusBadgeClass, type EquipmentCategory, type EquipmentItem, type EquipmentStatus } from "./types";

type NewEquipmentDraft = {
  name: string;
  categoryId: string;
  serialNumber: string;
  purchaseDate: string;
  purchaseCost: string;
  conditionNotes: string;
};

const emptyDraft: NewEquipmentDraft = {
  name: "",
  categoryId: "",
  serialNumber: "",
  purchaseDate: "",
  purchaseCost: "",
  conditionNotes: "",
};

function AddEquipmentForm({
  categories,
  onAdded,
}: {
  categories: EquipmentCategory[];
  onAdded: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<NewEquipmentDraft>(emptyDraft);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleAdd() {
    const name = draft.name.trim();
    if (!name) {
      setError("Name is required.");
      return;
    }

    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/equipment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          categoryId: draft.categoryId,
          serialNumber: draft.serialNumber,
          purchaseDate: draft.purchaseDate,
          purchaseCost: Number(draft.purchaseCost) || 0,
          conditionNotes: draft.conditionNotes,
        }),
      });
      const data = (await response.json()) as { success?: boolean; error?: string };
      if (!data.success) {
        setError(data.error || "Failed to add equipment.");
        return;
      }
      setDraft(emptyDraft);
      setOpen(false);
      await onAdded();
    } catch {
      setError("Network error adding equipment.");
    } finally {
      setSaving(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-lg bg-blue-700 px-5 py-3 text-sm font-semibold text-white shadow-sm hover:bg-blue-800"
      >
        + Add Equipment
      </button>
    );
  }

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-xl font-bold text-gray-900">Add Equipment</h2>
        <button type="button" onClick={() => setOpen(false)} className="text-sm font-semibold text-gray-500 hover:text-gray-800">
          Cancel
        </button>
      </div>

      {error ? (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">{error}</div>
      ) : null}

      <div className="grid gap-3 md:grid-cols-2">
        <div>
          <label className="text-sm font-semibold text-gray-700">Name</label>
          <input
            type="text"
            value={draft.name}
            onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
            className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
          />
        </div>

        <div>
          <label className="text-sm font-semibold text-gray-700">Category</label>
          <select
            value={draft.categoryId}
            onChange={(e) => setDraft((d) => ({ ...d, categoryId: e.target.value }))}
            className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
          >
            <option value="">Uncategorized</option>
            {categories.filter((c) => c.active).map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="text-sm font-semibold text-gray-700">Serial Number</label>
          <input
            type="text"
            value={draft.serialNumber}
            onChange={(e) => setDraft((d) => ({ ...d, serialNumber: e.target.value }))}
            className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
          />
        </div>

        <div>
          <label className="text-sm font-semibold text-gray-700">Purchase Date</label>
          <input
            type="date"
            value={draft.purchaseDate}
            onChange={(e) => setDraft((d) => ({ ...d, purchaseDate: e.target.value }))}
            className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
          />
        </div>

        <div>
          <label className="text-sm font-semibold text-gray-700">Purchase Cost</label>
          <input
            type="number"
            value={draft.purchaseCost}
            onChange={(e) => setDraft((d) => ({ ...d, purchaseCost: e.target.value }))}
            className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
          />
        </div>

        <div className="md:col-span-2">
          <label className="text-sm font-semibold text-gray-700">Condition Notes</label>
          <textarea
            value={draft.conditionNotes}
            onChange={(e) => setDraft((d) => ({ ...d, conditionNotes: e.target.value }))}
            rows={2}
            className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
          />
        </div>
      </div>

      <button
        type="button"
        onClick={handleAdd}
        disabled={saving}
        className="mt-4 rounded-lg bg-blue-700 px-5 py-3 text-sm font-semibold text-white shadow-sm hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {saving ? "Adding..." : "Add Equipment"}
      </button>
    </section>
  );
}

export default function EquipmentListPage() {
  const [equipment, setEquipment] = useState<EquipmentItem[]>([]);
  const [categories, setCategories] = useState<EquipmentCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  const [statusFilter, setStatusFilter] = useState<EquipmentStatus | "All">("All");
  const [categoryFilter, setCategoryFilter] = useState<string>("All");

  const [modalState, setModalState] = useState<{ mode: "checkout" | "return"; equipment: EquipmentItem } | null>(null);

  async function loadAll() {
    setLoadError("");
    try {
      const [equipmentRes, categoriesRes] = await Promise.all([
        fetch("/api/equipment", { cache: "no-store" }),
        fetch("/api/equipment-categories", { cache: "no-store" }),
      ]);
      const equipmentData = (await equipmentRes.json()) as { success?: boolean; equipment?: EquipmentItem[]; error?: string };
      const categoriesData = (await categoriesRes.json()) as { success?: boolean; categories?: EquipmentCategory[] };

      if (!equipmentData.success || !Array.isArray(equipmentData.equipment)) {
        setLoadError(equipmentData.error || "Failed to load equipment.");
        return;
      }
      setEquipment(equipmentData.equipment);
      if (categoriesData.success && Array.isArray(categoriesData.categories)) {
        setCategories(categoriesData.categories);
      }
    } catch {
      setLoadError("Network error loading equipment.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAll();
  }, []);

  const categoryNameById = useMemo(() => {
    const map: Record<string, string> = {};
    for (const c of categories) map[c.id] = c.name;
    return map;
  }, [categories]);

  const filtered = useMemo(() => {
    return equipment.filter((item) => {
      if (statusFilter !== "All" && item.status !== statusFilter) return false;
      if (categoryFilter !== "All" && item.categoryId !== categoryFilter) return false;
      return true;
    });
  }, [equipment, statusFilter, categoryFilter]);

  const overdueCount = equipment.filter((e) => e.overdue).length;

  return (
    <main className="min-h-screen bg-gray-50 p-6">
      <div className="mx-auto max-w-7xl">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Equipment</h1>
            <p className="mt-1 text-gray-600">Inventory, checkout/return, and overdue tracking.</p>
          </div>

          <div className="flex gap-3">
            <Link
              href="/equipment/parts"
              className="rounded-lg border border-gray-300 bg-white px-5 py-3 text-sm font-semibold text-gray-700 shadow-sm hover:bg-gray-50"
            >
              Parts &amp; Stock
            </Link>
            <Link
              href="/settings/equipment-categories"
              className="rounded-lg border border-gray-300 bg-white px-5 py-3 text-sm font-semibold text-gray-700 shadow-sm hover:bg-gray-50"
            >
              Categories &amp; Staff
            </Link>
          </div>
        </div>

        <div className="mb-6 grid gap-4 md:grid-cols-3">
          <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <p className="text-sm text-gray-500">Total Equipment</p>
            <p className="mt-1 text-2xl font-bold text-gray-900">{equipment.length}</p>
          </div>
          <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <p className="text-sm text-gray-500">Checked Out</p>
            <p className="mt-1 text-2xl font-bold text-gray-900">
              {equipment.filter((e) => e.status === "CheckedOut").length}
            </p>
          </div>
          <div className="rounded-xl border border-red-200 bg-red-50 p-5 shadow-sm">
            <p className="text-sm text-red-700">Overdue</p>
            <p className="mt-1 text-2xl font-bold text-red-800">{overdueCount}</p>
          </div>
        </div>

        <div className="mb-6">
          <AddEquipmentForm categories={categories} onAdded={loadAll} />
        </div>

        <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <div>
              <label className="text-xs font-semibold text-gray-500">Status</label>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as EquipmentStatus | "All")}
                className="mt-1 block rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
              >
                <option value="All">All Statuses</option>
                {(Object.keys(STATUS_LABELS) as EquipmentStatus[]).map((s) => (
                  <option key={s} value={s}>{STATUS_LABELS[s]}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs font-semibold text-gray-500">Category</label>
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className="mt-1 block rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
              >
                <option value="All">All Categories</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}{!c.active ? " (Inactive)" : ""}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {loadError ? (
            <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">{loadError}</div>
          ) : null}

          {loading ? (
            <div className="p-6 text-center text-gray-600">Loading equipment...</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b bg-gray-50 text-gray-600">
                    <th className="px-4 py-3 font-semibold">Name</th>
                    <th className="px-4 py-3 font-semibold">Category</th>
                    <th className="px-4 py-3 font-semibold">Status</th>
                    <th className="px-4 py-3 font-semibold">Holder</th>
                    <th className="px-4 py-3 font-semibold">Expected Return</th>
                    <th className="px-4 py-3 font-semibold">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((item) => (
                    <tr key={item.id} className="border-b">
                      <td className="px-4 py-3">
                        <Link href={`/equipment/${item.id}`} className="font-semibold text-blue-700 hover:underline">
                          {item.name}
                        </Link>
                        {item.needsMaintenanceReview ? (
                          <span className="ml-2 rounded-full border border-amber-300 bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">
                            Needs Review
                          </span>
                        ) : null}
                      </td>
                      <td className="px-4 py-3 text-gray-700">{categoryNameById[item.categoryId] || "Uncategorized"}</td>
                      <td className="px-4 py-3">
                        <span className={`rounded-full border px-2 py-1 text-xs font-semibold ${statusBadgeClass(item.status, item.overdue)}`}>
                          {item.overdue ? "Overdue" : STATUS_LABELS[item.status]}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-700">{item.currentHolderName || "—"}</td>
                      <td className="px-4 py-3 text-gray-700">{item.expectedReturnAt || "—"}</td>
                      <td className="px-4 py-3">
                        {item.status === "Available" ? (
                          <button
                            type="button"
                            onClick={() => setModalState({ mode: "checkout", equipment: item })}
                            className="font-semibold text-blue-700 hover:underline"
                          >
                            Check Out
                          </button>
                        ) : item.status === "CheckedOut" ? (
                          <button
                            type="button"
                            onClick={() => setModalState({ mode: "return", equipment: item })}
                            className="font-semibold text-blue-700 hover:underline"
                          >
                            Return
                          </button>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {filtered.length === 0 && (
                <div className="p-6 text-center text-gray-600">No equipment matches these filters.</div>
              )}
            </div>
          )}
        </section>
      </div>

      {modalState ? (
        <CheckoutReturnModal
          mode={modalState.mode}
          equipment={modalState.equipment}
          onClose={() => setModalState(null)}
          onDone={() => {
            setModalState(null);
            loadAll();
          }}
        />
      ) : null}
    </main>
  );
}
