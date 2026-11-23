// "We're on it": the date the team promises a complaint will be done. Words
// and rules, safe in the browser. Saved as complaint_events (kind 'promise'):
// the newest one is the promise, the older ones are the history. Server side:
// lib/pg/complaint-promise.ts.

export type PromiseLang = "en" | "es" | "pt";

export const PROMISE_REASONS = ["customer", "supplies", "time", "other"] as const;
export type PromiseReason = (typeof PROMISE_REASONS)[number];
export const isPromiseReason = (value: unknown): value is PromiseReason => PROMISE_REASONS.includes(value as PromiseReason);

/** Office words for a change of date. */
export const PROMISE_REASON_TEXT: Record<PromiseReason, string> = {
  customer: "Customer not available",
  supplies: "Need supplies",
  time: "Need more time",
  other: "Other",
};

export type ComplaintPromise = {
  dueDate: string;
  /** "HH:MM" or "". */
  dueTime: string;
  /** "" on the first date. */
  reason: PromiseReason | "";
  reasonText: string;
  by: string;
  /** When it was set (ISO). */
  at: string;
};

export const PROMISE_WORDS: Record<PromiseLang, {
  onIt: string; ask: string; date: string; time: string; save: string; cancel: string; change: string; why: string; reasons: Record<PromiseReason, string>;
  other: string; needDate: string; needFuture: string; needReason: string; needOther: string; sameDate: string; saved: string; failed: string; doneBy: (when: string) => string;
}> = {
  en: {
    onIt: "We're on it", ask: "When will it be done?", date: "Date", time: "Time (optional)", save: "Save", cancel: "Cancel", change: "Change date", why: "Why is the date changing?",
    reasons: { customer: "Customer not available", supplies: "Need supplies", time: "Need more time", other: "Other" },
    other: "Tell us why", needDate: "Pick the date.", needFuture: "Pick a date and time that have not passed.", needReason: "Pick a reason.", needOther: "Write the reason.", sameDate: "Pick a different date or time.",
    saved: "Saved. The office can see the date.", failed: "It did not save. Try again.", doneBy: (when) => `Team on it — done by ${when}`,
  },
  es: {
    onIt: "Estamos en eso", ask: "¿Cuándo estará listo?", date: "Fecha", time: "Hora (opcional)", save: "Guardar", cancel: "Cancelar", change: "Cambiar fecha", why: "¿Por qué cambia la fecha?",
    reasons: { customer: "Cliente no disponible", supplies: "Faltan materiales", time: "Necesitamos más tiempo", other: "Otro" },
    other: "Dinos por qué", needDate: "Elige la fecha.", needFuture: "Elige una fecha y hora que no hayan pasado.", needReason: "Elige un motivo.", needOther: "Escribe el motivo.", sameDate: "Elige otra fecha u hora.",
    saved: "Guardado. La oficina puede ver la fecha.", failed: "No se guardó. Inténtalo de nuevo.", doneBy: (when) => `Equipo en eso — listo para ${when}`,
  },
  pt: {
    onIt: "Estamos cuidando disso", ask: "Quando vai ficar pronto?", date: "Data", time: "Hora (opcional)", save: "Salvar", cancel: "Cancelar", change: "Mudar data", why: "Por que a data está mudando?",
    reasons: { customer: "Cliente não disponível", supplies: "Faltam materiais", time: "Precisamos de mais tempo", other: "Outro" },
    other: "Diga o motivo", needDate: "Escolha a data.", needFuture: "Escolha uma data e hora que ainda não passaram.", needReason: "Escolha um motivo.", needOther: "Escreva o motivo.", sameDate: "Escolha outra data ou hora.",
    saved: "Salvo. O escritório pode ver a data.", failed: "Não salvou. Tente de novo.", doneBy: (when) => `Equipe cuidando — pronto até ${when}`,
  },
};

const LOCALE: Record<PromiseLang, string> = { en: "en-US", es: "es-US", pt: "pt-BR" };

export const isPromiseDay = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) && new Date(`${value}T12:00:00Z`).toISOString().slice(0, 10) === value;

/** "HH:MM" or "". */
export function cleanPromiseTime(value: unknown): string {
  const match = /^(\d{1,2}):(\d{2})$/.exec(String(value ?? "").trim());
  if (!match || Number(match[1]) > 23 || Number(match[2]) > 59) return "";
  return `${match[1].padStart(2, "0")}:${match[2]}`;
}

/** "Tue Nov 25", or "Tue Nov 25 10:30 AM". Office time, shown as written. */
export function promiseWhen(dueDate: string, dueTime: string, lang: PromiseLang): string {
  const time = cleanPromiseTime(dueTime);
  const at = new Date(`${dueDate}T${time || "12:00"}:00Z`);
  if (Number.isNaN(at.getTime())) return dueDate;
  return at.toLocaleString(LOCALE[lang], { timeZone: "UTC", weekday: "short", month: "short", day: "numeric", ...(time ? { hour: "numeric", minute: "2-digit" } : {}) }).replace(/,/g, "");
}

/** Past its time, or past the end of its day when it has no time. Office (New York) clock. */
export function promisePassed(promise: Pick<ComplaintPromise, "dueDate" | "dueTime">, now = new Date()): boolean {
  const clock = now.toLocaleString("sv-SE", { timeZone: "America/New_York" }).slice(0, 16);
  return promise.dueTime ? clock > `${promise.dueDate} ${promise.dueTime}` : clock.slice(0, 10) > promise.dueDate;
}

const setWhen = (iso: string) => new Date(iso).toLocaleString("en-US", { timeZone: "America/New_York", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

/** The office's line: "Team on it — done by Tue Nov 25 · set by Ana, Nov 23, 3:05 PM", "LATE" in front when it passed. */
export function staffPromiseLine(promise: ComplaintPromise, late: boolean): string {
  return `${late ? "LATE · " : ""}${PROMISE_WORDS.en.doneBy(promiseWhen(promise.dueDate, promise.dueTime, "en"))} · set by ${promise.by || "the team"}, ${setWhen(promise.at)}`;
}

/** One line of the office's history. */
export function promiseHistoryLine(promise: ComplaintPromise): string {
  const why = promise.reason ? ` (${promise.reason === "other" && promise.reasonText ? `Other: ${promise.reasonText}` : PROMISE_REASON_TEXT[promise.reason]})` : "";
  return `${setWhen(promise.at)} · ${promise.by || "The team"} ${promise.reason ? "changed it to" : "set"} ${promiseWhen(promise.dueDate, promise.dueTime, "en")}${why}`;
}

/** One saved event as a promise. Null when it cannot be read. */
export function readPromise(detail: string, by: string, at: string): ComplaintPromise | null {
  try {
    const data = JSON.parse(detail) as { dueDate?: unknown; dueTime?: unknown; reason?: unknown; reasonText?: unknown };
    const dueDate = String(data.dueDate ?? "");
    if (!isPromiseDay(dueDate)) return null;
    return { dueDate, dueTime: cleanPromiseTime(data.dueTime), reason: isPromiseReason(data.reason) ? data.reason : "", reasonText: String(data.reasonText ?? "").trim(), by: String(by ?? "").trim(), at };
  } catch {
    return null;
  }
}
