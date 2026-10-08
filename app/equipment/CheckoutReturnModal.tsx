"use client";

import { useEffect, useMemo, useState } from "react";
import type { EquipmentItem, Staff } from "./types";
import { getStoredEquipmentStaffId, setStoredEquipmentStaffId } from "./staffIdentity";
import { BigButton, ErrorBox, Field, FilterChips, SelectField, Sheet, SkeletonList, TextAreaField } from "@/app/ui";

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
    <Sheet
      open
      title={mode === "checkout" ? "Check Out Equipment" : "Return Equipment"}
      text={equipment.name}
      onClose={onClose}
      busy={submitting}
      actions={
        <BigButton busy={submitting} busyLabel="Saving…" disabled={loadingOptions} onClick={() => void handleSubmit()}>
          {mode === "checkout" ? "Check Out" : "Return"}
        </BigButton>
      }
    >
      {loadingOptions ? (
        <SkeletonList rows={2} />
      ) : (
        <>
          {mode === "checkout" ? (
            <>
              <div>
                <p className="ui-label">Holder Type</p>
                <FilterChips
                  label="Holder type"
                  options={[
                    { value: "InsideStaff", label: "Staff" },
                    { value: "Sub", label: "Subcontractor" },
                  ]}
                  value={holderType}
                  onChange={(type) => {
                    setHolderType(type);
                    setHolderId("");
                  }}
                />
              </div>

              <SelectField label={holderType === "InsideStaff" ? "Staff member" : "Subcontractor"} value={holderId} onChange={(e) => setHolderId(e.target.value)}>
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
              </SelectField>

              <Field label="Account" optional value={accountId} onChange={(e) => setAccountId(e.target.value)} placeholder="Account ID or name" />
              <Field label="Expected Return Date" optional type="date" value={expectedReturnAt} onChange={(e) => setExpectedReturnAt(e.target.value)} />
              <Field
                label="Work Order # (Markate)"
                optional
                value={workOrderNumber}
                onChange={(e) => setWorkOrderNumber(e.target.value)}
                placeholder="e.g. WO-10234"
              />
            </>
          ) : (
            <>
              <TextAreaField
                label="Condition on Return"
                rows={3}
                value={conditionAtReturn}
                onChange={(e) => setConditionAtReturn(e.target.value)}
                placeholder="e.g. Working fine, minor scuffs on housing"
              />

              <label className="ui-check">
                <input type="checkbox" checked={damaged} onChange={(e) => setDamaged(e.target.checked)} />
                <span>Damaged — send to repair</span>
              </label>

              {damaged ? (
                <>
                  <p className="ui-hint">
                    This will set the equipment to In Repair and open a repair record using the condition note above as its description. The
                    details below are optional.
                  </p>
                  <Field label="Estimated Repair Cost" optional type="number" value={repairCost} onChange={(e) => setRepairCost(e.target.value)} />
                  <Field label="Vendor / Performed By" optional value={repairPerformedBy} onChange={(e) => setRepairPerformedBy(e.target.value)} />
                  <Field label="Parts Used" optional value={repairPartsUsed} onChange={(e) => setRepairPartsUsed(e.target.value)} />
                </>
              ) : null}
            </>
          )}

          <SelectField
            label={`Signed ${mode === "checkout" ? "out" : "in"} by`}
            hint={signingOptions.length === 0 ? "No Active Manager/Office Staff records found — add one in Settings first." : undefined}
            value={signingStaffId}
            onChange={(e) => handleSigningStaffChange(e.target.value)}
          >
            <option value="">Select...</option>
            {signingOptions.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} ({s.role === "OfficeStaff" ? "Office Staff" : s.role})
              </option>
            ))}
          </SelectField>
        </>
      )}

      {error ? <ErrorBox title="That did not work." text={error} /> : null}
    </Sheet>
  );
}
