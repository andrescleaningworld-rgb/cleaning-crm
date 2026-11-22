// CW Now to-dos for subs: the words, rules and shapes shared by the Pin Board,
// the sub's task screen and the server. Plain TS with no server imports.
// Database side: lib/pg/cw-now-tasks.ts (migration 087).

import type { CrewLang } from "@/lib/crewLinkPeople";

export type CwNowStatus = "needs_link" | "sent" | "seen" | "done" | "cancelled";
export type CwNowPriority = "normal" | "urgent";
export type CwNowShareMethod = "text" | "copy" | "whatsapp" | "email";

export const isCwNowShareMethod = (value: unknown): value is CwNowShareMethod => value === "text" || value === "copy" || value === "whatsapp" || value === "email";
export const isOpenTask = (status: CwNowStatus) => status !== "done" && status !== "cancelled";

export const CW_NOW_STATUS_LABEL: Record<CwNowStatus, string> = {
  needs_link: "Needs link",
  sent: "Sent",
  seen: "Seen",
  done: "Done",
  cancelled: "Cancelled",
};

/** What a task's paper carries on the board. Never the private link. */
export type CwNowPaper = { taskId: number; status: CwNowStatus; urgent: boolean; noPhone: boolean; hasNote: boolean };

/** "Sent ✓ · Seen · Done": how far it got, for the pin. */
export function cwNowStepsLine(status: CwNowStatus): string {
  if (status === "needs_link" || status === "cancelled") return CW_NOW_STATUS_LABEL[status];
  const reached = ["sent", "seen", "done"].indexOf(status);
  return (["Sent", "Seen", "Done"] as const).map((word, index) => (index <= reached ? `${word} ✓` : word)).join(" · ");
}

export const TASK_MAX = 2000;
export const TASK_NOTE_MAX = 1000;
export const TASK_MAX_FILES = 10;
export const TASK_FOLDER = "cw-now-tasks";
export const TASK_OFFICE_FOLDER = `${TASK_FOLDER}/office`;
export const taskSubFolder = (taskId: number) => `${TASK_FOLDER}/${taskId}/sub`;
/** The private link is 24 random bytes in URL-safe letters. */
export const isTaskToken = (value: string) => /^[A-Za-z0-9_-]{32}$/.test(value);

/* ---------- files: every common type, never a web page or script ---------- */

export const TASK_FILE_ACCEPT = ".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.csv,.txt,.rtf,.zip,.jpg,.jpeg,.png,.webp,.heic,.heif,.gif,.mp4,.mov";
export const TASK_FILE_EXTENSIONS = /\.(pdf|docx?|xlsx?|pptx?|csv|txt|rtf|zip|jpe?g|png|webp|heic|heif|gif|mp4|mov)$/i;
export const TASK_VIDEO_EXTENSIONS = /\.(mp4|mov)$/i;
export const TASK_FILE_MAX_BYTES = 25 * 1024 * 1024;
export const TASK_VIDEO_MAX_BYTES = 100 * 1024 * 1024;
export const TASK_FILE_TYPES = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "text/csv",
  "text/plain",
  "application/rtf",
  "text/rtf",
  "application/zip",
  "application/x-zip-compressed",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
  "image/gif",
  "video/mp4",
  "video/quicktime",
  // Some phones and browsers send no type; the file's ending is checked instead.
  "application/octet-stream",
];

/* ---------- dates ---------- */

const LOCALE: Record<CrewLang, string> = { en: "en-US", es: "es-US", pt: "pt-BR" };

/** "HH:MM" (24 hours) or "". */
export function cleanTaskTime(value: unknown): string {
  const match = /^(\d{1,2}):(\d{2})$/.exec(String(value ?? "").trim());
  if (!match || Number(match[1]) > 23 || Number(match[2]) > 59) return "";
  return `${match[1].padStart(2, "0")}:${match[2]}`;
}

/** "Mon, Nov 24, 10:30 AM" in the reader's language. The date and time are office time, shown as written. */
export function taskDueText(dueDate: string, dueTime: string, lang: CrewLang): string {
  const time = cleanTaskTime(dueTime);
  const at = new Date(`${dueDate}T${time || "12:00"}:00Z`);
  if (Number.isNaN(at.getTime())) return dueDate;
  return at.toLocaleString(LOCALE[lang], { timeZone: "UTC", weekday: "short", month: "short", day: "numeric", ...(time ? { hour: "numeric", minute: "2-digit" } : {}) });
}

/** A New York wall-clock date and time as the real moment. */
function officeMoment(dueDate: string, time: string): Date {
  const guess = new Date(`${dueDate}T${time}:00Z`);
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })
      .formatToParts(guess)
      .map((part) => [part.type, part.value])
  );
  const shown = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute));
  return new Date(guess.getTime() + (guess.getTime() - shown));
}

/* ---------- the phone calendar file ---------- */

const icsText = (text: string) => text.replace(/\\/g, "\\\\").replace(/\r?\n/g, "\\n").replace(/([,;])/g, "\\$1");
const icsStamp = (at: Date) => at.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");

/** Calendar lines may be at most 75 bytes; longer ones continue on the next line after a space. */
function foldIcsLine(line: string): string {
  const encoder = new TextEncoder();
  const out: string[] = [];
  let current = "";
  let bytes = 0;
  for (const letter of line) {
    const size = encoder.encode(letter).length;
    if (bytes + size > 73) {
      out.push(current);
      current = " ";
      bytes = 1;
    }
    current += letter;
    bytes += size;
  }
  out.push(current);
  return out.join("\r\n");
}

export function taskIcs(input: { taskId: number; title: string; description: string; location: string; dueDate: string; dueTime: string; now?: Date }): string {
  const time = cleanTaskTime(input.dueTime);
  const day = input.dueDate.replace(/-/g, "");
  let when: string[];
  if (time) {
    const start = officeMoment(input.dueDate, time);
    when = [`DTSTART:${icsStamp(start)}`, `DTEND:${icsStamp(new Date(start.getTime() + 60 * 60_000))}`];
  } else {
    const next = new Date(`${input.dueDate}T12:00:00Z`);
    next.setUTCDate(next.getUTCDate() + 1);
    when = [`DTSTART;VALUE=DATE:${day}`, `DTEND;VALUE=DATE:${next.toISOString().slice(0, 10).replace(/-/g, "")}`];
  }
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Cleaning World//CW Now//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:cw-now-task-${input.taskId}@cleaningworld`,
    `DTSTAMP:${icsStamp(input.now ?? new Date())}`,
    ...when,
    `SUMMARY:${icsText(input.title)}`,
    ...(input.description ? [`DESCRIPTION:${icsText(input.description)}`] : []),
    ...(input.location ? [`LOCATION:${icsText(input.location)}`] : []),
    "BEGIN:VALARM",
    "ACTION:DISPLAY",
    `DESCRIPTION:${icsText(input.title)}`,
    `TRIGGER:${time ? "-PT1H" : "PT9H"}`,
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return `${lines.map(foldIcsLine).join("\r\n")}\r\n`;
}

/* ---------- messages to the sub ---------- */

/** The text's letters without accents: our text cleaner deletes accented letters ("Olá" would become "Ol"). */
export const plainLetters = (text: string) => text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/ñ/g, "n").replace(/Ñ/g, "N");

export type TaskTextKind = "new" | "tomorrow" | "today";

const TEXT_WORDS: Record<CrewLang, Record<TaskTextKind, string> & { due: string; linkComing: string; useLink: string; inPortal: string }> = {
  en: { new: "New task", tomorrow: "Reminder: due tomorrow", today: "Reminder: due today", due: "Due", linkComing: "We will send you the link.", useLink: "Use the link we sent you.", inPortal: "See it in My to-dos in your portal." },
  es: { new: "Nueva tarea", tomorrow: "Recordatorio: vence manana", today: "Recordatorio: vence hoy", due: "Fecha", linkComing: "Te enviaremos el enlace.", useLink: "Usa el enlace que te enviamos.", inPortal: "Mirala en Mis tareas en tu portal." },
  pt: { new: "Nova tarefa", tomorrow: "Lembrete: vence amanha", today: "Lembrete: vence hoje", due: "Prazo", linkComing: "Vamos enviar o link.", useLink: "Use o link que enviamos.", inPortal: "Veja em Minhas tarefas no seu portal." },
};

/** The text to the sub. `url` is "" while links are blocked; `inPortal`: the task is in their My to-dos, so the text says so. */
export function taskSmsText(kind: TaskTextKind, lang: CrewLang, accountName: string, dueDate: string, dueTime: string, url: string, inPortal = false): string {
  const words = TEXT_WORDS[lang];
  const last = url || (inPortal ? words.inPortal : kind === "new" ? words.linkComing : words.useLink);
  return plainLetters(`Cleaning World - ${words[kind]}\n${accountName}\n${words.due}: ${taskDueText(dueDate, dueTime, lang)}\n${last}`);
}

/** The message for Share (WhatsApp, Text, Copy, Email), always with the link. */
export function taskShareMessage(lang: CrewLang, name: string, accountName: string, dueDate: string, dueTime: string, url: string): string {
  const who = name.trim().split(/\s+/)[0] ?? "";
  const due = taskDueText(dueDate, dueTime, lang);
  if (lang === "es") return `Hola${who ? ` ${who}` : ""}, somos Cleaning World. Tienes una tarea en ${accountName}. Fecha: ${due}. Ábrela aquí y toca Listo: ${url}`;
  if (lang === "pt") return `Olá${who ? ` ${who}` : ""}, aqui é a Cleaning World. Você tem uma tarefa em ${accountName}. Prazo: ${due}. Abra aqui e toque em Feito: ${url}`;
  return `Hi${who ? ` ${who}` : ""}, this is Cleaning World. You have a task at ${accountName}. Due: ${due}. Open it here and tap Done: ${url}`;
}

export const TASK_EMAIL_SUBJECT: Record<CrewLang, (accountName: string) => string> = {
  en: (name) => `New task: ${name}`,
  es: (name) => `Nueva tarea: ${name}`,
  pt: (name) => `Nova tarefa: ${name}`,
};

/* ---------- the sub's screen ---------- */

export const TASK_WORDS: Record<CrewLang, {
  loading: string; goneTitle: string; goneBody: string; failed: string; urgent: string; due: string; task: string; original: string; files: string;
  done: string; doneTitle: string; doneAlready: string; ok: string; addNote: string; addPhoto: string; calendar: string; yourName: string; next: string;
  notePlaceholder: string; send: string; cancel: string; sending: string; saved: string; yourNotes: string; photoFailed: string;
}> = {
  en: { loading: "Loading…", goneTitle: "This task is closed", goneBody: "Call the office if you need it.", failed: "It did not save. Try again.", urgent: "URGENT", due: "Due", task: "Task", original: "Original", files: "Files", done: "DONE", doneTitle: "Done!", doneAlready: "This task is done ✓", ok: "OK", addNote: "Add a note", addPhoto: "Add a photo", calendar: "Add to my calendar", yourName: "Your name", next: "Next", notePlaceholder: "Write here", send: "Send", cancel: "Cancel", sending: "Sending…", saved: "Sent ✓", yourNotes: "Sent to the office", photoFailed: "The photo did not send. Try again." },
  es: { loading: "Cargando…", goneTitle: "Esta tarea está cerrada", goneBody: "Llama a la oficina si la necesitas.", failed: "No se guardó. Inténtalo de nuevo.", urgent: "URGENTE", due: "Fecha", task: "Tarea", original: "Original", files: "Archivos", done: "LISTO", doneTitle: "¡Listo!", doneAlready: "Esta tarea está lista ✓", ok: "OK", addNote: "Agregar nota", addPhoto: "Agregar foto", calendar: "Agregar a mi calendario", yourName: "Tu nombre", next: "Siguiente", notePlaceholder: "Escribe aquí", send: "Enviar", cancel: "Cancelar", sending: "Enviando…", saved: "Enviado ✓", yourNotes: "Enviado a la oficina", photoFailed: "La foto no se envió. Inténtalo de nuevo." },
  pt: { loading: "Carregando…", goneTitle: "Esta tarefa está fechada", goneBody: "Ligue para o escritório se precisar.", failed: "Não salvou. Tente de novo.", urgent: "URGENTE", due: "Prazo", task: "Tarefa", original: "Original", files: "Arquivos", done: "FEITO", doneTitle: "Feito!", doneAlready: "Esta tarefa está feita ✓", ok: "OK", addNote: "Adicionar nota", addPhoto: "Adicionar foto", calendar: "Adicionar ao calendário", yourName: "Seu nome", next: "Próximo", notePlaceholder: "Escreva aqui", send: "Enviar", cancel: "Cancelar", sending: "Enviando…", saved: "Enviado ✓", yourNotes: "Enviado ao escritório", photoFailed: "A foto não foi enviada. Tente de novo." },
};

/** What the sub's screen gets: this one task, nothing about money or other accounts. */
export type PublicTask = {
  accountName: string;
  location: string;
  task: string;
  translations: Partial<Record<CrewLang, string>>;
  dueDate: string;
  dueTime: string;
  urgent: boolean;
  status: CwNowStatus;
  language: CrewLang;
  /** FEATURE_MY_TODOS: the due date is shown in its color (today yellow, late red, done green). */
  dueColors?: boolean;
  /** Photos can be added: the private file store is connected. */
  canAddPhoto: boolean;
  uploadFolder: string;
  files: { id: number; name: string; url: string; size: number; contentType: string }[];
  notes: { text: string; at: string }[];
  photos: { id: number; url: string }[];
};

/* ---------- due dates: today yellow, late red, done green ---------- */

export type TaskDueState = "done" | "overdue" | "today" | "later";

/** Today in the office (New York), "YYYY-MM-DD". */
export function officeToday(now = new Date()): string {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" })
      .formatToParts(now)
      .map((part) => [part.type, part.value])
  );
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function taskDueState(dueDate: string, status: CwNowStatus, today = officeToday()): TaskDueState {
  if (status === "done") return "done";
  if (dueDate < today) return "overdue";
  return dueDate === today ? "today" : "later";
}

export const DUE_STYLE: Record<TaskDueState, { background: string; borderColor: string; color: string }> = {
  done: { background: "#dcfce7", borderColor: "#16a34a", color: "#14532d" },
  overdue: { background: "#fee2e2", borderColor: "#dc2626", color: "#7f1d1d" },
  today: { background: "#fef08a", borderColor: "#ca8a04", color: "#713f12" },
  later: { background: "#ffffff", borderColor: "#cbd5e1", color: "#0f172a" },
};

export const DUE_WORDS: Record<CrewLang, Record<TaskDueState, string>> = {
  en: { done: "Done ✓", overdue: "LATE", today: "DUE TODAY", later: "Due" },
  es: { done: "Listo ✓", overdue: "ATRASADA", today: "VENCE HOY", later: "Fecha" },
  pt: { done: "Feito ✓", overdue: "ATRASADA", today: "VENCE HOJE", later: "Prazo" },
};

/* ---------- "My to-dos" in the Sub Portal ---------- */

/** One task on the sub's own list. Only what the sub may see: never money or office notes. */
export type MyTodo = {
  id: number;
  accountName: string;
  /** Filled in for printing. */
  location: string;
  task: string;
  translations: Partial<Record<CrewLang, string>>;
  dueDate: string;
  dueTime: string;
  urgent: boolean;
  status: CwNowStatus;
  doneAt: string;
  /** The private task page. */
  href: string;
};

export const MY_TODO_WORDS: Record<CrewLang, {
  title: string; none: string; finished: string; noneFinished: string; print: string; printList: string; printFinished: string; open: string; loading: string; failed: string; back: string; urgent: string; account: string; task: string; due: string; status: string; printedOn: string; openStatus: string;
}> = {
  en: { title: "My to-dos", none: "Nothing to do right now.", finished: "Finished (last 30 days)", noneFinished: "Nothing finished yet.", print: "Print", printList: "Print my list", printFinished: "Print finished", open: "Open", loading: "Loading…", failed: "It did not load. Try again.", back: "Back", urgent: "URGENT", account: "Account", task: "Task", due: "Due", status: "Status", printedOn: "Printed", openStatus: "Open" },
  es: { title: "Mis tareas", none: "Nada por hacer ahora.", finished: "Terminadas (últimos 30 días)", noneFinished: "Nada terminado todavía.", print: "Imprimir", printList: "Imprimir mi lista", printFinished: "Imprimir terminadas", open: "Abrir", loading: "Cargando…", failed: "No cargó. Inténtalo de nuevo.", back: "Atrás", urgent: "URGENTE", account: "Cuenta", task: "Tarea", due: "Fecha", status: "Estado", printedOn: "Impreso", openStatus: "Abierta" },
  pt: { title: "Minhas tarefas", none: "Nada para fazer agora.", finished: "Terminadas (últimos 30 dias)", noneFinished: "Nada terminado ainda.", print: "Imprimir", printList: "Imprimir minha lista", printFinished: "Imprimir terminadas", open: "Abrir", loading: "Carregando…", failed: "Não carregou. Tente de novo.", back: "Voltar", urgent: "URGENTE", account: "Conta", task: "Tarefa", due: "Prazo", status: "Situação", printedOn: "Impresso", openStatus: "Aberta" },
};

/** What the office's card on the board gets. */
export type StaffTask = {
  id: number;
  accountId: string;
  accountName: string;
  subName: string;
  task: string;
  dueDate: string;
  dueTime: string;
  urgent: boolean;
  status: CwNowStatus;
  createdBy: string;
  createdAt: string;
  calendarFailed: boolean;
  linksOn: boolean;
  link: string;
  message: string;
  phone: string;
  email: string;
  files: { id: number; source: "office" | "sub"; name: string; url: string; size: number }[];
  events: { id: number; event: string; method: string; detail: string; detailEn: string; by: string; at: string }[];
};
