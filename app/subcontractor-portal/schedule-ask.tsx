"use client";

// The box at the top of the sub portal: "Please set the schedule for these
// accounts". The sub's Active accounts with no schedule yet
// (GET /api/subcontractor-portal/schedule-ask). Each opens the same schedule
// form as My Schedule, with the old Frequency / days / time in grey as a
// hint only (nothing old is copied in). Saved through
// POST /api/subcontractor-schedules: only their own accounts, never before
// today or the account's Start Date, and the account's old fields follow.
// Shows nothing when there is nothing to set.

import { useEffect, useState } from "react";
import { BigButton } from "@/app/ui";
import { friendlyDate, type UiLang } from "@/app/ui/words";
import ScheduleEditor from "@/app/components/schedule-editor";
import { emptyPlan, planProblems, planToEntries, type SchedulePlan } from "@/lib/schedule-plan";
import { oldScheduleInfo } from "@/lib/plan-account-fields";
import { describeCleaningTime } from "@/lib/cleaningTime";
import type { AskAccount } from "@/lib/pg/schedule-ask";

const WORDS: Record<
  UiLang,
  {
    title: string;
    text: string;
    left: (count: number) => string;
    set: string;
    oldInfo: string;
    noOld: string;
    starts: (day: string) => string;
    save: string;
    saving: string;
    cancel: string;
    saved: (name: string) => string;
    failed: string;
    offline: string;
  }
> = {
  en: {
    title: "Please set the schedule for these accounts",
    text: "Pick the days and times you really clean. The grey line is what we had before: it may be old.",
    left: (count) => (count === 1 ? "1 account left" : `${count} accounts left`),
    set: "Set schedule",
    oldInfo: "Old info",
    noOld: "No old info for this account.",
    starts: (day) => `Starts ${day}`,
    save: "Save schedule",
    saving: "Saving…",
    cancel: "Cancel",
    saved: (name) => `Saved ✓ ${name}. Thank you!`,
    failed: "The schedule was not saved. Please try again.",
    offline: "No connection. Please try again.",
  },
  es: {
    title: "Por favor ponga el horario de estas cuentas",
    text: "Elija los días y las horas en que de verdad limpia. La línea gris es lo que teníamos antes: puede estar vieja.",
    left: (count) => (count === 1 ? "Falta 1 cuenta" : `Faltan ${count} cuentas`),
    set: "Poner horario",
    oldInfo: "Info anterior",
    noOld: "No hay info anterior de esta cuenta.",
    starts: (day) => `Empieza ${day}`,
    save: "Guardar horario",
    saving: "Guardando…",
    cancel: "Cancelar",
    saved: (name) => `Guardado ✓ ${name}. ¡Gracias!`,
    failed: "El horario no se guardó. Intente de nuevo.",
    offline: "Sin conexión. Intente de nuevo.",
  },
  pt: {
    title: "Por favor, defina o horário destas contas",
    text: "Escolha os dias e horários em que você realmente limpa. A linha cinza é o que tínhamos antes: pode estar antiga.",
    left: (count) => (count === 1 ? "Falta 1 conta" : `Faltam ${count} contas`),
    set: "Definir horário",
    oldInfo: "Info antiga",
    noOld: "Não há info antiga desta conta.",
    starts: (day) => `Começa ${day}`,
    save: "Salvar horário",
    saving: "Salvando…",
    cancel: "Cancelar",
    saved: (name) => `Salvo ✓ ${name}. Obrigado!`,
    failed: "O horário não foi salvo. Tente de novo.",
    offline: "Sem conexão. Tente de novo.",
  },
};

type AskData = { subId: string; subName: string; accounts: AskAccount[] };

export default function ScheduleAsk({ lang }: { lang: UiLang }) {
  const words = WORDS[lang] ?? WORDS.en;
  const [data, setData] = useState<AskData | null>(null);
  const [openId, setOpenId] = useState("");
  const [savedText, setSavedText] = useState("");

  useEffect(() => {
    let alive = true;
    fetch("/api/subcontractor-portal/schedule-ask", { cache: "no-store" })
      .then(async (response) => {
        const body = (await response.json().catch(() => ({}))) as { success?: boolean } & Partial<AskData>;
        if (alive && response.ok && body.success) setData({ subId: body.subId ?? "", subName: body.subName ?? "", accounts: body.accounts ?? [] });
      })
      // Best effort: the box just does not show.
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  if (!data || (data.accounts.length === 0 && !savedText)) return null;

  return (
    <section className="ui-card" style={{ borderLeft: "8px solid #d97706" }} aria-label={words.title}>
      <h2 className="ui-card-title">{words.title}</h2>
      <p className="ui-muted">{words.text}</p>
      {data.accounts.length > 0 ? <p className="ui-strong">{words.left(data.accounts.length)}</p> : null}
      {savedText ? (
        <p className="ui-savestatus ui-savestatus-saved" role="status">
          {savedText}
        </p>
      ) : null}
      <div className="mt-4 space-y-3">
        {data.accounts.map((account) => (
          <AskRow
            key={account.accountId}
            account={account}
            words={words}
            lang={lang}
            subId={data.subId}
            subName={data.subName}
            open={openId === account.accountId}
            onOpen={() => {
              setSavedText("");
              setOpenId(account.accountId);
            }}
            onClose={() => setOpenId("")}
            onSaved={() => {
              setOpenId("");
              setSavedText(words.saved(account.accountName));
              setData((current) => (current ? { ...current, accounts: current.accounts.filter((item) => item.accountId !== account.accountId) } : current));
            }}
          />
        ))}
      </div>
    </section>
  );
}

function AskRow({
  account,
  words,
  lang,
  subId,
  subName,
  open,
  onOpen,
  onClose,
  onSaved,
}: {
  account: AskAccount;
  words: (typeof WORDS)["en"];
  lang: UiLang;
  subId: string;
  subName: string;
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [plan, setPlan] = useState<SchedulePlan>(() => emptyPlan());
  const [tried, setTried] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const oldInfo = oldScheduleInfo(account, describeCleaningTime, words.oldInfo);
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const startsLater = /^\d{4}-\d{2}-\d{2}$/.test(account.startDate) && account.startDate > today;

  async function save() {
    setTried(true);
    setError("");
    if (planProblems(plan).length > 0) return;
    setSaving(true);
    try {
      const response = await fetch("/api/subcontractor-schedules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountId: account.accountId,
          accountName: account.accountName,
          subId,
          submittedBy: subName,
          frequency: plan.frequency,
          // The server starts it today, or on the account's Start Date when later.
          effectiveStart: "",
          effectiveEnd: "",
          entries: planToEntries(plan),
        }),
      });
      const body = (await response.json().catch(() => ({}))) as { success?: boolean; error?: string };
      if (!response.ok || !body.success) {
        setError(body.error || words.failed);
        return;
      }
      onSaved();
    } catch {
      setError(words.offline);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="ui-stat">
      <p className="ui-strong">{account.accountName}</p>
      {account.address ? <p className="ui-muted">{account.address}</p> : null}
      <p className="ui-muted" style={{ color: "#64748b" }}>
        {oldInfo || words.noOld}
      </p>
      {startsLater ? <p className="ui-muted">{words.starts(friendlyDate(account.startDate, lang))}</p> : null}
      {open ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 8 }}>
          <ScheduleEditor value={plan} onChange={setPlan} showProblems={tried} disabled={saving} showTimeOnSite={false} />
          {error ? <p className="ui-field-error">{error}</p> : null}
          <BigButton busy={saving} busyLabel={words.saving} onClick={() => void save()}>
            {words.save}
          </BigButton>
          <BigButton kind="quiet" onClick={onClose}>
            {words.cancel}
          </BigButton>
        </div>
      ) : (
        <BigButton kind="second" onClick={onOpen}>
          {words.set}
        </BigButton>
      )}
    </div>
  );
}
