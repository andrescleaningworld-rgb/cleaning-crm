"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { EquipmentCategory } from "@/app/equipment/types";
import StaffManager from "@/app/equipment/StaffManager";

function CategoriesSection() {
  const [categories, setCategories] = useState<EquipmentCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [newName, setNewName] = useState("");
  const [adding, setAdding] = useState(false);
  const [actionError, setActionError] = useState("");
  const [savingId, setSavingId] = useState<string | null>(null);
  const [renameDrafts, setRenameDrafts] = useState<Record<string, string>>({});

  async function loadCategories() {
    setLoadError("");
    try {
      const response = await fetch("/api/equipment-categories", { cache: "no-store" });
      const data = (await response.json()) as { success?: boolean; categories?: EquipmentCategory[]; error?: string };
      if (!data.success || !Array.isArray(data.categories)) {
        setLoadError(data.error || "Failed to load categories.");
        return;
      }
      setCategories(data.categories);
    } catch {
      setLoadError("Network error loading categories.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadCategories();
  }, []);

  async function handleAdd() {
    const name = newName.trim();
    if (!name) {
      setActionError("Enter a category name first.");
      return;
    }
    setAdding(true);
    setActionError("");
    try {
      const response = await fetch("/api/equipment-categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const data = (await response.json()) as { success?: boolean; error?: string };
      if (!data.success) {
        setActionError(data.error || "Failed to add category.");
        return;
      }
      setNewName("");
      await loadCategories();
    } catch {
      setActionError("Network error adding category.");
    } finally {
      setAdding(false);
    }
  }

  function getRenameDraft(category: EquipmentCategory): string {
    return renameDrafts[category.id] ?? category.name;
  }

  async function saveRename(category: EquipmentCategory) {
    const draft = (renameDrafts[category.id] ?? category.name).trim();
    if (!draft || draft === category.name) return;

    setSavingId(category.id);
    setActionError("");
    try {
      const response = await fetch(`/api/equipment-categories/${category.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: draft }),
      });
      const data = (await response.json()) as { success?: boolean; error?: string };
      if (!data.success) {
        setActionError(data.error || "Failed to rename category.");
        return;
      }
      await loadCategories();
    } catch {
      setActionError("Network error renaming category.");
    } finally {
      setSavingId(null);
    }
  }

  async function toggleActive(category: EquipmentCategory) {
    setSavingId(category.id);
    setActionError("");
    try {
      const response = await fetch(`/api/equipment-categories/${category.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: !category.active }),
      });
      const data = (await response.json()) as { success?: boolean; error?: string };
      if (!data.success) {
        setActionError(data.error || "Failed to update category.");
        return;
      }
      await loadCategories();
    } catch {
      setActionError("Network error updating category.");
    } finally {
      setSavingId(null);
    }
  }

  return (
    <section className="ui-card">
      <div className="mb-4">
        <h2 className="ui-card-title">Equipment Categories</h2>
        <p className="ui-muted">
          Deactivating a category never hides it from equipment that already uses it — it just stops
          showing up as an option for new/edited equipment.
        </p>
      </div>

      <div className="mb-4 flex flex-col gap-3 md:flex-row">
        <input
          type="text"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="Add category..."
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

      {loadError ? <div className="ui-field-error">{loadError}</div> : null}
      {actionError ? <div className="ui-field-error">{actionError}</div> : null}

      {loading ? (
        <div className="p-6 text-center text-gray-600">Loading categories...</div>
      ) : (
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
              {categories.map((category) => (
                <tr key={category.id} className="border-b">
                  <td className="px-4 py-3">
                    <input
                      type="text"
                      value={getRenameDraft(category)}
                      onChange={(e) => setRenameDrafts((cur) => ({ ...cur, [category.id]: e.target.value }))}
                      onBlur={() => saveRename(category)}
                      disabled={savingId === category.id}
                      className="ui-input w-full"
                    />
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full border px-2 py-1 text-base font-semibold ${
                        category.active ? "border-green-200 bg-green-100 text-green-800" : "border-gray-200 bg-gray-100 text-gray-600"
                      }`}
                    >
                      {category.active ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      onClick={() => toggleActive(category)}
                      disabled={savingId === category.id}
                      className="ui-btn ui-btn-quiet"
                    >
                      {category.active ? "Deactivate" : "Activate"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {categories.length === 0 && <div className="p-6 text-center text-gray-600">No categories yet — add one above.</div>}
        </div>
      )}
    </section>
  );
}

export default function EquipmentCategoriesSettingsPage() {
  return (
    <main className="ui-screen">
      <div className="ui-screen-body">
        <div className="mb-6">
          <Link href="/settings" className="ui-link">← Back to Settings</Link>
          <h1 className="ui-screen-title">Equipment Categories &amp; Staff</h1>
          <p className="ui-muted">
            Manage the equipment categories and the Staff roster used for equipment checkout/return sign-off.
          </p>
        </div>

        <div className="grid gap-6">
          <CategoriesSection />
          {/* Same Staff & PINs screen as /equipment/staff. */}
          <StaffManager />
        </div>
      </div>
    </main>
  );
}
