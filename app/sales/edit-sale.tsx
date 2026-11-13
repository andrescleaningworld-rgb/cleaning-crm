"use client";

// Sales page → Edit: one sale in a sheet, with the same fields as Add sale
// (date, service, type, sold by, amount, One-time 10% / Recurring 4% with its
// dates, status, work order #, notes). The account stays as it is. A sale made
// by an extra job is not edited here: the job's change form rewrites it.
// Saves with PATCH /api/sales; the commission amount is worked out again there.

import { useState } from "react";
import { BigButton, ErrorBox, Field, SelectField, Sheet, TextAreaField, showToast } from "@/app/ui";
import { COMMISSION_CHOICES, ONE_TIME_PERCENT, RECURRING_PERCENT, getCommissionType, validateRecurringDates } from "@/lib/salesCommission";
import { SALE_STATUSES, SELLERS, SERVICE_TYPES, withCurrent } from "./sale-options";

export type EditableSale = {
  id: string;
  sheetRow: number;
  accountName: string;
  saleDateRaw: string;
  serviceSold: string;
  serviceType: string;
  soldBy: string;
  amount: number;
  commissionPercent: number;
  status: string;
  workOrderEstimateNumber: string;
  notes: string;
  recurringStartDate: string;
  recurringEndDate: string;
};

/** The page shows "N/A" for an empty field; the form starts empty instead. */
const blank = (value: string) => (value === "N/A" ? "" : value);

/** A date box needs YYYY-MM-DD; an old sale may have "8/19/2026". */
function dayValue(value: string): string {
  const text = value.trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(text)) return text.slice(0, 10);
  const date = new Date(text);
  if (!text || Number.isNaN(date.getTime())) return "";
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export default function EditSaleSheet({ sale, onClose, onSaved }: { sale: EditableSale | null; onClose: () => void; onSaved: () => void }) {
  return (
    <Sheet open={sale !== null} title="Edit sale" text={sale?.accountName} onClose={onClose}>
      {/* Keyed by the sale: each one opens with its own values. */}
      {sale ? <EditSaleForm key={`${sale.id}-${sale.sheetRow}`} sale={sale} onClose={onClose} onSaved={onSaved} /> : null}
    </Sheet>
  );
}

function EditSaleForm({ sale, onClose, onSaved }: { sale: EditableSale; onClose: () => void; onSaved: () => void }) {
  const oldType = getCommissionType(sale.commissionPercent);
  const [saleDate, setSaleDate] = useState(dayValue(sale.saleDateRaw));
  const [serviceSold, setServiceSold] = useState(blank(sale.serviceSold));
  const [serviceType, setServiceType] = useState(blank(sale.serviceType) || "Extra Service");
  const [soldBy, setSoldBy] = useState(blank(sale.soldBy));
  const [amount, setAmount] = useState(String(sale.amount || ""));
  // An old sale at another % starts on One-time; the note below says so.
  const [commissionType, setCommissionType] = useState<"OneTime" | "Recurring">(oldType === "Recurring" ? "Recurring" : "OneTime");
  const [recurringStartDate, setRecurringStartDate] = useState(dayValue(sale.recurringStartDate));
  const [recurringEndDate, setRecurringEndDate] = useState(dayValue(sale.recurringEndDate));
  const [status, setStatus] = useState(sale.status || "Pending");
  const [workOrder, setWorkOrder] = useState(blank(sale.workOrderEstimateNumber));
  const [notes, setNotes] = useState(blank(sale.notes));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const percent = commissionType === "Recurring" ? RECURRING_PERCENT : ONE_TIME_PERCENT;
  const amountNumber = amount.trim() === "" ? Number.NaN : Number(amount);
  const commission = Number.isFinite(amountNumber) ? amountNumber * (percent / 100) : 0;

  async function save() {
    if (!saleDate || !serviceSold.trim() || !soldBy || !Number.isFinite(amountNumber)) {
      setError("Fill the date, what was sold, who sold it and the amount.");
      return;
    }
    const datesProblem = validateRecurringDates(percent, recurringStartDate, recurringEndDate);
    if (datesProblem) {
      setError(datesProblem);
      return;
    }
    setError("");
    setSaving(true);
    try {
      const response = await fetch("/api/sales", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({
          id: sale.id,
          sheetRow: sale.sheetRow,
          saleDate,
          serviceSold: serviceSold.trim(),
          serviceType,
          soldBy,
          amountSold: amountNumber,
          commissionPercent: percent,
          status,
          workOrderEstimateNumber: workOrder.trim(),
          notes: notes.trim(),
          recurringStartDate: commissionType === "Recurring" ? recurringStartDate : "",
          recurringEndDate: commissionType === "Recurring" ? recurringEndDate : "",
        }),
      });
      const body = (await response.json().catch(() => ({}))) as { success?: boolean; error?: string };
      if (!response.ok || body.success !== true) throw new Error(body.error || "That did not save. Try again.");
      showToast("Sale saved ✓");
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "That did not save. Try again.");
      setSaving(false);
    }
  }

  return (
    <div className="ui-stack">
      <div className="grid gap-3 md:grid-cols-2">
        <Field label="Sale date" type="date" value={saleDate} disabled={saving} onChange={(event) => setSaleDate(event.target.value)} />
        <Field label="Amount ($)" type="number" inputMode="decimal" min={0} step="0.01" value={amount} disabled={saving} onChange={(event) => setAmount(event.target.value)} />
      </div>
      <Field label="Service sold" value={serviceSold} maxLength={300} disabled={saving} onChange={(event) => setServiceSold(event.target.value)} />
      <div className="grid gap-3 md:grid-cols-2">
        <SelectField label="Service type" value={serviceType} disabled={saving} onChange={(event) => setServiceType(event.target.value)}>
          {withCurrent(SERVICE_TYPES, serviceType).map((type) => (
            <option key={type} value={type}>
              {type}
            </option>
          ))}
        </SelectField>
        <SelectField label="Sold by" value={soldBy} disabled={saving} onChange={(event) => setSoldBy(event.target.value)}>
          <option value="">Select person</option>
          {withCurrent(SELLERS, sale.soldBy).map((person) => (
            <option key={person} value={person}>
              {person}
            </option>
          ))}
        </SelectField>
      </div>

      <div className="ui-field" role="radiogroup" aria-label="Commission">
        <span className="ui-label">Commission</span>
        <div className="flex flex-wrap gap-2">
          {COMMISSION_CHOICES.map((choice) => (
            <button
              key={choice.type}
              type="button"
              role="radio"
              aria-checked={commissionType === choice.type}
              disabled={saving}
              onClick={() => setCommissionType(choice.type)}
              className={`ui-btn ${commissionType === choice.type ? "ui-btn-main" : "ui-btn-second"}`}
            >
              {choice.label}
            </button>
          ))}
        </div>
        <span className="ui-hint">
          Commission: {commission.toLocaleString("en-US", { style: "currency", currency: "USD" })}
          {commissionType === "Recurring" ? " a month" : ""}
        </span>
        {oldType === "Other" ? (
          <p className="ui-field-error">
            This sale was saved at {sale.commissionPercent}%. Saving makes it {commissionType === "Recurring" ? "Recurring 4%" : "One-time 10%"}.
          </p>
        ) : null}
      </div>

      {commissionType === "Recurring" ? (
        <div className="grid gap-3 md:grid-cols-2">
          <Field label="Recurring start date" type="date" value={recurringStartDate} disabled={saving} onChange={(event) => setRecurringStartDate(event.target.value)} />
          <Field
            label="Recurring end date (optional – leave blank if ongoing)"
            type="date"
            value={recurringEndDate}
            disabled={saving}
            onChange={(event) => setRecurringEndDate(event.target.value)}
          />
        </div>
      ) : null}

      <div className="grid gap-3 md:grid-cols-2">
        <SelectField label="Status" value={status} disabled={saving} onChange={(event) => setStatus(event.target.value)}>
          {withCurrent(SALE_STATUSES, status).map((choice) => (
            <option key={choice} value={choice}>
              {choice}
            </option>
          ))}
        </SelectField>
        <Field label="Work order / estimate #" optional value={workOrder} maxLength={60} disabled={saving} onChange={(event) => setWorkOrder(event.target.value)} />
      </div>
      <TextAreaField label="Notes" optional rows={3} value={notes} maxLength={2000} disabled={saving} onChange={(event) => setNotes(event.target.value)} />

      {error ? <ErrorBox title="Not saved" text={error} /> : null}
      {/* The sheet adds its own Close button under this. */}
      <BigButton busy={saving} busyLabel="Saving…" onClick={() => void save()}>
        Save changes
      </BigButton>
    </div>
  );
}
