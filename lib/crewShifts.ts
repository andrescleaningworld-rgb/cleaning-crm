// CW Now shifts: the words and the clock. Plain TS, safe in the browser.
// Server side: lib/pg/crew-shifts.ts.

import type { CrewLang } from "@/lib/crewLinkPeople";

export type CrewShift = { startTime: string; endTime: string; textOn: boolean };

/** How long after the shift's start a late cron run may still send its text. */
export const SHIFT_TEXT_WINDOW_MINUTES = 20;
/** The missed-checklist pin goes up from this time, the morning after. */
export const MISSED_PIN_FROM_MINUTES = 8 * 60;
export const DAY_MINUTES = 24 * 60;

export function cleanShiftTime(value: unknown): string {
  const match = /^(\d{1,2}):(\d{2})$/.exec(String(value ?? "").trim());
  if (!match || Number(match[1]) > 23 || Number(match[2]) > 59) return "";
  return `${match[1].padStart(2, "0")}:${match[2]}`;
}

export const minutesOf = (time: string) => {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
};

/** Minutes from the start of the shift's day to its end. A shift past midnight ends the next day. */
export function shiftEndMinutes(startTime: string, endTime: string): number {
  const start = minutesOf(startTime);
  const end = minutesOf(endTime);
  return end > start ? end : end + DAY_MINUTES;
}

export function shiftTimeLabel(time: string): string {
  const minutes = minutesOf(time);
  const hours = Math.floor(minutes / 60);
  const shown = hours % 12 || 12;
  return `${shown}:${String(minutes % 60).padStart(2, "0")} ${hours < 12 ? "AM" : "PM"}`;
}

const WORDS: Record<CrewLang, { start: (place: string) => string; link: string; noLink: string }> = {
  en: { start: (place) => `Cleaning World: your shift at ${place} starts now.`, link: "Your checklist:", noLink: "Open your CW Now checklist and send it when you finish." },
  es: { start: (place) => `Cleaning World: tu turno en ${place} empieza ahora.`, link: "Tu lista:", noLink: "Abre tu lista de CW Now y enviala al terminar." },
  pt: { start: (place) => `Cleaning World: seu turno em ${place} comeca agora.`, link: "Sua lista:", noLink: "Abra sua lista do CW Now e envie ao terminar." },
};

/** The short shift-start text. `url` is "" while links are blocked. Plain letters only: the text cleaner deletes accents. */
export function shiftText(language: CrewLang, place: string, url: string): string {
  const words = WORDS[language];
  const name = place.normalize("NFD").replace(/[̀-ͯ]/g, "").trim();
  return [words.start(name), url ? `${words.link} ${url}` : words.noLink].join("\n");
}

export const missedPinTitle = (accountName: string) => `${accountName}: no checklist last night`;
