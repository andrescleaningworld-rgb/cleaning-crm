"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { EquipmentPart } from "../types";

type PartDraft = {
  partName: string;
  compatibleEquipmentId: string;
  supplier: string;
  unitCost: string;
  stockQty: string;
  lowStockThreshold: string;
};

const emptyDraft: PartDraft = {
  partName: "",
  compatibleEquipmentId: "",
  supplier: "",
  unitCost: "",
  stockQty: "",
  lowStockThreshold: "",
};

const REASONS = ["Used", "Restocked", "Correction"] as const;

function AddPartForm({ onAdded }: { onAdded: () => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<PartDraft>(emptyDraft);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleAdd() {
    const partName = draft.partName.trim();
    if (!partName) {
      setError("Part name is required.");
      return;
    }

    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/equipment-parts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          partName,
          compatibleEquipmentId: draft.compatibleEquipmentId,
          supplier: draft.supplier,
          unitCost: Number(draft.unitCost) || 0,
          stockQty: Number(draft.stockQty) || 0,
          lowStockThreshold: Number(draft.lowStockThreshold) || 0,
        }),
      });
      const data = (await response.json()) as { success?: boolean; error?: string };
      if (!data.success) {
        setError(data.error || "Failed to add part.");
        return;
      }
      setDraft(emptyDraft);
      setOpen(false);
      await onAdded();
    } catch {
      setError("Network error adding part.");
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
        + Add Part
      </button>
    );
  }

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-xl font-bold text-gray-900">Add Part</h2>
        <button type="button" onClick={() => setOpen(false)} className="text-sm font-semibold text-gray-500 hover:text-gray-800">
          Cancel
        </button>
      </div>

      {error ? (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">{error}</div>
      ) : null}

      <div className="grid gap-3 md:grid-cols-2">
        <div>
          <label className="text-sm font-semibold text-gray-700">Part Name</label>
          <input
            type="text"
            value={draft.partName}
            onChange={(e) => setDraft((d) => ({ ...d, partName: e.target.value }))}
            className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
          />
        </div>
        <div>
          <label className="text-sm font-semibold text-gray-700">Compatible Equipment (ID or &quot;General&quot;)</label>
          <input
            type="text"
            value={draft.compatibleEquipmentId}
            onChange={(e) => setDraft((d) => ({ ...d, compatibleEquipmentId: e.target.value }))}
            placeholder="General"
            className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
          />
        </div>
        <div>
          <label className="text-sm font-semibold text-gray-700">Supplier</label>
          <input
            type="text"
            value={draft.supplier}
            onChange={(e) => setDraft((d) => ({ ...d, supplier: e.target.value }))}
            className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
          />
        </div>
        <div>
          <label className="text-sm font-semibold text-gray-700">Unit Cost</label>
          <input
            type="number"
            value={draft.unitCost}
            onChange={(e) => setDraft((d) => ({ ...d, unitCost: e.target.value }))}
            className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
          />
        </div>
        <div>
          <label className="text-sm font-semibold text-gray-700">Starting Stock Qty</label>
          <input
            type="number"
            value={draft.stockQty}
            onChange={(e) => setDraft((d) => ({ ...d, stockQty: e.target.value }))}
            className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
          />
        </div>
        <div>
          <label className="text-sm font-semibold text-gray-700">Low Stock Threshold</label>
          <input
            type="number"
            value={draft.lowStockThreshold}
            onChange={(e) => setDraft((d) => ({ ...d, lowStockThreshold: e.target.value }))}
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
        {saving ? "Adding..." : "Add Part"}
      </button>
    </section>
  );
}

function AdjustStockControl({ part, onAdjusted }: { part: EquipmentPart; onAdjusted: () => Promise<void> }) {
  const [qty, setQty] = useState("1");
  const [reason, setReason] = useState<(typeof REASONS)[number]>("Used");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function submit() {
    const amount = Number(qty);
    if (!Number.isFinite(amount) || amount <= 0) {
      setError("Enter a positive quantity.");
      return;
    }
    const delta = reason === "Used" ? -amount : amount;

    setSaving(true);
    setError("");
    try {
      const response = await fetch(`/api/equipment-parts/${part.id}/adjust-stock`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ delta, reason }),
      });
      const data = (await response.json()) as { success?: boolean; error?: string };
      if (!data.success) {
        setError(data.error || "Failed to adjust stock.");
        return;
      }
      setQty("1");
      await onAdjusted();
    } catch {
      setError("Network error adjusting stock.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <div className="flex items-center gap-2">
        <select
          value={reason}
          onChange={(e) => setReason(e.target.value as (typeof REASONS)[number])}
          className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm text-gray-900 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
        >
          {REASONS.map((r) => (
            <option key={r} value={r}>{r}</option>
          ))}
        </select>
        <input
          type="number"
          value={qty}
          onChange={(e) => setQty(e.target.value)}
          className="w-20 rounded-lg border border-gray-300 px-2 py-1.5 text-sm text-gray-900 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
        />
        <button
          type="button"
          onClick={submit}
          disabled={saving}
          className="rounded-lg bg-blue-700 px-3 py-1.5 text-sm font-semibold text-white hover:bg-blue-800 disabled:opacity-60"
        >
          {saving ? "..." : "Apply"}
        </button>
      </div>
      {error ? <p className="mt-1 text-xs font-semibold text-red-700">{error}</p> : null}
    </div>
  );
}

export default function EquipmentPartsPage() {
  const [parts, setParts] = useState<EquipmentPart[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  async function loadParts() {
    setLoadError("");
    try {
      const response = await fetch("/api/equipment-parts", { cache: "no-store" });
      const data = (await response.json()) as { success?: boolean; parts?: EquipmentPart[]; error?: string };
      if (!data.success || !Array.isArray(data.parts)) {
        setLoadError(data.error || "Failed to load parts.");
        return;
      }
      setParts(data.parts);
    } catch {
      setLoadError("Network error loading parts.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadParts();
  }, []);

  const lowStockCount = parts.filter((p) => p.lowStock).length;

  return (
    <main className="min-h-screen bg-gray-50 p-6">
      <div className="mx-auto max-w-5xl">
        <div className="mb-6">
          <Link href="/equipment" className="text-sm font-semibold text-blue-700 hover:underline">← Back to Equipment</Link>
          <h1 className="mt-2 text-3xl font-bold text-gray-900">Parts &amp; Stock</h1>
          <p className="mt-1 text-gray-600">Track replacement parts and supplies for equipment.</p>
        </div>

        <div className="mb-6 grid gap-4 md:grid-cols-2">
          <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <p className="text-sm text-gray-500">Total Parts</p>
            <p className="mt-1 text-2xl font-bold text-gray-900">{parts.length}</p>
          </div>
          <div className="rounded-xl border border-red-200 bg-red-50 p-5 shadow-sm">
            <p className="text-sm text-red-700">Low Stock</p>
            <p className="mt-1 text-2xl font-bold text-red-800">{lowStockCount}</p>
          </div>
        </div>

        <div className="mb-6">
          <AddPartForm onAdded={loadParts} />
        </div>

        <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          {loadError ? (
            <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">{loadError}</div>
          ) : null}

          {loading ? (
            <div className="p-6 text-center text-gray-600">Loading parts...</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b bg-gray-50 text-gray-600">
                    <th className="px-4 py-3 font-semibold">Part</th>
                    <th className="px-4 py-3 font-semibold">Compatible With</th>
                    <th className="px-4 py-3 font-semibold">Supplier</th>
                    <th className="px-4 py-3 font-semibold">Unit Cost</th>
                    <th className="px-4 py-3 font-semibold">Stock</th>
                    <th className="px-4 py-3 font-semibold">Adjust</th>
                  </tr>
                </thead>
                <tbody>
                  {parts.map((part) => (
                    <tr key={part.id} className={`border-b ${part.lowStock ? "bg-red-50" : ""}`}>
                      <td className="px-4 py-3 font-semibold text-gray-900">{part.partName}</td>
                      <td className="px-4 py-3 text-gray-700">{part.compatibleEquipmentId || "General"}</td>
                      <td className="px-4 py-3 text-gray-700">{part.supplier || "—"}</td>
                      <td className="px-4 py-3 text-gray-700">{part.unitCost ? `$${part.unitCost.toLocaleString()}` : "—"}</td>
                      <td className="px-4 py-3">
                        <span className={`font-semibold ${part.lowStock ? "text-red-700" : "text-gray-900"}`}>
                          {part.stockQty}
                        </span>
                        <span className="text-gray-400"> / {part.lowStockThreshold} threshold</span>
                        {part.lowStock ? (
                          <span className="ml-2 rounded-full border border-red-300 bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-800">
                            Low Stock
                          </span>
                        ) : null}
                      </td>
                      <td className="px-4 py-3">
                        <AdjustStockControl part={part} onAdjusted={loadParts} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {parts.length === 0 && <div className="p-6 text-center text-gray-600">No parts yet — add one above.</div>}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
