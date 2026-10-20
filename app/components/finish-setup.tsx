"use client";

// "Finish setting up" for a new account in the 8-step flow (account page and
// the pin popup on the board): one short screen with only the account fields
// still empty, big fields and one Save. "Setup: 6 of 10 done" says what is
// left. It saves to the same account fields as Edit Account
// (/api/accounts, updateAccountFieldsDirect), so nothing is kept twice.

import { useEffect, useMemo, useState } from "react";
import { BigButton, ErrorBox, Field, Sheet, TextAreaField, showToast } from "@/app/ui";
import FrequencyField from "./frequency-field";
import CleaningTimeField from "./cleaning-time-field";
import SubPayFields from "./sub-pay-fields";
import { afterFrequencyChange, perCleaningText } from "@/lib/frequency";

type AccountRecord = Record<string, unknown>;

const text = (account: AccountRecord | null, ...keys: string[]) => {
  for (const key of keys) {
    const value = String(account?.[key] ?? "").trim();
    if (value) return value;
  }
  return "";
};
const amount = (value: string) => Number(value.replace(/[$,\s]/g, "")) || 0;

/** The fields a new account needs before it can run without Edit Account, in the order they are asked. */
const SETUP_FIELDS = [
  { key: "frequency", label: "Frequency" },
  { key: "cleaningDays", label: "Cleaning days" },
  { key: "cleaningTime", label: "Cleaning time" },
  { key: "startDate", label: "Start date" },
  { key: "subPay", label: "Subcontractor pay (monthly)" },
  { key: "perCleaning", label: "Sub price per cleaning" },
  { key: "scopeOfWork", label: "Scope of work" },
  { key: "access", label: "Key / alarm / access info" },
  { key: "contactName", label: "Contact name" },
  { key: "phone", label: "Contact phone" },
  { key: "email", label: "Contact email" },
] as const;

type SetupKey = (typeof SETUP_FIELDS)[number]["key"];
type Values = Record<SetupKey, string>;

function savedValues(account: AccountRecord | null): Values {
  return {
    frequency: text(account, "frequency"),
    cleaningDays: text(account, "cleaningDays"),
    cleaningTime: text(account, "cleaningTime"),
    startDate: text(account, "accountStartDate", "startDate"),
    subPay: amount(text(account, "monthlySubcontractorPay", "subcontractorPay")) > 0 ? text(account, "monthlySubcontractorPay", "subcontractorPay") : "",
    perCleaning: text(account, "subPricePerCleaning"),
    scopeOfWork: text(account, "scopeOfWork"),
    access: text(account, "keyAlarmAccessInfo"),
    contactName: text(account, "contactName"),
    phone: text(account, "phone"),
    email: text(account, "email"),
  };
}

/** "6 of 11": how many setup fields the account already has. The cleaning time counts once it can be saved (migration 050). */
export function setupCount(account: AccountRecord | null): { done: number; total: number; missing: SetupKey[] } {
  const saved = savedValues(account);
  const keys = SETUP_FIELDS.map((field) => field.key).filter((key) => key !== "cleaningTime" || text(account, "cleaningTimeReady"));
  const missing = keys.filter((key) => !saved[key]);
  return { done: keys.length - missing.length, total: keys.length, missing };
}

async function loadAccount(accountId: string): Promise<AccountRecord | null> {
  const response = await fetch("/api/accounts", { cache: "no-store" });
  const data = (await response.json().catch(() => ({}))) as { accounts?: AccountRecord[]; data?: AccountRecord[] };
  const list = data.accounts || data.data || [];
  return list.find((row) => String(row.accountId ?? row.id ?? "").trim() === accountId) ?? null;
}

/** The button and its screen. Shows "Setup: 6 of 10 done" on the button, and nothing once everything is filled in. */
export default function FinishSetup({ accountId, onSaved }: { accountId: string; onSaved?: () => void }) {
  const [account, setAccount] = useState<AccountRecord | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let live = true;
    void loadAccount(accountId)
      .then((found) => live && setAccount(found))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [accountId]);

  const count = useMemo(() => setupCount(account), [account]);
  if (!account) return null;

  return (
    <>
      {count.missing.length > 0 ? (
        <BigButton kind="second" onClick={() => setOpen(true)}>
          Finish setting up · Setup: {count.done} of {count.total} done
        </BigButton>
      ) : (
        <p className="ui-muted">Setup: {count.total} of {count.total} done ✓</p>
      )}
      {open ? (
        <FinishSetupSheet
          account={account}
          onClose={() => setOpen(false)}
          onSaved={(updated) => {
            setAccount(updated);
            setOpen(false);
            onSaved?.();
          }}
        />
      ) : null}
    </>
  );
}

function FinishSetupSheet({ account, onClose, onSaved }: { account: AccountRecord; onClose: () => void; onSaved: (account: AccountRecord) => void }) {
  const saved = useMemo(() => savedValues(account), [account]);
  const { done, total, missing } = setupCount(account);
  const [values, setValues] = useState<Values>(() => ({
    ...saved,
    // A missing price per cleaning starts as the one the monthly pay works out to.
    perCleaning: saved.perCleaning || perCleaningText(saved.subPay, saved.frequency),
  }));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const accountId = text(account, "accountId", "id");
  const revenue = amount(text(account, "monthlyRevenue"));
  const asks = (key: SetupKey) => missing.includes(key);

  const set = (key: SetupKey, value: string) => setValues((current) => ({ ...current, [key]: value }));

  async function save() {
    // Only fields that were empty and now have something; the rest stay exactly as saved.
    const fields: Record<string, string> = {};
    if (asks("frequency") && values.frequency.trim()) fields.frequency = values.frequency.trim();
    if (asks("cleaningDays") && values.cleaningDays.trim()) fields.cleaningDays = values.cleaningDays.trim();
    if (asks("cleaningTime") && values.cleaningTime) fields.cleaningTime = values.cleaningTime;
    if (asks("startDate") && values.startDate) fields.startDate = values.startDate;
    if (asks("scopeOfWork") && values.scopeOfWork.trim()) fields.scopeOfWork = values.scopeOfWork.trim();
    if (asks("access") && values.access.trim()) fields.keyAlarmAccessInfo = values.access.trim();
    if (asks("contactName") && values.contactName.trim()) fields.contactName = values.contactName.trim();
    if (asks("phone") && values.phone.trim()) fields.phone = values.phone.trim();
    if (asks("email") && values.email.trim()) fields.email = values.email.trim();
    if (values.perCleaning.trim() && values.perCleaning.trim() !== saved.perCleaning) fields.subPricePerCleaning = values.perCleaning.trim();
    const pay = amount(values.subPay);
    if (pay > 0 && values.subPay !== saved.subPay) {
      // Same as Edit Account: the gross margin follows the sub pay.
      fields.monthlySubcontractorPay = String(pay);
      fields.grossMargin = String(revenue - pay);
      fields.grossMarginPercent = revenue ? (((revenue - pay) / revenue) * 100).toFixed(1) : "0.0";
    }
    if (Object.keys(fields).length === 0) {
      setError("Fill in at least one field, or close this.");
      return;
    }

    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "updateAccountFieldsDirect", accountId, fields }),
      });
      const data = (await response.json().catch(() => ({}))) as { success?: boolean; error?: string };
      if (!response.ok || data.success === false) throw new Error(data.error || "That did not save. Try again.");
      const updated = (await loadAccount(accountId)) ?? account;
      const after = setupCount(updated);
      showToast(after.missing.length ? `Saved ✓ Setup: ${after.done} of ${after.total} done` : "Saved ✓ Setup is complete");
      onSaved(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : "That did not save. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet
      open
      title="Finish setting up"
      text={`${text(account, "accountName")} · Setup: ${done} of ${total} done. Only what is still missing is here.`}
      onClose={() => {
        if (!busy) onClose();
      }}
      busy={busy}
      actions={
        <BigButton busy={busy} busyLabel="Saving…" onClick={() => void save()}>
          Save
        </BigButton>
      }
    >
      <div className="ui-stack">
        {asks("frequency") ? (
          <FrequencyField
            value={values.frequency}
            onChange={(frequency) =>
              // A new Frequency: the monthly pay stays and the price per cleaning is worked out again (lib/frequency.ts).
              setValues((current) => {
                const next = afterFrequencyChange(frequency, current.subPay, current.perCleaning);
                return { ...current, frequency, subPay: next.pay, perCleaning: next.per };
              })
            }
          />
        ) : null}
        {/* Right under Frequency: the reminder, the 70% suggestion and the two pay boxes in step. */}
        {asks("perCleaning") || asks("subPay") ? (
          <SubPayFields
            revenue={text(account, "monthlyRevenue")}
            frequency={values.frequency}
            onFrequency={(frequency) => set("frequency", frequency)}
            pay={values.subPay}
            per={values.perCleaning}
            onPay={({ pay, per }) => setValues((current) => ({ ...current, subPay: pay, perCleaning: per }))}
            frequencyAbove={asks("frequency")}
          />
        ) : null}
        {asks("cleaningDays") ? <Field label="Cleaning days" placeholder="Mon, Wed, Fri" value={values.cleaningDays} onChange={(event) => set("cleaningDays", event.target.value)} /> : null}
        {asks("cleaningTime") ? <CleaningTimeField value={values.cleaningTime} onChange={(value) => set("cleaningTime", value)} /> : null}
        {asks("startDate") ? <Field label="Start date" type="date" value={values.startDate} onChange={(event) => set("startDate", event.target.value)} /> : null}
        {asks("scopeOfWork") ? <TextAreaField label="Scope of work" rows={3} value={values.scopeOfWork} onChange={(event) => set("scopeOfWork", event.target.value)} /> : null}
        {asks("access") ? (
          <TextAreaField label="Key / alarm / access info" rows={2} value={values.access} onChange={(event) => set("access", event.target.value)} />
        ) : null}
        {asks("contactName") ? <Field label="Contact name" value={values.contactName} onChange={(event) => set("contactName", event.target.value)} /> : null}
        {asks("phone") ? <Field label="Contact phone" inputMode="tel" value={values.phone} onChange={(event) => set("phone", event.target.value)} /> : null}
        {asks("email") ? <Field label="Contact email" inputMode="email" value={values.email} onChange={(event) => set("email", event.target.value)} /> : null}
        {error ? <ErrorBox title="Not saved" text={error} /> : null}
      </div>
    </Sheet>
  );
}
