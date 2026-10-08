// Words used by the UI kit and the redesigned screens.
//
// 1. UI_WORDS: the few words the kit's own components show (Back, Search,
//    Saving…). Components never hard-code English; they read these through
//    useUiWords(), so crew and subcontractor screens can switch to ES / PT.
// 2. LABELS + GLOSSARY: the plain-word list for staff screens. Any rename of
//    something people already know (e.g. "Complaints" → "Problems") is a
//    proposal only until Andres approves it — see PROPOSED_RENAMES.

export type UiLang = "en" | "es" | "pt";

export type UiWords = {
  back: string;
  search: string;
  clearSearch: string;
  more: string;
  cancel: string;
  close: string;
  saving: string;
  saved: string;
  couldNotSave: string;
  tryAgain: string;
  loading: string;
  optional: string;
  stepOf: (now: number, total: number) => string;
  addPhoto: string;
  removePhoto: string;
  nothingFound: string;
  statusDone: string;
  statusWaiting: string;
  statusNeedsYou: string;
  statusOff: string;
};

export const UI_WORDS: Record<UiLang, UiWords> = {
  en: {
    back: "Back",
    search: "Search",
    clearSearch: "Clear search",
    more: "More",
    cancel: "Cancel",
    close: "Close",
    saving: "Saving…",
    saved: "Saved",
    couldNotSave: "That did not save.",
    tryAgain: "Try again",
    loading: "Loading…",
    optional: "optional",
    stepOf: (now, total) => `Step ${now} of ${total}`,
    addPhoto: "Add photo",
    removePhoto: "Remove photo",
    nothingFound: "Nothing found",
    statusDone: "Done",
    statusWaiting: "Waiting",
    statusNeedsYou: "Needs you",
    statusOff: "Off",
  },
  es: {
    back: "Atrás",
    search: "Buscar",
    clearSearch: "Borrar búsqueda",
    more: "Más",
    cancel: "Cancelar",
    close: "Cerrar",
    saving: "Guardando…",
    saved: "Guardado",
    couldNotSave: "No se guardó.",
    tryAgain: "Intentar de nuevo",
    loading: "Cargando…",
    optional: "opcional",
    stepOf: (now, total) => `Paso ${now} de ${total}`,
    addPhoto: "Agregar foto",
    removePhoto: "Quitar foto",
    nothingFound: "No se encontró nada",
    statusDone: "Listo",
    statusWaiting: "En espera",
    statusNeedsYou: "Te necesita",
    statusOff: "Apagado",
  },
  pt: {
    back: "Voltar",
    search: "Buscar",
    clearSearch: "Limpar busca",
    more: "Mais",
    cancel: "Cancelar",
    close: "Fechar",
    saving: "Salvando…",
    saved: "Salvo",
    couldNotSave: "Não foi salvo.",
    tryAgain: "Tentar de novo",
    loading: "Carregando…",
    optional: "opcional",
    stepOf: (now, total) => `Passo ${now} de ${total}`,
    addPhoto: "Adicionar foto",
    removePhoto: "Remover foto",
    nothingFound: "Nada encontrado",
    statusDone: "Pronto",
    statusWaiting: "Aguardando",
    statusNeedsYou: "Precisa de você",
    statusOff: "Desligado",
  },
};

// Button and action words for staff screens. Verbs, never "Submit".
export const LABELS = {
  save: "Save",
  add: "Add",
  edit: "Change",
  remove: "Remove",
  send: "Send",
  markDone: "Mark done",
  open: "Open",
  print: "Print",
  share: "Share",
  call: "Call",
  text: "Text",
  next: "Next",
  finish: "Finish",
} as const;

// What each word means on screen. Left side is the word the app uses today
// and keeps using.
export const GLOSSARY: { word: string; means: string }[] = [
  { word: "Account", means: "A customer building we clean." },
  { word: "Subcontractor", means: "The cleaning company that does the work at an account. Short: Sub." },
  { word: "Manager", means: "The Cleaning World person who looks after an account." },
  { word: "Visit", means: "A manager going to an account to check the cleaning." },
  { word: "Complaint", means: "Something a customer said was wrong." },
  { word: "To-Do", means: "A job someone on the team has to finish." },
  { word: "Schedule", means: "The days a sub cleans an account." },
  { word: "Supply order", means: "A list of supplies a site asked for." },
  { word: "Checklist", means: "The list of cleaning tasks for an account." },
  { word: "Crew Link", means: "The page a cleaning crew opens for an account." },
  { word: "Portal", means: "The page a customer or a sub logs in to." },
];

// Not applied anywhere. Needs Andres's approval (plan rule 12).
export const PROPOSED_RENAMES: { today: string; proposed: string; why: string }[] = [
  { today: "Complaints", proposed: "Problems", why: "Shorter, and a child knows the word." },
  { today: "Subcontractor", proposed: "Sub", why: "Staff already say Sub; it fits on a phone." },
  { today: "Submit", proposed: "Send / Save", why: "Says what happens." },
  { today: "Account Updates", proposed: "Notes", why: "It is a list of notes about an account." },
  { today: "Account Health", proposed: "How accounts are doing", why: "Says what the screen shows." },
];

const pad2 = (n: number) => String(n).padStart(2, "0");

/** "Tue, Oct 7" (adds the year when it is not this year). Accepts YYYY-MM-DD or a Date. */
export function friendlyDate(value: string | Date | null | undefined, lang: UiLang = "en"): string {
  if (!value) return "";
  // A bare YYYY-MM-DD is a calendar day, not a UTC instant: build it in local
  // time so it never shows as the day before.
  const match = typeof value === "string" ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim()) : null;
  const date = match
    ? new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
    : new Date(value);
  if (Number.isNaN(date.getTime())) return typeof value === "string" ? value : "";
  const sameYear = date.getFullYear() === new Date().getFullYear();
  const locale = { en: "en-US", es: "es-US", pt: "pt-BR" }[lang];
  return date.toLocaleDateString(locale, {
    weekday: "short",
    month: "short",
    day: "numeric",
    ...(sameYear ? {} : { year: "numeric" }),
  });
}

/** YYYY-MM-DD for today in local time (for date inputs). */
export function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}
