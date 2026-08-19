"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import CheckoutReturnModal from "../CheckoutReturnModal";
import RepairModal from "../RepairModal";
import {
  STATUS_LABELS,
  statusBadgeClass,
  type EquipmentCategory,
  type EquipmentCheckout,
  type EquipmentItem,
  type EquipmentRepair,
} from "../types";

// The only page that reads EquipmentCheckouts/EquipmentRepairs — see
// app/equipment/page.tsx's guardrail comment.
export default function EquipmentDetailPage() {
  const params = useParams<{ id: string }>();
  const equipmentId = params.id;

  const [equipment, setEquipment] = useState<EquipmentItem | null>(null);
  const [categories, setCategories] = useState<EquipmentCategory[]>([]);
  const [history, setHistory] = useState<EquipmentCheckout[]>([]);
  const [repairs, setRepairs] = useState<EquipmentRepair[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [modalMode, setModalMode] = useState<"checkout" | "return" | null>(null);
  const [repairModal, setRepairModal] = useState<{ mode: "create" } | { mode: "complete"; repair: EquipmentRepair } | null>(null);

  async function loadAll() {
    setLoadError("");
    try {
      const [equipmentRes, categoriesRes, historyRes, repairsRes] = await Promise.all([
        fetch(`/api/equipment/${equipmentId}`, { cache: "no-store" }),
        fetch("/api/equipment-categories", { cache: "no-store" }),
        fetch(`/api/equipment/${equipmentId}/checkouts`, { cache: "no-store" }),
        fetch(`/api/equipment/${equipmentId}/repairs`, { cache: "no-store" }),
      ]);

      const equipmentData = (await equipmentRes.json()) as { success?: boolean; equipment?: EquipmentItem; error?: string };
      if (!equipmentData.success || !equipmentData.equipment) {
        setLoadError(equipmentData.error || "Equipment not found.");
        return;
      }
      setEquipment(equipmentData.equipment);

      const categoriesData = (await categoriesRes.json()) as { success?: boolean; categories?: EquipmentCategory[] };
      if (categoriesData.success && Array.isArray(categoriesData.categories)) setCategories(categoriesData.categories);

      const historyData = (await historyRes.json()) as { success?: boolean; checkouts?: EquipmentCheckout[] };
      if (historyData.success && Array.isArray(historyData.checkouts)) setHistory(historyData.checkouts);

      const repairsData = (await repairsRes.json()) as { success?: boolean; repairs?: EquipmentRepair[] };
      if (repairsData.success && Array.isArray(repairsData.repairs)) setRepairs(repairsData.repairs);
    } catch {
      setLoadError("Network error loading equipment.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (equipmentId) loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [equipmentId]);

  const categoryName = useMemo(() => {
    if (!equipment) return "";
    return categories.find((c) => c.id === equipment.categoryId)?.name || "Uncategorized";
  }, [categories, equipment]);

  if (loading) {
    return <main className="min-h-screen bg-gray-50 p-6 text-center text-gray-600">Loading...</main>;
  }

  if (loadError || !equipment) {
    return (
      <main className="min-h-screen bg-gray-50 p-6">
        <div className="mx-auto max-w-3xl">
          <Link href="/equipment" className="text-sm font-semibold text-blue-700 hover:underline">← Back to Equipment</Link>
          <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">
            {loadError || "Equipment not found."}
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gray-50 p-6">
      <div className="mx-auto max-w-4xl">
        <Link href="/equipment" className="text-sm font-semibold text-blue-700 hover:underline">← Back to Equipment</Link>

        <div className="mt-3 mb-6 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">{equipment.name}</h1>
            <p className="mt-1 text-gray-600">{categoryName}{equipment.serialNumber ? ` · SN: ${equipment.serialNumber}` : ""}</p>
          </div>
          <span className={`rounded-full border px-3 py-1.5 text-sm font-semibold ${statusBadgeClass(equipment.status, equipment.overdue)}`}>
            {equipment.overdue ? "Overdue" : STATUS_LABELS[equipment.status]}
          </span>
        </div>

        <section className="mb-6 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <p className="text-xs font-semibold text-gray-500">Current Holder</p>
              <p className="mt-1 font-semibold text-gray-900">{equipment.currentHolderName || "—"}</p>
            </div>
            <div>
              <p className="text-xs font-semibold text-gray-500">Expected Return</p>
              <p className="mt-1 font-semibold text-gray-900">{equipment.expectedReturnAt || "—"}</p>
            </div>
            <div>
              <p className="text-xs font-semibold text-gray-500">Purchase Date / Cost</p>
              <p className="mt-1 font-semibold text-gray-900">
                {equipment.purchaseDate || "—"}{equipment.purchaseCost ? ` · $${equipment.purchaseCost.toLocaleString()}` : ""}
              </p>
            </div>
            <div>
              <p className="text-xs font-semibold text-gray-500">Condition Notes</p>
              <p className="mt-1 font-semibold text-gray-900">{equipment.conditionNotes || "—"}</p>
            </div>
          </div>

          {equipment.needsMaintenanceReview ? (
            <div className="mt-4 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm font-semibold text-amber-800">
              Flagged for maintenance review from the last return.
            </div>
          ) : null}

          <div className="mt-5 flex flex-wrap gap-2">
            {equipment.status === "Available" ? (
              <>
                <button
                  type="button"
                  onClick={() => setModalMode("checkout")}
                  className="rounded-lg bg-blue-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-800"
                >
                  Check Out
                </button>
                <button
                  type="button"
                  onClick={() => setRepairModal({ mode: "create" })}
                  className="rounded-lg border border-amber-300 bg-amber-50 px-5 py-2.5 text-sm font-semibold text-amber-800 hover:bg-amber-100"
                >
                  Send to Repair
                </button>
              </>
            ) : equipment.status === "CheckedOut" ? (
              <button
                type="button"
                onClick={() => setModalMode("return")}
                className="rounded-lg bg-blue-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-800"
              >
                Return
              </button>
            ) : null}
          </div>
        </section>

        <section className="mb-6 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <h2 className="mb-4 text-xl font-bold text-gray-900">Repair History</h2>

          {repairs.length === 0 ? (
            <div className="p-6 text-center text-gray-600">No repairs on file.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b bg-gray-50 text-gray-600">
                    <th className="px-4 py-3 font-semibold">Description</th>
                    <th className="px-4 py-3 font-semibold">Started</th>
                    <th className="px-4 py-3 font-semibold">Completed</th>
                    <th className="px-4 py-3 font-semibold">Vendor / Performed By</th>
                    <th className="px-4 py-3 font-semibold">Cost</th>
                    <th className="px-4 py-3 font-semibold">Status</th>
                    <th className="px-4 py-3 font-semibold">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {repairs.map((r) => (
                    <tr key={r.id} className="border-b">
                      <td className="px-4 py-3 font-semibold text-gray-900">{r.description}</td>
                      <td className="px-4 py-3 text-gray-700">{r.startedAt ? new Date(r.startedAt).toLocaleString() : "—"}</td>
                      <td className="px-4 py-3 text-gray-700">{r.completedAt ? new Date(r.completedAt).toLocaleString() : "—"}</td>
                      <td className="px-4 py-3 text-gray-700">{r.performedBy || "—"}</td>
                      <td className="px-4 py-3 text-gray-700">{r.cost ? `$${r.cost.toLocaleString()}` : "—"}</td>
                      <td className="px-4 py-3">
                        <span
                          className={`rounded-full border px-2 py-1 text-xs font-semibold ${
                            r.status === "Open"
                              ? "border-amber-200 bg-amber-100 text-amber-800"
                              : "border-green-200 bg-green-100 text-green-800"
                          }`}
                        >
                          {r.status}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {r.status === "Open" ? (
                          <button
                            type="button"
                            onClick={() => setRepairModal({ mode: "complete", repair: r })}
                            className="font-semibold text-blue-700 hover:underline"
                          >
                            Mark Completed
                          </button>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <h2 className="mb-4 text-xl font-bold text-gray-900">Checkout History</h2>

          {history.length === 0 ? (
            <div className="p-6 text-center text-gray-600">No checkout history yet.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b bg-gray-50 text-gray-600">
                    <th className="px-4 py-3 font-semibold">Holder</th>
                    <th className="px-4 py-3 font-semibold">Account</th>
                    <th className="px-4 py-3 font-semibold">Work Order #</th>
                    <th className="px-4 py-3 font-semibold">Checked Out</th>
                    <th className="px-4 py-3 font-semibold">Returned</th>
                    <th className="px-4 py-3 font-semibold">Signed Out By</th>
                    <th className="px-4 py-3 font-semibold">Signed In By</th>
                    <th className="px-4 py-3 font-semibold">Condition (Return)</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((c) => (
                    <tr key={c.id} className="border-b">
                      <td className="px-4 py-3 font-semibold text-gray-900">{c.holderName}</td>
                      <td className="px-4 py-3 text-gray-700">{c.accountId || "—"}</td>
                      <td className="px-4 py-3 text-gray-700">{c.workOrderNumber || "—"}</td>
                      <td className="px-4 py-3 text-gray-700">{c.checkedOutAt ? new Date(c.checkedOutAt).toLocaleString() : "—"}</td>
                      <td className="px-4 py-3 text-gray-700">{c.returnedAt ? new Date(c.returnedAt).toLocaleString() : "Not returned"}</td>
                      <td className="px-4 py-3 text-gray-700">{c.signedOutByStaffName || "—"}</td>
                      <td className="px-4 py-3 text-gray-700">{c.signedInByStaffName || "—"}</td>
                      <td className="px-4 py-3 text-gray-700">{c.conditionAtReturn || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>

      {modalMode ? (
        <CheckoutReturnModal
          mode={modalMode}
          equipment={equipment}
          onClose={() => setModalMode(null)}
          onDone={() => {
            setModalMode(null);
            loadAll();
          }}
        />
      ) : null}

      {repairModal?.mode === "create" ? (
        <RepairModal
          mode="create"
          equipment={equipment}
          onClose={() => setRepairModal(null)}
          onDone={() => {
            setRepairModal(null);
            loadAll();
          }}
        />
      ) : repairModal?.mode === "complete" ? (
        <RepairModal
          mode="complete"
          equipment={equipment}
          repair={repairModal.repair}
          onClose={() => setRepairModal(null)}
          onDone={() => {
            setRepairModal(null);
            loadAll();
          }}
        />
      ) : null}
    </main>
  );
}
