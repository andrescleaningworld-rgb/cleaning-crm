"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type SupplyItem = {
  id: number;
  name: string;
  unit: string;
  sortOrder: number;
  active: boolean;
};

export default function SupplyCatalogPage() {
  const [items, setItems] = useState<SupplyItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [newName, setNewName] = useState("");
  const [newUnit, setNewUnit] = useState("case");
  const [creating, setCreating] = useState(false);

  async function load() {
    try {
      setLoading(true);
      const res = await fetch("/api/admin/site-links/supplies", { cache: "no-store" });
      const data = await res.json();
      setItems(data.items ?? []);
    } catch {
      setError("Failed to load the supply catalog.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    try {
      setCreating(true);
      setError("");
      const res = await fetch("/api/admin/site-links/supplies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "create", name: newName.trim(), unit: newUnit.trim() || "unit", sortOrder: items.length }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "Could not add item.");
      setNewName("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add item.");
    } finally {
      setCreating(false);
    }
  }

  async function handleToggleActive(item: SupplyItem) {
    try {
      const res = await fetch("/api/admin/site-links/supplies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "update", id: item.id, active: !item.active }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "Failed.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update item.");
    }
  }

  async function handleRename(item: SupplyItem, name: string, unit: string) {
    try {
      const res = await fetch("/api/admin/site-links/supplies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "update", id: item.id, name, unit }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "Failed.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update item.");
    }
  }

  return (
    <main className="min-h-screen bg-gray-100 px-4 py-6 sm:px-6 sm:py-8">
      <div className="mx-auto max-w-3xl space-y-6">
        <div className="flex items-center justify-between rounded-2xl bg-white p-5 shadow-sm">
          <div>
            <Link href="/site-links" className="text-sm font-semibold text-blue-700 no-underline hover:underline">
              ← Back to Site Links
            </Link>
            <h1 className="mt-2 text-2xl font-bold text-slate-900">Supply Catalog</h1>
          </div>
        </div>

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>
        )}

        <section className="rounded-2xl bg-white p-5 shadow-sm">
          <h2 className="text-lg font-bold text-slate-900">Add item</h2>
          <form onSubmit={handleCreate} className="mt-3 flex flex-wrap gap-3">
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Item name"
              required
              className="min-h-[44px] flex-1 rounded-lg border border-gray-300 px-3 text-sm"
            />
            <select
              value={newUnit}
              onChange={(e) => setNewUnit(e.target.value)}
              className="min-h-[44px] rounded-lg border border-gray-300 px-3 text-sm"
            >
              <option value="case">case</option>
              <option value="roll">roll</option>
              <option value="pack">pack</option>
              <option value="unit">unit</option>
            </select>
            <button
              type="submit"
              disabled={creating}
              className="min-h-[44px] rounded-lg bg-blue-700 px-5 text-sm font-semibold text-white disabled:opacity-60"
            >
              {creating ? "Adding…" : "Add"}
            </button>
          </form>
        </section>

        <section className="rounded-2xl bg-white p-5 shadow-sm">
          <h2 className="text-lg font-bold text-slate-900">Items</h2>
          {loading ? (
            <p className="mt-3 text-sm text-slate-500">Loading…</p>
          ) : (
            <ul className="mt-3 divide-y divide-gray-100">
              {items.map((item) => (
                <SupplyItemRow
                  key={item.id}
                  item={item}
                  onToggleActive={() => handleToggleActive(item)}
                  onRename={handleRename}
                />
              ))}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}

function SupplyItemRow({
  item,
  onToggleActive,
  onRename,
}: {
  item: SupplyItem;
  onToggleActive: () => void;
  onRename: (item: SupplyItem, name: string, unit: string) => void;
}) {
  const [name, setName] = useState(item.name);
  const [unit, setUnit] = useState(item.unit);

  return (
    <li className="flex flex-wrap items-center gap-3 py-3">
      <input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        onBlur={() => name.trim() && (name !== item.name || unit !== item.unit) && onRename(item, name.trim(), unit)}
        className="min-h-[40px] flex-1 rounded-lg border border-gray-300 px-3 text-sm"
      />
      <select
        value={unit}
        onChange={(e) => {
          setUnit(e.target.value);
          onRename(item, name, e.target.value);
        }}
        className="min-h-[40px] rounded-lg border border-gray-300 px-3 text-sm"
      >
        <option value="case">case</option>
        <option value="roll">roll</option>
        <option value="pack">pack</option>
        <option value="unit">unit</option>
      </select>
      <button
        type="button"
        onClick={onToggleActive}
        className={`rounded-lg px-3 py-2 text-xs font-semibold ${
          item.active ? "bg-green-100 text-green-800" : "bg-slate-200 text-slate-600"
        }`}
      >
        {item.active ? "Active" : "Inactive"}
      </button>
    </li>
  );
}
