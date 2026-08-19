"use client";

import { useEffect, useMemo, useState } from "react";
import type { EquipmentItem, Staff } from "./types";
import { getStoredEquipmentStaffId, setStoredEquipmentStaffId } from "./staffIdentity";

// Raw shape returned by GET /api/subcontractors — the same source used by
// the Subcontractor dropdown in app/accounts/new/page.tsx and
// app/documents/page.tsx. Field names are already normalized by
// getAllSubcontractorsRaw in lib/googleSheets.ts, so no alias-guessing is
// needed here.
type RawSubcontractor = {
  id: string;
  companyName?: string;
  contactName?: string;
  email?: string;
};

type SubcontractorOption = {
  id: string;
  label: string;
};

// Matches app/documents/page.tsx's subcontractorLabel priority exactly, so
// the same person shows the same way in every subcontractor picker.
function subcontractorLabel(sub: RawSubcontractor): string {
  return sub.contactName?.trim() || sub.companyName?.trim() || sub.email?.trim() || "Unnamed subcontractor";
}

type Props = {
  mode: "checkout" | "return";
  equipment: EquipmentItem;
  onClose: () => void;
  onDone: () => void;
};

// Shared by app/equipment/page.tsx (imported directly) and
// app/subcontractor-portal/equipment/page.tsx (imported via next/dynamic,
// per this module's bundle-size guardrail — see that page for the dynamic()
// call). Signing staff is restricted server-side to Active Manager/
// OfficeStaff records; this dropdown just shows the full active-staff list
// and lets the API reject an invalid pick.
export default function CheckoutReturnModal({ mode, equipment, onClose, onDone }: Props) {
  const [staff, setStaff] = useState<Staff[]>([]);
  const [subs, setSubs] = useState<SubcontractorOption[]>([]);
  const [loadingOptions, setLoadingOptions] = useState(true);

  const [holderType, setHolderType] = useState<"InsideStaff" | "Sub">("InsideStaff");
  const [holderId, setHolderId] = useState("");
  const [accountId, setAccountId] = useState("");
  const [expectedReturnAt, setExpectedReturnAt] = useState("");
  const [workOrderNumber, setWorkOrderNumber] = useState("");

  const [conditionAtReturn, setConditionAtReturn] = useState("");
  const [damaged, setDamaged] = useState(false);
  const [repairCost, setRepairCost] = useState("");
  const [repairPerformedBy, setRepairPerformedBy] = useState("");
  const [repairPartsUsed, setRepairPartsUsed] = useState("");

  const [signingStaffId, setSigningStaffId] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoadingOptions(true);
      try {
        const requests: Promise<Response>[] = [fetch("/api/staff", { cache: "no-store" })];
        if (mode === "checkout") requests.push(fetch("/api/subcontractors", { cache: "no-store" }));
        const responses = await Promise.all(requests);

        const staffData = (await responses[0].json()) as { success?: boolean; staff?: Staff[] };
        if (!cancelled && staffData.success && Array.isArray(staffData.staff)) {
          setStaff(staffData.staff.filter((s) => s.active));
        }

        if (mode === "checkout" && responses[1]) {
          const subsData = (await responses[1].json()) as {
            success?: boolean;
            subcontractors?: RawSubcontractor[];
          };
          if (!cancelled && subsData.success && Array.isArray(subsData.subcontractors)) {
            const options = subsData.subcontractors
              .map((sub) => ({ id: sub.id, label: subcontractorLabel(sub) }))
              .sort((a, b) => a.label.localeCompare(b.label));
            setSubs(options);
          }
        }

        if (!cancelled) {
          const stored = getStoredEquipmentStaffId();
          if (stored) setSigningStaffId(stored);
        }
      } catch {
        if (!cancelled) setError("Failed to load staff/subcontractor options.");
      } finally {
        if (!cancelled) setLoadingOptions(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [mode]);

  const signingOptions = useMemo(
    () => staff.filter((s) => s.role === "Manager" || s.role === "OfficeStaff"),
    [staff]
  );

  const insideStaffOptions = useMemo(() => staff, [staff]);

  function handleSigningStaffChange(id: string) {
    setSigningStaffId(id);
    setStoredEquipmentStaffId(id);
  }

  async function handleSubmit() {
    setError("");

    if (!signingStaffId) {
      setError(mode === "checkout" ? "Select who is signing this out." : "Select who is signing this in.");
      return;
    }

    if (mode === "checkout" && !holderId) {
      setError("Select who is receiving this equipment.");
      return;
    }

    if (mode === "return" && !conditionAtReturn.trim()) {
      setError("Describe the equipment's condition on return.");
      return;
    }

    setSubmitting(true);
    try {
      if (mode === "checkout") {
        const response = await fetch(`/api/equipment/${equipment.id}/checkout`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            holderType,
            holderId,
            signedOutByStaffId: signingStaffId,
            accountId: accountId.trim() || undefined,
            expectedReturnAt: expectedReturnAt || undefined,
            workOrderNumber: workOrderNumber.trim() || undefined,
          }),
        });
        const data = (await response.json()) as { success?: boolean; error?: string };
        if (!data.success) {
          setError(data.error || "Failed to check out equipment.");
          return;
        }
      } else {
        const response = await fetch(`/api/equipment/${equipment.id}/return`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            conditionAtReturn: conditionAtReturn.trim(),
            signedInByStaffId: signingStaffId,
            damaged,
            repairCost: damaged && repairCost.trim() ? Number(repairCost) : undefined,
            repairPerformedBy: damaged ? repairPerformedBy.trim() || undefined : undefined,
            repairPartsUsed: damaged ? repairPartsUsed.trim() || undefined : undefined,
          }),
        });
        const data = (await response.json()) as { success?: boolean; error?: string };
        if (!data.success) {
          setError(data.error || "Failed to return equipment.");
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
          {mode === "checkout" ? "Check Out Equipment" : "Return Equipment"}
        </h2>
        <p className="mt-1 text-sm text-gray-600">{equipment.name}</p>

        {error ? (
          <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">
            {error}
          </div>
        ) : null}

        {loadingOptions ? (
          <div className="mt-4 text-center text-sm text-gray-600">Loading...</div>
        ) : (
          <div className="mt-4 grid gap-4">
            {mode === "checkout" ? (
              <>
                <div>
                  <label className="text-sm font-semibold text-gray-700">Holder Type</label>
                  <div className="mt-1 flex gap-2">
                    {(["InsideStaff", "Sub"] as const).map((type) => (
                      <button
                        key={type}
                        type="button"
                        onClick={() => {
                          setHolderType(type);
                          setHolderId("");
                        }}
                        className={`rounded-lg border px-3 py-2 text-sm font-semibold ${
                          holderType === type
                            ? "border-blue-600 bg-blue-50 text-blue-800"
                            : "border-gray-300 text-gray-700 hover:bg-gray-50"
                        }`}
                      >
                        {type === "InsideStaff" ? "Staff" : "Subcontractor"}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="text-sm font-semibold text-gray-700">
                    {holderType === "InsideStaff" ? "Staff member" : "Subcontractor"}
                  </label>
                  <select
                    value={holderId}
                    onChange={(e) => setHolderId(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
                  >
                    <option value="">Select...</option>
                    {holderType === "InsideStaff"
                      ? insideStaffOptions.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name} ({s.role})
                          </option>
                        ))
                      : subs.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.label}
                          </option>
                        ))}
                  </select>
                </div>

                <div>
                  <label className="text-sm font-semibold text-gray-700">Account (optional)</label>
                  <input
                    type="text"
                    value={accountId}
                    onChange={(e) => setAccountId(e.target.value)}
                    placeholder="Account ID or name"
                    className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
                  />
                </div>

                <div>
                  <label className="text-sm font-semibold text-gray-700">Expected Return Date (optional)</label>
                  <input
                    type="date"
                    value={expectedReturnAt}
                    onChange={(e) => setExpectedReturnAt(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
                  />
                </div>

                <div>
                  <label className="text-sm font-semibold text-gray-700">Work Order # (Markate) (optional)</label>
                  <input
                    type="text"
                    value={workOrderNumber}
                    onChange={(e) => setWorkOrderNumber(e.target.value)}
                    placeholder="e.g. WO-10234"
                    className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
                  />
                </div>
              </>
            ) : (
              <>
                <div>
                  <label className="text-sm font-semibold text-gray-700">Condition on Return</label>
                  <textarea
                    value={conditionAtReturn}
                    onChange={(e) => setConditionAtReturn(e.target.value)}
                    rows={3}
                    placeholder="e.g. Working fine, minor scuffs on housing"
                    className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
                  />
                </div>

                <label className="flex items-center gap-2 text-sm font-semibold text-gray-700">
                  <input
                    type="checkbox"
                    checked={damaged}
                    onChange={(e) => setDamaged(e.target.checked)}
                    className="h-4 w-4"
                  />
                  Damaged — send to repair
                </label>

                {damaged ? (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
                    <p className="text-xs font-semibold text-amber-800">
                      This will set the equipment to In Repair and open a repair record using the
                      condition note above as its description. The details below are optional.
                    </p>
                    <div className="mt-3 grid gap-3">
                      <div>
                        <label className="text-xs font-semibold text-gray-700">Estimated Repair Cost</label>
                        <input
                          type="number"
                          value={repairCost}
                          onChange={(e) => setRepairCost(e.target.value)}
                          className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
                        />
                      </div>
                      <div>
                        <label className="text-xs font-semibold text-gray-700">Vendor / Performed By</label>
                        <input
                          type="text"
                          value={repairPerformedBy}
                          onChange={(e) => setRepairPerformedBy(e.target.value)}
                          className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
                        />
                      </div>
                      <div>
                        <label className="text-xs font-semibold text-gray-700">Parts Used</label>
                        <input
                          type="text"
                          value={repairPartsUsed}
                          onChange={(e) => setRepairPartsUsed(e.target.value)}
                          className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
                        />
                      </div>
                    </div>
                  </div>
                ) : null}
              </>
            )}

            <div>
              <label className="text-sm font-semibold text-gray-700">
                Signed {mode === "checkout" ? "out" : "in"} by
              </label>
              <select
                value={signingStaffId}
                onChange={(e) => handleSigningStaffChange(e.target.value)}
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
              >
                <option value="">Select...</option>
                {signingOptions.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.role === "OfficeStaff" ? "Office Staff" : s.role})
                  </option>
                ))}
              </select>
              {signingOptions.length === 0 ? (
                <p className="mt-1 text-xs text-amber-700">
                  No Active Manager/Office Staff records found — add one in Settings first.
                </p>
              ) : null}
            </div>
          </div>
        )}

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
            disabled={submitting || loadingOptions}
            className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? "Saving..." : mode === "checkout" ? "Check Out" : "Return"}
          </button>
        </div>
      </div>
    </div>
  );
}
