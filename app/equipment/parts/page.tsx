"use client";

// Parts & stock (Equipment redesign): one big "Add a part" button, then a
// card per part with its stock in big numbers and three plain buttons —
// "Used", "Restocked", "Fix count". Same /api/equipment-parts routes as
// before; stock only ever changes through adjust-stock (→
// adjustEquipmentPartStock in lib/googleSheets.ts, per the standing rule).
import { useEffect, useState } from "react";
import type { EquipmentPart } from "../types";
import { BigButton, EquipmentShell, ErrorNote } from "../ui";

type PartDraft = {
  partName: string;
  compatibleEquipmentId: string;
  supplier: string;
  unitCost: string;
  stockQty: string;
  lowStockThreshold: string;
};

const emptyDraft: PartDraft = { partName: "", compatibleEquipmentId: "", supplier: "", unitCost: "", stockQty: "", lowStockThreshold: "" };

const inputClass = "mt-2 min-h-[56px] w-full rounded-xl border-2 border-gray-300 px-4 text-xl text-gray-900 outline-none focus:border-blue-600";

function AddPartForm({ onAdded, onCancel }: { onAdded: () => Promise<void>; onCancel: () => void }) {
  const [draft, setDraft] = useState<PartDraft>(emptyDraft);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const set = (field: keyof PartDraft) => (value: string) => setDraft((d) => ({ ...d, [field]: value }));

  async function handleAdd() {
    const partName = draft.partName.trim();
    if (!partName) {
      setError("Type the part name first.");
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
        setError(data.error || "Could not add. Try again.");
        return;
      }
      await onAdded();
    } catch {
      setError("No connection. Try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="space-y-4 rounded-3xl bg-white p-5 shadow-sm">
      <h2 className="text-2xl font-black text-gray-900">Add a part</h2>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block sm:col-span-2">
          <span className="text-lg font-bold text-gray-800">Part name</span>
          <input value={draft.partName} onChange={(e) => set("partName")(e.target.value)} className={inputClass} />
        </label>
        <label className="block">
          <span className="text-lg font-bold text-gray-800">How many now</span>
          <input type="number" inputMode="numeric" value={draft.stockQty} onChange={(e) => set("stockQty")(e.target.value)} className={inputClass} />
        </label>
        <label className="block">
          <span className="text-lg font-bold text-gray-800">Warn me below</span>
          <input type="number" inputMode="numeric" value={draft.lowStockThreshold} onChange={(e) => set("lowStockThreshold")(e.target.value)} className={inputClass} />
        </label>
        <label className="block">
          <span className="text-lg font-bold text-gray-800">Fits (equipment)</span>
          <input value={draft.compatibleEquipmentId} onChange={(e) => set("compatibleEquipmentId")(e.target.value)} placeholder="General" className={inputClass} />
        </label>
        <label className="block">
          <span className="text-lg font-bold text-gray-800">Supplier</span>
          <input value={draft.supplier} onChange={(e) => set("supplier")(e.target.value)} className={inputClass} />
        </label>
        <label className="block">
          <span className="text-lg font-bold text-gray-800">Price each ($)</span>
          <input type="number" inputMode="decimal" value={draft.unitCost} onChange={(e) => set("unitCost")(e.target.value)} className={inputClass} />
        </label>
      </div>
      <ErrorNote message={error} />
      <div className="grid gap-3 sm:grid-cols-2">
        <BigButton label="Cancel" onClick={onCancel} disabled={saving} />
        <BigButton icon="✔" label={saving ? "Adding…" : "Add part"} tone="green" onClick={handleAdd} disabled={saving} />
      </div>
    </section>
  );
}

function PartCard({ part, onChanged }: { part: EquipmentPart; onChanged: () => Promise<void> }) {
  const [qty, setQty] = useState(1);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [fixing, setFixing] = useState(false);
  const [newCount, setNewCount] = useState(String(part.stockQty));

  async function adjust(delta: number, reason: "Used" | "Restocked" | "Correction"): Promise<boolean> {
    if (delta === 0) return true;
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
        setError(data.error || "Could not save. Try again.");
        return false;
      }
      setQty(1);
      await onChanged();
      return true;
    } catch {
      setError("No connection. Try again.");
      return false;
    } finally {
      setSaving(false);
    }
  }

  const target = Math.max(0, Math.floor(Number(newCount)));

  return (
    <div className={`space-y-4 rounded-3xl border-4 bg-white p-5 shadow-sm ${part.lowStock ? "border-red-300" : "border-transparent"}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-2xl font-black text-gray-900">{part.partName}</p>
          <p className="text-base text-gray-600">
            Fits: {part.compatibleEquipmentId || "General"}
            {part.supplier ? ` · ${part.supplier}` : ""}
            {part.unitCost ? ` · $${part.unitCost.toLocaleString()} each` : ""}
          </p>
        </div>
        <div className="text-right">
          <p className={`text-5xl font-black ${part.lowStock ? "text-red-700" : "text-gray-900"}`}>{part.stockQty}</p>
          <p className="text-base text-gray-500">in stock</p>
        </div>
      </div>
      {part.lowStock ? (
        <p className="rounded-xl bg-red-50 px-4 py-2 text-lg font-bold text-red-800">Low — order more (warns below {part.lowStockThreshold})</p>
      ) : null}

      <div className="flex items-center justify-center gap-4">
        <button
          type="button"
          onClick={() => setQty((q) => Math.max(1, q - 1))}
          aria-label="Fewer"
          className="flex h-14 w-14 items-center justify-center rounded-full bg-gray-100 text-3xl font-bold text-gray-700 hover:bg-gray-200"
        >
          −
        </button>
        <span className="w-16 text-center text-3xl font-black text-blue-700">{qty}</span>
        <button
          type="button"
          onClick={() => setQty((q) => Math.min(999, q + 1))}
          aria-label="More"
          className="flex h-14 w-14 items-center justify-center rounded-full bg-gray-100 text-3xl font-bold text-gray-700 hover:bg-gray-200"
        >
          +
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <BigButton icon="➖" label={`Used ${qty}`} tone="amber" onClick={() => adjust(-qty, "Used")} disabled={saving || part.stockQty - qty < 0} />
        <BigButton icon="➕" label={`Restocked ${qty}`} tone="green" onClick={() => adjust(qty, "Restocked")} disabled={saving} />
      </div>
      <button
        type="button"
        onClick={() => {
          setNewCount(String(part.stockQty));
          setFixing(true);
        }}
        className="min-h-[48px] w-full text-lg font-bold text-blue-700"
      >
        Count is wrong? Fix count
      </button>
      <ErrorNote message={error} />

      {fixing ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true">
          <div className="w-full max-w-md space-y-4 rounded-3xl bg-white p-6 shadow-xl">
            <p className="text-2xl font-black text-gray-900">How many {part.partName} are there really?</p>
            <input
              type="number"
              inputMode="numeric"
              value={newCount}
              onChange={(e) => setNewCount(e.target.value)}
              autoFocus
              className="min-h-[64px] w-full rounded-xl border-2 border-gray-300 px-4 text-3xl font-black outline-none focus:border-blue-600"
            />
            <div className="grid grid-cols-2 gap-3">
              <BigButton label="Cancel" onClick={() => setFixing(false)} disabled={saving} />
              <BigButton
                label={saving ? "…" : `Set to ${target}`}
                tone="primary"
                disabled={saving || newCount.trim() === ""}
                onClick={async () => {
                  if (await adjust(target - part.stockQty, "Correction")) setFixing(false);
                }}
              />
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default function EquipmentPartsPage() {
  const [parts, setParts] = useState<EquipmentPart[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [adding, setAdding] = useState(false);
  const [search, setSearch] = useState("");

  async function loadParts() {
    setLoadError("");
    try {
      const response = await fetch("/api/equipment-parts", { cache: "no-store" });
      const data = (await response.json()) as { success?: boolean; parts?: EquipmentPart[]; error?: string };
      if (!data.success || !Array.isArray(data.parts)) {
        setLoadError(data.error || "Could not load parts.");
        return;
      }
      setParts(data.parts);
    } catch {
      setLoadError("No connection. Reload the page.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadParts();
  }, []);

  const query = search.trim().toLowerCase();
  const shown = parts
    .filter((p) => !query || [p.partName, p.compatibleEquipmentId, p.supplier].some((t) => t.toLowerCase().includes(query)))
    .sort((a, b) => Number(b.lowStock) - Number(a.lowStock) || a.partName.localeCompare(b.partName));

  return (
    <EquipmentShell back={{ href: "/equipment", label: "Equipment" }} title="Parts & stock">
      {adding ? (
        <AddPartForm
          onAdded={async () => {
            setAdding(false);
            await loadParts();
          }}
          onCancel={() => setAdding(false)}
        />
      ) : (
        <BigButton icon="➕" label="Add a part" tone="green" onClick={() => setAdding(true)} className="w-full" />
      )}

      <input
        type="search"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="🔍 Search parts"
        aria-label="Search parts"
        className="min-h-[64px] w-full rounded-2xl border-2 border-gray-300 bg-white px-5 text-xl outline-none focus:border-blue-600"
      />

      <ErrorNote message={loadError} />

      {loading ? (
        <p className="p-8 text-center text-xl text-gray-600">Loading…</p>
      ) : shown.length === 0 ? (
        <p className="rounded-2xl bg-white p-8 text-center text-xl text-gray-600 shadow-sm">{query ? "Nothing matches that search." : "No parts yet."}</p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {shown.map((part) => (
            <PartCard key={part.id} part={part} onChanged={loadParts} />
          ))}
        </div>
      )}
    </EquipmentShell>
  );
}

