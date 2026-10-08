"use client";

import { useState } from "react";
import type { EquipmentItem, EquipmentRepair } from "./types";
import { BigButton, ErrorBox, Field, Sheet, TextAreaField } from "@/app/ui";

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
    <Sheet
      open
      title={mode === "create" ? "Send to Repair" : "Mark Repair Completed"}
      text={equipment.name}
      onClose={onClose}
      busy={submitting}
      actions={
        <BigButton busy={submitting} busyLabel="Saving…" onClick={() => void handleSubmit()}>
          {mode === "create" ? "Send to Repair" : "Mark Completed"}
        </BigButton>
      }
    >
      {mode === "create" ? (
        <TextAreaField
          label="Description"
          rows={3}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="What's wrong / what needs fixing"
        />
      ) : (
        <div className="ui-stat">
          <p className="ui-strong">{repair.description}</p>
          <p className="ui-muted">Opened {repair.startedAt ? new Date(repair.startedAt).toLocaleString() : "date not known"}</p>
        </div>
      )}

      <Field label="Repair Cost" optional type="number" value={cost} onChange={(e) => setCost(e.target.value)} />
      <Field label="Vendor / Performed By" optional value={performedBy} onChange={(e) => setPerformedBy(e.target.value)} />
      <Field label="Parts Used" optional value={partsUsed} onChange={(e) => setPartsUsed(e.target.value)} />

      {error ? <ErrorBox title="That did not work." text={error} /> : null}
    </Sheet>
  );
}
