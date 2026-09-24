// The one way a crew-facing text becomes a translation key (Postgres
// content_translations.source_text) — trimmed, inner whitespace collapsed —
// used on insert, lookup and in the browser, so "Mop  floors " and
// "Mop floors" share one translation. Client-safe (no server imports).
export function translationKey(text: string): string {
  return String(text ?? "").trim().replace(/\s+/g, " ");
}

// Crew screens: English text → { es, pt } for everything on the screen.
export type ContentTranslations = Record<string, { es?: string; pt?: string }>;

// The text to show in `lang`: the stored translation, else the English.
export function translated(map: ContentTranslations | undefined, text: string, lang: "en" | "es" | "pt"): string {
  if (lang === "en" || !map) return text;
  return map[translationKey(text)]?.[lang] || text;
}
