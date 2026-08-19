"use client";

import { useState } from "react";
import type { EquipmentItem, EquipmentRepair } from "./types";

type Props =
  | { mode: "create"; equipment: EquipmentItem; repair?: undefined; onClose: () => void; onDone: () => void }
  | { mode: "complete"; equipment: EquipmentItem; repair: EquipmentRepair; onClose: () => void; onDone: () => void };

// Handles both repair-record triggers described in the Equipment module's
// repair-tracking scope: manually sending Available equipment to repair
// (mode="create", POST .../repairs) and closing out an Open repair
// (mode="complete", PATCH .../repairs/[repairId]). The damage-on-return
// trigger doesn't use this component — it creates its repair record
// server-side from the return endpoint instead (see CheckoutReturnModal).
export default function RepairModal({ mode, equipment, repair, onClose, onDone }: Props) {
  const [description, setDescription] = useState("");
  const [cost, setCost] = useState(mode === "complete" && repair.cost ? String(repair.cost) : "");
  const [performedBy, setPerformedBy] = useState(mode === "complete" ? repair.performedBy : "");
  const [partsUsed, setPartsUsed] = useState(mode === "complete" ? repair.partsUsed : "");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit() {
    setError("");

    if (mode === "create" && !description.trim()) {
      setError("Description is required.");
      return;
    }

    setSubmitting(true);
    try {
      if (mode === "create") {
        const response = await fetch(`/api/equipment/${equipment.id}/repairs`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            description: description.trim(),
            cost: cost.trim() ? Number(cost) : undefined,
            performedBy: performedBy.trim() || undefined,
            partsUsed: partsUsed.trim() || undefined,
          }),
        });
        const data = (await response.json()) as { success?: boolean; error?: string };
        if (!data.success) {
          setError(data.error || "Failed to create repair record.");
          return;
        }
      } else {
        const response = await fetch(`/api/equipment/${equipment.id}/repairs/${repair.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            cost: cost.trim() ? Number(cost) : undefined,
            performedBy: performedBy.trim() || undefined,
            partsUsed: partsUsed.trim() || undefined,
          }),
        });
        const data = (await response.json()) as { success?: boolean; error?: string };
        if (!data.success) {
          setError(data.error || "Failed to complete repair.");
          return;
        }
      }

      onDone();
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-lg rounded-xl bg-white p-6 shadow-xl">
        <h2 className="text-xl font-bold text-gray-900">
          {mode === "create" ? "Send to Repair" : "Mark Repair Completed"}
        </h2>
        <p className="mt-1 text-sm text-gray-600">{equipment.name}</p>

        {error ? (
          <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">
            {error}
          </div>
        ) : null}

        <div className="mt-4 grid gap-4">
          {mode === "create" ? (
            <div>
              <label className="text-sm font-semibold text-gray-700">Description</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                placeholder="What's wrong / what needs fixing"
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
              />
            </div>
          ) : (
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm text-gray-700">
              <p className="font-semibold text-gray-900">{repair.description}</p>
              <p className="mt-1 text-xs text-gray-500">
                Opened {repair.startedAt ? new Date(repair.startedAt).toLocaleString() : "—"}
              </p>
            </div>
          )}

          <div>
            <label className="text-sm font-semibold text-gray-700">Repair Cost (optional)</label>
            <input
              type="number"
              value={cost}
              onChange={(e) => setCost(e.target.value)}
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
            />
          </div>

          <div>
            <label className="text-sm font-semibold text-gray-700">Vendor / Performed By (optional)</label>
            <input
              type="text"
              value={performedBy}
              onChange={(e) => setPerformedBy(e.target.value)}
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
            />
          </div>

          <div>
            <label className="text-sm font-semibold text-gray-700">Parts Used (optional)</label>
            <input
              type="text"
              value={partsUsed}
              onChange={(e) => setPartsUsed(e.target.value)}
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
            />
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting}
            className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? "Saving..." : mode === "create" ? "Send to Repair" : "Mark Completed"}
          </button>
        </div>
      </div>
    </div>
  );
}
