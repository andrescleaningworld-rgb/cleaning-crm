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
    <main className="ui-screen">
      <div className="ui-screen-body">
        <div className="mb-6">
          <h1 className="ui-screen-title">My Equipment</h1>
          <p className="ui-muted">Equipment currently checked out to you.</p>
        </div>

        {loadError ? (
          <div className="ui-field-error">{loadError}</div>
        ) : null}

        {loading ? (
          <div className="p-6 text-center text-gray-600">Loading...</div>
        ) : equipment.length === 0 ? (
          <div className="ui-card">
            No equipment is currently checked out to you.
          </div>
        ) : (
          <div className="grid gap-4">
            {equipment.map((item) => (
              <div key={item.id} className="ui-card">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="ui-strong">{item.name}</p>
                    {item.serialNumber ? <p className="ui-muted">SN: {item.serialNumber}</p> : null}
                    {item.expectedReturnAt ? (
                      <p className={`mt-1 text-base font-semibold ${item.overdue ? "text-red-700" : "text-gray-600"}`}>
                        {item.overdue ? "Overdue — " : "Expected return: "}
                        {item.expectedReturnAt}
                      </p>
                    ) : null}
                  </div>
                  <button
                    type="button"
                    onClick={() => setReturningItem(item)}
                    className="ui-btn ui-btn-second"
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
