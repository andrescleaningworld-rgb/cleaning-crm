// The AI task page of a CW Now to-do (FEATURE_AI_TASK_PAGE, migration 088):
// a few big, simple lines for a crew on a phone. Plain TS, safe in the browser.
// It never holds prices, sub pay or office notes.

import type { CrewLang } from "@/lib/crewLinkPeople";

export type TaskPage = {
  title: string;
  steps: string[];
  when: string;
  bring: string[];
  photosBefore: string;
  photosAfter: string;
  call: string;
};

/** English is what the office checked. Spanish and Portuguese are made from it. */
export type TaskPages = { en: TaskPage } & Partial<Record<"es" | "pt", TaskPage>>;

export const TASK_PAGE_MAX_STEPS = 8;
export const TASK_PAGE_MAX_BRING = 8;
const LINE_MAX = 160;

const line = (value: unknown) => String(value ?? "").replace(/\s+/g, " ").trim().slice(0, LINE_MAX);
const list = (value: unknown, max: number) => (Array.isArray(value) ? value.map(line).filter(Boolean).slice(0, max) : []);

/** Only the page's fields, trimmed. Null when it has no title or no steps. */
export function cleanTaskPage(value: unknown): TaskPage | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const page: TaskPage = {
    title: line(raw.title),
    steps: list(raw.steps, TASK_PAGE_MAX_STEPS),
    when: line(raw.when),
    bring: list(raw.bring, TASK_PAGE_MAX_BRING),
    photosBefore: line(raw.photosBefore),
    photosAfter: line(raw.photosAfter),
    call: line(raw.call),
  };
  return page.title && page.steps.length > 0 ? page : null;
}

/** Money or office words. These never go on a page the sub sees or prints. */
const OFFICE_ONLY = /[$€£]\s?\d|\b\d+(?:[.,]\d+)?\s?(?:dollars?|d[oó]lares|reais)\b|\b(?:sub\s?pay|customer price|invoice|invoiced|margin|commission|markup|internal note|office note|factura|comisi[oó]n|fatura|comiss[aã]o)\b/i;

const pageLines = (page: TaskPage) => [page.title, page.when, page.photosBefore, page.photosAfter, page.call, ...page.steps, ...page.bring];

export const hasOfficeOnlyWords = (text: string) => OFFICE_ONLY.test(text);

/** The first line that must come off the page, or "". */
export const officeOnlyLine = (page: TaskPage) => pageLines(page).find(hasOfficeOnlyWords) ?? "";

/** The page without any line holding money or office words. */
export function stripOfficeOnly(page: TaskPage): TaskPage {
  const keep = (text: string) => (hasOfficeOnlyWords(text) ? "" : text);
  return {
    title: keep(page.title) || "Task",
    steps: page.steps.filter((text) => !hasOfficeOnlyWords(text)),
    when: keep(page.when),
    bring: page.bring.filter((text) => !hasOfficeOnlyWords(text)),
    photosBefore: keep(page.photosBefore),
    photosAfter: keep(page.photosAfter),
    call: keep(page.call),
  };
}

export function readTaskPages(value: unknown): TaskPages | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const en = cleanTaskPage(raw.en);
  if (!en) return null;
  const es = cleanTaskPage(raw.es);
  const pt = cleanTaskPage(raw.pt);
  return { en, ...(es ? { es } : {}), ...(pt ? { pt } : {}) };
}

export const pageFor = (pages: TaskPages, lang: CrewLang): TaskPage => (lang === "en" ? pages.en : pages[lang] ?? pages.en);

export const TASK_PAGE_WORDS: Record<CrewLang, { steps: string; when: string; bring: string; before: string; after: string; call: string }> = {
  en: { steps: "What to do", when: "When", bring: "Bring or use", before: "Photo before", after: "Photo after", call: "Questions? Call" },
  es: { steps: "Qué hacer", when: "Cuándo", bring: "Lleva o usa", before: "Foto antes", after: "Foto después", call: "¿Preguntas? Llama a" },
  pt: { steps: "O que fazer", when: "Quando", bring: "Leve ou use", before: "Foto antes", after: "Foto depois", call: "Dúvidas? Ligue para" },
};
