"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import type { EquipmentItem } from "@/app/equipment/types";

// Dynamically imported so the checkout/return modal's code (and its
// staff/subcontractor fetches) never bloats the subcontractor-portal bundle
// for subs who never open it.
const CheckoutReturnModal = dynamic(() => import("@/app/equipment/CheckoutReturnModal"), { ssr: false });

export default function MyEquipmentPage() {
  const [equipment, setEquipment] = useState<EquipmentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [returningItem, setReturningItem] = useState<EquipmentItem | null>(null);

  async function loadEquipment() {
    setLoadError("");
    try {
      const response = await fetch("/api/subcontractor-portal/equipment", { cache: "no-store" });
      const data = (await response.json()) as { success?: boolean; equipment?: EquipmentItem[]; error?: string };
      if (!data.success || !Array.isArray(data.equipment)) {
        setLoadError(data.error || "Failed to load your equipment.");
        return;
      }
      setEquipment(data.equipment);
    } catch {
      setLoadError("Network error loading your equipment.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadEquipment();
  }, []);

  return (
    <main className="min-h-screen bg-gray-50 p-6">
      <div className="mx-auto max-w-3xl">
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-gray-900">My Equipment</h1>
          <p className="mt-1 text-gray-600">Equipment currently checked out to you.</p>
        </div>

        {loadError ? (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">{loadError}</div>
        ) : null}

        {loading ? (
          <div className="p-6 text-center text-gray-600">Loading...</div>
        ) : equipment.length === 0 ? (
          <div className="rounded-xl border border-gray-200 bg-white p-6 text-center text-gray-600 shadow-sm">
            No equipment is currently checked out to you.
          </div>
        ) : (
          <div className="grid gap-4">
            {equipment.map((item) => (
              <div key={item.id} className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="font-bold text-gray-900">{item.name}</p>
                    {item.serialNumber ? <p className="text-sm text-gray-500">SN: {item.serialNumber}</p> : null}
                    {item.expectedReturnAt ? (
                      <p className={`mt-1 text-sm font-semibold ${item.overdue ? "text-red-700" : "text-gray-600"}`}>
                        {item.overdue ? "Overdue — " : "Expected return: "}
                        {item.expectedReturnAt}
                      </p>
                    ) : null}
                  </div>
                  <button
                    type="button"
                    onClick={() => setReturningItem(item)}
                    className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800"
                  >
                    Return
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {returningItem ? (
        <CheckoutReturnModal
          mode="return"
          equipment={returningItem}
          onClose={() => setReturningItem(null)}
          onDone={() => {
            setReturningItem(null);
            loadEquipment();
          }}
        />
      ) : null}
    </main>
  );
}
