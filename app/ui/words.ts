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
  // "Delete" is for things that are gone for good; "Remove" takes something off a list.
  delete: "Delete",
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

/* ---------- "If it's not in the app, it does not exist!" ---------- */

// The house rule and the encouragement around it. Friendly, never shaming:
// these lines celebrate logging things and never name who has not.
// Every screen that shows the rule or a cheer reads it from here.

export const MOTTO: Record<UiLang, string> = {
  en: "If it's not in the app, it does not exist!",
  es: "Si no está en la app, no existe!",
  pt: "Se não está no app, não existe!",
};

export const CHEER = {
  /** After every save. */
  logged: "Logged ✓ — now it exists!",
  /** Next to "Add accepted estimate". */
  estimate: "No paper on desks — snap it here",
  /** On the add update form. */
  update: "Logged here = office sees it right away",
  /** On supply orders. */
  order: "Ordered here = tracked to delivery",
  /** My work is empty. */
  allClearTitle: "All clear! 🎉",
  allClearText: "Nothing is waiting on you. Nice work.",
  /** Personal streak, shown from 2 days up. */
  streak: (days: number) => `${days} days with nothing late`,
  /** Monday team card: the team as a whole, never one person. */
  mondayTitle: "Last week, as a team",
  mondayText: "All of this is in the app, so all of it exists. Thank you.",
  /** The last line of app emails. */
  emailLine: "If it's not in the app, it does not exist!",
} as const;

/** What the sub portal's home says, per language. */
export const SUB_WORDS: Record<
  UiLang,
  {
    hello: (name: string) => string;
    today: (sites: number) => string;
    noSitesToday: string;
    doneToday: string;
    photos: string;
    problem: string;
    extraJob: string;
    supplies: string;
    myRequests: string;
    waiting: (count: number) => string;
    more: string;
    back: string;
    send: string;
    sending: string;
    sent: string;
    sentText: string;
    pickSite: string;
    photo: string;
    talk: string;
    listening: string;
    before: string;
    after: string;
    takePhoto: string;
    anotherPhoto: string;
    retrying: string;
    whatHappened: string;
    problems: { cantGetIn: string; broken: string; noSupplies: string; damage: string; customer: string; other: string };
    otherItem: string;
    otherItemHint: string;
    nothingPicked: string;
    received: string;
    approved: string;
    done: string;
    noRequests: string;
    tryAgain: string;
    notSent: string;
    pinTitle: string;
    pinNew: string;
    pinAgain: string;
    pinWrong: (left: number) => string;
    pinLocked: (minutes: number) => string;
    pinNoMatch: string;
    useEmail: string;
    usePin: string;
    optional: string;
  }
> = {
  en: {
    hello: (name) => `Hello, ${name}`,
    today: (sites) => `Today · ${sites} site${sites === 1 ? "" : "s"}`,
    noSitesToday: "No sites on your schedule today.",
    doneToday: "Done today",
    photos: "Photos",
    problem: "Problem",
    extraJob: "Extra job",
    supplies: "Supplies",
    myRequests: "My requests",
    waiting: (count) => `${count} waiting`,
    more: "More",
    back: "Back",
    send: "Send",
    sending: "Sending…",
    sent: "Sent ✓",
    sentText: "We have it. Thank you!",
    pickSite: "Which site?",
    photo: "Photo",
    talk: "Talk",
    listening: "Listening… tap to stop",
    before: "Before",
    after: "After",
    takePhoto: "Take photo",
    anotherPhoto: "Another photo",
    retrying: "Weak signal. Trying again…",
    whatHappened: "What happened?",
    problems: { cantGetIn: "Can't get in", broken: "Broken", noSupplies: "No supplies", damage: "Damage", customer: "Customer", other: "Other" },
    otherItem: "Other item",
    otherItemHint: "Something not on the list",
    nothingPicked: "Tap + on what you need.",
    received: "Received",
    approved: "Approved",
    done: "Done",
    noRequests: "No requests yet. Tap a big button to send one.",
    tryAgain: "Try again",
    notSent: "Not sent. Check your signal and try again.",
    pinTitle: "Your PIN",
    pinNew: "Pick 4 numbers you will remember",
    pinAgain: "Type them again",
    pinWrong: (left) => `Not that one. ${left} tr${left === 1 ? "y" : "ies"} left.`,
    pinLocked: (minutes) => `Too many tries. Wait ${minutes} minutes.`,
    pinNoMatch: "Those did not match. Start again.",
    useEmail: "Use my email instead",
    usePin: "Use my PIN",
    optional: "optional",
  },
  es: {
    hello: (name) => `Hola, ${name}`,
    today: (sites) => `Hoy · ${sites} lugar${sites === 1 ? "" : "es"}`,
    noSitesToday: "Hoy no tienes lugares en tu horario.",
    doneToday: "Hecho hoy",
    photos: "Fotos",
    problem: "Problema",
    extraJob: "Trabajo extra",
    supplies: "Suministros",
    myRequests: "Mis pedidos",
    waiting: (count) => `${count} en espera`,
    more: "Más",
    back: "Atrás",
    send: "Enviar",
    sending: "Enviando…",
    sent: "Enviado ✓",
    sentText: "Lo tenemos. ¡Gracias!",
    pickSite: "¿Qué lugar?",
    photo: "Foto",
    talk: "Hablar",
    listening: "Escuchando… toca para parar",
    before: "Antes",
    after: "Después",
    takePhoto: "Tomar foto",
    anotherPhoto: "Otra foto",
    retrying: "Señal débil. Intentando otra vez…",
    whatHappened: "¿Qué pasó?",
    problems: { cantGetIn: "No puedo entrar", broken: "Roto", noSupplies: "Sin suministros", damage: "Daño", customer: "Cliente", other: "Otro" },
    otherItem: "Otra cosa",
    otherItemHint: "Algo que no está en la lista",
    nothingPicked: "Toca + en lo que necesitas.",
    received: "Recibido",
    approved: "Aprobado",
    done: "Hecho",
    noRequests: "Todavía no hay pedidos. Toca un botón grande para enviar uno.",
    tryAgain: "Intentar otra vez",
    notSent: "No se envió. Revisa tu señal e intenta otra vez.",
    pinTitle: "Tu PIN",
    pinNew: "Elige 4 números que vas a recordar",
    pinAgain: "Escríbelos otra vez",
    pinWrong: (left) => `Ese no es. Te queda${left === 1 ? "" : "n"} ${left} intento${left === 1 ? "" : "s"}.`,
    pinLocked: (minutes) => `Demasiados intentos. Espera ${minutes} minutos.`,
    pinNoMatch: "No son iguales. Empieza otra vez.",
    useEmail: "Usar mi correo",
    usePin: "Usar mi PIN",
    optional: "opcional",
  },
  pt: {
    hello: (name) => `Olá, ${name}`,
    today: (sites) => `Hoje · ${sites} loca${sites === 1 ? "l" : "is"}`,
    noSitesToday: "Hoje não há locais na sua agenda.",
    doneToday: "Feito hoje",
    photos: "Fotos",
    problem: "Problema",
    extraJob: "Trabalho extra",
    supplies: "Materiais",
    myRequests: "Meus pedidos",
    waiting: (count) => `${count} em espera`,
    more: "Mais",
    back: "Voltar",
    send: "Enviar",
    sending: "Enviando…",
    sent: "Enviado ✓",
    sentText: "Recebemos. Obrigado!",
    pickSite: "Qual local?",
    photo: "Foto",
    talk: "Falar",
    listening: "Ouvindo… toque para parar",
    before: "Antes",
    after: "Depois",
    takePhoto: "Tirar foto",
    anotherPhoto: "Outra foto",
    retrying: "Sinal fraco. Tentando de novo…",
    whatHappened: "O que aconteceu?",
    problems: { cantGetIn: "Não consigo entrar", broken: "Quebrado", noSupplies: "Sem materiais", damage: "Dano", customer: "Cliente", other: "Outro" },
    otherItem: "Outro item",
    otherItemHint: "Algo que não está na lista",
    nothingPicked: "Toque em + no que você precisa.",
    received: "Recebido",
    approved: "Aprovado",
    done: "Feito",
    noRequests: "Ainda não há pedidos. Toque num botão grande para enviar um.",
    tryAgain: "Tentar de novo",
    notSent: "Não foi enviado. Verifique o sinal e tente de novo.",
    pinTitle: "Seu PIN",
    pinNew: "Escolha 4 números que você vai lembrar",
    pinAgain: "Digite de novo",
    pinWrong: (left) => `Não é esse. Resta${left === 1 ? "" : "m"} ${left} tentativa${left === 1 ? "" : "s"}.`,
    pinLocked: (minutes) => `Muitas tentativas. Espere ${minutes} minutos.`,
    pinNoMatch: "Não são iguais. Comece de novo.",
    useEmail: "Usar meu e-mail",
    usePin: "Usar meu PIN",
    optional: "opcional",
  },
};
