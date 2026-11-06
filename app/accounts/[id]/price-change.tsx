"use client";

// "Price & frequency change" on the account page: an existing customer
// changes how often we clean and what they pay (e.g. 1x to 2x a week). Not a
// new account and not an extra job.
//
//   <PriceChangeButton />   the button and its form (a sheet)
//   <PriceChangeHistory />  the "Change history" card
//
// Save, in order (a step that already went through is not repeated on a retry):
//   1. the signed estimate (same upload as New Accepted Account),
//   2. the schedule, when it changed: it starts on the effective date and the
//      old one keeps running until the day before (keepOldUntilStart), so no
//      cleaning before the change moves,
//   3. POST /api/accounts/price-changes: the account's CW price, sub pay and
//      Frequency (usual account save + History line) and the record.
// Prices are before tax, like everywhere else in the CRM (migration 072).
// English / Español switch at the top of the form and the card.

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { BigButton, Card, ErrorBox, Field, Sheet, showToast, TextAreaField } from "@/app/ui";
import ScheduleEditor from "@/app/components/schedule-editor";
import FrequencyField from "@/app/components/frequency-field";
import SubPayFields from "@/app/components/sub-pay-fields";
import { DraftNotice, useFormDraft } from "@/app/components/form-draft";
import { pickGroup, saveSchedule, useAccountSchedule, type StoredScheduleRow } from "@/app/components/account-schedule";
import { describePlan, describeRows, emptyPlan, planIsEmpty, planProblems, rowsToPlan, samePlan, type SchedulePlan } from "@/lib/schedule-plan";
import { afterFrequencyChange } from "@/lib/frequency";
import { accountFieldsFromPlan } from "@/lib/plan-account-fields";
import { todayISO } from "@/lib/scheduleRecurrence";

/* ---------- words ---------- */

type Lang = "en" | "es";

const WORDS = {
  en: {
    button: "Price & frequency change",
    title: "Price & frequency change",
    intro: "For a customer who changes how often we clean and what they pay. Not a new account and not an extra job.",
    language: "Español",
    effective: "Effective date",
    effectiveHint: "The new schedule starts this day. Cleanings before it stay as they were. A day that has already passed starts the schedule today.",
    schedule: "Cleaning schedule",
    scheduleHint: "This is the schedule now. Leave it as it is if only the price changes.",
    scheduleFailed: "The schedule did not load, so it cannot be changed here. The price can still be saved.",
    noSchedule: "No schedule yet. Add one here, or leave it empty.",
    money: "Price and pay",
    price: "New CW monthly price (before tax)",
    priceHint: (now: string) => `What the customer pays a month, before sales tax. Now: ${now}.`,
    difference: (text: string) => `Monthly change: ${text} (before tax)`,
    estimate: "Signed estimate (PDF or photo)",
    estimateHint: "Filed in the account's files as Accepted estimate. 10MB or smaller.",
    chosen: (name: string) => `Chosen: ${name}`,
    note: "Note",
    save: "Save change",
    saving: "Saving…",
    notSaved: "The change was not saved.",
    notReady: "This needs a database update (migration 072) before it can be saved. Nothing was changed.",
    loading: "Loading the schedule…",
    nothing: "Nothing changed: type the new price or change the schedule.",
    noPrice: "Type the new CW monthly price.",
    badDate: "Pick the effective date.",
    scheduleProblem: "Finish the schedule first.",
    savedToast: "Price & frequency change saved ✓",
    scheduleSavedOnly: "The schedule was saved. The price did not save: press Save change again.",
    history: "Change history",
    historyEmpty: "No price or frequency changes yet.",
    historyNotReady: "Change history starts once the database update (migration 072) has run.",
    effectiveOn: (day: string) => `Effective ${day}`,
    scheduleLine: "Schedule",
    priceLine: "CW price",
    subPayLine: "Sub pay",
    by: (who: string, when: string) => `Saved by ${who} on ${when}`,
    openEstimate: "Accepted estimate",
    perMonth: "/ month",
    unchanged: "unchanged",
    startsOn: (day: string) => `new schedule starts ${day}`,
  },
  es: {
    button: "Cambio de precio y frecuencia",
    title: "Cambio de precio y frecuencia",
    intro: "Para un cliente que cambia cada cuánto limpiamos y lo que paga. No es una cuenta nueva ni un trabajo extra.",
    language: "English",
    effective: "Fecha del cambio",
    effectiveHint: "El nuevo horario empieza este día. Las limpiezas anteriores no cambian. Si el día ya pasó, el horario empieza hoy.",
    schedule: "Horario de limpieza",
    scheduleHint: "Este es el horario actual. Déjelo igual si solo cambia el precio.",
    scheduleFailed: "El horario no cargó, así que no se puede cambiar aquí. El precio sí se puede guardar.",
    noSchedule: "Todavía no hay horario. Agregue uno aquí o déjelo vacío.",
    money: "Precio y pago",
    price: "Nuevo precio mensual de CW (sin impuesto)",
    priceHint: (now: string) => `Lo que el cliente paga al mes, antes del impuesto de venta. Ahora: ${now}.`,
    difference: (text: string) => `Cambio mensual: ${text} (sin impuesto)`,
    estimate: "Estimado firmado (PDF o foto)",
    estimateHint: "Se guarda en los archivos de la cuenta como Estimado aceptado. 10MB o menos.",
    chosen: (name: string) => `Elegido: ${name}`,
    note: "Nota",
    save: "Guardar cambio",
    saving: "Guardando…",
    notSaved: "El cambio no se guardó.",
    notReady: "Esto necesita una actualización de la base de datos (migración 072) antes de guardar. No se cambió nada.",
    loading: "Cargando el horario…",
    nothing: "No cambió nada: escriba el nuevo precio o cambie el horario.",
    noPrice: "Escriba el nuevo precio mensual de CW.",
    badDate: "Elija la fecha del cambio.",
    scheduleProblem: "Termine el horario primero.",
    savedToast: "Cambio de precio y frecuencia guardado ✓",
    scheduleSavedOnly: "El horario se guardó. El precio no: presione Guardar cambio otra vez.",
    history: "Historial de cambios",
    historyEmpty: "Todavía no hay cambios de precio o frecuencia.",
    historyNotReady: "El historial empieza cuando se aplique la actualización de la base de datos (migración 072).",
    effectiveOn: (day: string) => `Desde el ${day}`,
    scheduleLine: "Horario",
    priceLine: "Precio CW",
    subPayLine: "Pago del sub",
    by: (who: string, when: string) => `Guardado por ${who} el ${when}`,
    openEstimate: "Estimado aceptado",
    perMonth: "/ mes",
    unchanged: "sin cambio",
    startsOn: (day: string) => `el nuevo horario empieza el ${day}`,
  },
} as const;

type Words = (typeof WORDS)[Lang];

// The choice is kept in this browser and shared by the form and the card.
const LANG_KEY = "cw-price-change-lang";
const LANG_EVENT = "cw-price-change-lang";

function readLang(): Lang {
  try {
    return window.localStorage.getItem(LANG_KEY) === "es" ? "es" : "en";
  } catch {
    return "en";
  }
}

function subscribeLang(onChange: () => void) {
  window.addEventListener(LANG_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(LANG_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

function useLang(): [Lang, () => void] {
  const lang = useSyncExternalStore(subscribeLang, readLang, () => "en" as Lang);
  const toggle = useCallback(() => {
    try {
      window.localStorage.setItem(LANG_KEY, readLang() === "es" ? "en" : "es");
    } catch {
      // No storage: the switch just does not stick.
    }
    window.dispatchEvent(new Event(LANG_EVENT));
  }, []);
  return [lang, toggle];
}

/* ---------- money ---------- */

const amount = (value: string) => {
  const raw = String(value ?? "").replace(/[$,\s]/g, "");
  return raw === "" ? null : Number(raw);
};
const money = (value: number | null) => (value === null || Number.isNaN(value) ? "—" : value.toLocaleString("en-US", { style: "currency", currency: "USD" }));
const signed = (value: number) => `${value > 0 ? "+" : value < 0 ? "−" : ""}${money(Math.abs(value))}`;
const plain = (value: number | null) => (value === null || value === 0 ? "" : Number.isInteger(value) ? String(value) : value.toFixed(2));

/** The account Frequency a schedule means (the same rule as Add / Edit Account). */
function frequencyOfPlan(plan: SchedulePlan): string | null {
  return accountFieldsFromPlan(plan)?.frequency || null;
}

function dayText(iso: string): string {
  const [year, month, day] = iso.slice(0, 10).split("-").map(Number);
  if (!year || !month || !day) return iso;
  return new Date(year, month - 1, day).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

/* ---------- the button and the form ---------- */

type Current = {
  /** CW monthly price now (before tax). */
  price: number;
  subPay: number;
  /** The sub's price per cleaning as saved ("" = not set). */
  perCleaning: string;
  frequency: string;
};

export function PriceChangeButton({
  accountId,
  accountName,
  current,
  onSaved,
}: {
  accountId: string;
  accountName: string;
  current: Current;
  onSaved: () => void;
}) {
  const [lang] = useLang();
  const [open, setOpen] = useState(false);
  return (
    <>
      <BigButton kind="second" onClick={() => setOpen(true)}>
        {WORDS[lang].button}
      </BigButton>
      {open ? (
        <PriceChangeSheet
          accountId={accountId}
          accountName={accountName}
          current={current}
          onClose={() => setOpen(false)}
          onSaved={() => {
            setOpen(false);
            onSaved();
          }}
        />
      ) : null}
    </>
  );
}

function PriceChangeSheet({
  accountId,
  accountName,
  current,
  onClose,
  onSaved,
}: {
  accountId: string;
  accountName: string;
  current: Current;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [lang, toggleLang] = useLang();
  const w = WORDS[lang];
  const schedule = useAccountSchedule(accountId);
  const group = pickGroup(schedule.groups, schedule.accountSub.email);
  const [ready, setReady] = useState<boolean | null>(null);

  useEffect(() => {
    let alive = true;
    fetch(`/api/accounts/price-changes?accountId=${encodeURIComponent(accountId)}`, { cache: "no-store" })
      .then((response) => response.json())
      .then((data: { success?: boolean; ready?: boolean }) => alive && setReady(data.success === true && data.ready === true))
      .catch(() => alive && setReady(true)); // a failed check is caught again by Save
    return () => {
      alive = false;
    };
  }, [accountId]);

  const loading = schedule.state === "loading" || ready === null;
  return (
    <Sheet open title={w.title} text={accountName} onClose={onClose}>
      <p className="ui-muted">{w.intro}</p>
      <div className="ui-actions-row">
        <BigButton kind="quiet" onClick={toggleLang}>
          {w.language}
        </BigButton>
      </div>
      {loading ? (
        <p className="ui-muted">{w.loading}</p>
      ) : ready === false ? (
        <ErrorBox title={w.notSaved} text={w.notReady} />
      ) : (
        <PriceChangeForm
          accountId={accountId}
          accountName={accountName}
          current={current}
          rows={group?.rows ?? []}
          subId={group?.subId ?? schedule.accountSub.email}
          scheduleFailed={schedule.state === "failed"}
          w={w}
          onSaved={onSaved}
        />
      )}
    </Sheet>
  );
}

function PriceChangeForm({
  accountId,
  accountName,
  current,
  rows,
  subId,
  scheduleFailed,
  w,
  onSaved,
}: {
  accountId: string;
  accountName: string;
  current: Current;
  rows: StoredScheduleRow[];
  subId: string;
  scheduleFailed: boolean;
  w: Words;
  onSaved: () => void;
}) {
  const [initialPlan] = useState<SchedulePlan>(() => (rows.length > 0 ? rowsToPlan(rows) : emptyPlan()));
  const [effectiveDate, setEffectiveDate] = useState(() => todayISO());
  const [plan, setPlan] = useState<SchedulePlan>(initialPlan);
  const [frequency, setFrequency] = useState(current.frequency);
  const [price, setPrice] = useState(() => plain(current.price));
  const [subPay, setSubPay] = useState(() => ({ pay: plain(current.subPay), per: current.perCleaning }));
  const [note, setNote] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [tried, setTried] = useState(false);
  const [error, setError] = useState("");
  // Steps already done, so pressing Save again after a failure never repeats them.
  const uploaded = useRef<{ url: string; name: string; file: File } | null>(null);
  const scheduleDone = useRef<{ start: string } | null>(null);

  const draft = useFormDraft(
    `price-change:${accountId}`,
    { effectiveDate, plan, frequency, price, subPay, note },
    {
      onRestore: (kept) => {
        setEffectiveDate(kept.effectiveDate);
        setPlan(kept.plan);
        setFrequency(kept.frequency);
        setPrice(kept.price);
        setSubPay(kept.subPay);
        setNote(kept.note);
      },
    }
  );

  const scheduleChanged = !scheduleFailed && !samePlan(plan, initialPlan) && !planIsEmpty(plan);
  const newPrice = amount(price);
  const difference = newPrice !== null && !Number.isNaN(newPrice) ? Math.round((newPrice - current.price) * 100) / 100 : null;
  const oldScheduleText = rows.length > 0 ? describeRows(rows) : "";

  const problem = useMemo(() => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(effectiveDate)) return w.badDate;
    if (newPrice === null || Number.isNaN(newPrice) || newPrice < 0) return w.noPrice;
    if (scheduleChanged && planProblems(plan).length > 0) return w.scheduleProblem;
    const payChanged = (amount(subPay.pay) ?? 0) !== current.subPay;
    if (!scheduleChanged && difference === 0 && !payChanged && frequency === current.frequency) return w.nothing;
    return "";
  }, [effectiveDate, newPrice, scheduleChanged, plan, subPay.pay, current, difference, frequency, w]);

  function changePlan(next: SchedulePlan) {
    setPlan(next);
    // The account's Frequency follows the schedule (it can still be changed below).
    const follows = frequencyOfPlan(next);
    if (follows && follows !== frequency) {
      setFrequency(follows);
      setSubPay(afterFrequencyChange(follows, subPay.pay, subPay.per));
    }
  }

  async function save() {
    setTried(true);
    setError("");
    if (problem) {
      setError(problem);
      return;
    }
    setSaving(true);
    try {
      // 1. The signed estimate.
      if (file && uploaded.current?.file !== file) {
        const form = new FormData();
        form.append("file", file);
        const response = await fetch("/api/handoffs/estimate", { method: "POST", body: form });
        const data = (await response.json().catch(() => ({}))) as { success?: boolean; error?: string; url?: string; name?: string };
        if (!response.ok || !data.success || !data.url) throw new Error(data.error || "The estimate did not upload. Try again.");
        uploaded.current = { url: data.url, name: data.name ?? file.name, file };
      }

      // 2. The schedule, from the effective date on.
      if (scheduleChanged && !scheduleDone.current) {
        const result = await saveSchedule({
          accountId,
          accountName,
          subId,
          plan,
          closeScheduleIds: rows.map((row) => row.scheduleId),
          startDate: effectiveDate,
          keepOldUntilStart: true,
        });
        if (!result.ok) throw new Error(result.error);
        scheduleDone.current = { start: result.startDate };
      }

      // 3. The account's price, pay and Frequency, and the record.
      const response = await fetch("/api/accounts/price-changes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountId,
          effectiveDate,
          scheduleStart: scheduleDone.current?.start ?? "",
          oldSchedule: oldScheduleText,
          newSchedule: scheduleDone.current ? describePlan(plan) : oldScheduleText,
          newFrequency: frequency.trim(),
          newPrice: price,
          newSubPay: subPay.pay,
          subPricePerCleaning: subPay.per,
          estimateUrl: uploaded.current?.url ?? "",
          estimateName: uploaded.current?.name ?? "",
          note: note.trim(),
        }),
      });
      const data = (await response.json().catch(() => ({}))) as { success?: boolean; error?: string };
      if (!response.ok || !data.success) {
        throw new Error([data.error || w.notSaved, scheduleDone.current ? w.scheduleSavedOnly : ""].filter(Boolean).join(" "));
      }
      draft.clear();
      showToast(w.savedToast);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : w.notSaved);
      setSaving(false);
    }
  }

  return (
    <div className="ui-stack">
      <DraftNotice draft={draft} />
      <Field label={w.effective} hint={w.effectiveHint} type="date" value={effectiveDate} disabled={saving} onChange={(event) => setEffectiveDate(event.target.value)} />

      <Card title={w.schedule}>
        {scheduleFailed ? (
          <p className="ui-field-error">{w.scheduleFailed}</p>
        ) : (
          <>
            <p className="ui-hint">{rows.length > 0 ? w.scheduleHint : w.noSchedule}</p>
            <ScheduleEditor value={plan} onChange={changePlan} showProblems={tried && scheduleChanged} disabled={saving || scheduleDone.current !== null} />
          </>
        )}
      </Card>

      <Card title={w.money}>
        <div className="ui-stack">
          <Field
            label={w.price}
            hint={w.priceHint(money(current.price))}
            inputMode="decimal"
            value={price}
            disabled={saving}
            onChange={(event) => setPrice(event.target.value)}
          />
          {difference !== null ? (
            <p className="ui-muted" aria-live="polite">
              {w.difference(signed(difference))}
            </p>
          ) : null}
          <FrequencyField
            value={frequency}
            onChange={(next) => {
              setFrequency(next);
              setSubPay(afterFrequencyChange(next, subPay.pay, subPay.per));
            }}
          />
          {/* The same sub pay boxes and suggestion as Edit Account. */}
          <SubPayFields revenue={price} frequency={frequency} onFrequency={setFrequency} pay={subPay.pay} per={subPay.per} onPay={setSubPay} frequencyAbove disabled={saving} />
        </div>
      </Card>

      <div className="ui-field">
        <label className="ui-label" htmlFor="price-change-estimate">
          {w.estimate}
        </label>
        <input
          id="price-change-estimate"
          type="file"
          accept="application/pdf,image/*"
          className="ui-input"
          disabled={saving}
          onChange={(event) => setFile(event.target.files?.[0] ?? null)}
        />
        <p className="ui-hint">{file ? w.chosen(file.name) : w.estimateHint}</p>
      </div>

      <TextAreaField label={w.note} optional value={note} disabled={saving} onChange={(event) => setNote(event.target.value)} />

      {error ? <ErrorBox title={w.notSaved} text={error} /> : null}
      <BigButton busy={saving} busyLabel={w.saving} onClick={() => void save()}>
        {w.save}
      </BigButton>
    </div>
  );
}

/* ---------- Change history ---------- */

type Change = {
  id: number;
  effectiveDate: string;
  scheduleStart: string;
  oldSchedule: string;
  newSchedule: string;
  oldFrequency: string;
  newFrequency: string;
  oldPrice: number | null;
  newPrice: number | null;
  oldSubPay: number | null;
  newSubPay: number | null;
  monthlyDifference: number;
  estimateUrl: string;
  estimateName: string;
  note: string;
  createdBy: string;
  createdAt: string;
};

export function PriceChangeHistory({ accountId, refreshKey = 0 }: { accountId: string; refreshKey?: number }) {
  const [lang, toggleLang] = useLang();
  const w = WORDS[lang];
  const [state, setState] = useState<{ ready: boolean; changes: Change[] } | null>(null);

  useEffect(() => {
    let alive = true;
    fetch(`/api/accounts/price-changes?accountId=${encodeURIComponent(accountId)}`, { cache: "no-store" })
      .then((response) => response.json())
      .then((data: { success?: boolean; ready?: boolean; changes?: Change[] }) => {
        if (alive && data.success) setState({ ready: data.ready === true, changes: data.changes ?? [] });
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [accountId, refreshKey]);

  // Nothing to show until it loads; before migration 072 a short line says why it is empty.
  if (!state) return null;
  const line = (label: string, before: string, after: string) => (
    <p className="ui-card-text">
      <strong>{label}:</strong> {before === after ? `${after} (${w.unchanged})` : `${before || "—"} → ${after || "—"}`}
    </p>
  );

  return (
    <Card
      title={w.history}
      right={
        <button type="button" className="ui-link" onClick={toggleLang}>
          {w.language}
        </button>
      }
    >
      {!state.ready ? (
        <p className="ui-muted">{w.historyNotReady}</p>
      ) : state.changes.length === 0 ? (
        <p className="ui-muted">{w.historyEmpty}</p>
      ) : (
        <ul className="ui-stack" style={{ listStyle: "none", padding: 0, margin: 0 }}>
          {state.changes.map((change) => (
            <li key={change.id} style={{ borderTop: "1px solid var(--ui-line)", paddingTop: 12 }}>
              <p className="ui-card-text">
                <strong>{w.effectiveOn(dayText(change.effectiveDate))}</strong>
                {change.monthlyDifference !== 0 ? ` · ${signed(change.monthlyDifference)} ${w.perMonth}` : ""}
                {change.scheduleStart && change.scheduleStart !== change.effectiveDate ? ` · ${w.startsOn(dayText(change.scheduleStart))}` : ""}
              </p>
              {line(w.scheduleLine, [change.oldSchedule, change.oldFrequency].filter(Boolean).join(" · "), [change.newSchedule, change.newFrequency].filter(Boolean).join(" · "))}
              {line(w.priceLine, money(change.oldPrice), money(change.newPrice))}
              {line(w.subPayLine, money(change.oldSubPay), money(change.newSubPay))}
              {change.note ? <p className="ui-card-text" style={{ whiteSpace: "pre-wrap" }}>{change.note}</p> : null}
              {change.estimateUrl ? (
                <p className="ui-card-text">
                  <a className="ui-link" href={change.estimateUrl} target="_blank" rel="noopener noreferrer">
                    📄 {w.openEstimate}
                    {change.estimateName ? ` (${change.estimateName})` : ""}
                  </a>
                </p>
              ) : null}
              <p className="ui-muted">{w.by(change.createdBy || "Staff", dayText(change.createdAt))}</p>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
