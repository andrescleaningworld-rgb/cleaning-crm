// Spanish + Portuguese for crew-facing CONTENT (checklist tabs/sections/
// items, Team Hub library items and rounds, supply items) — stored in
// Postgres content_translations, keyed by the normalized English text
// (lib/translationKey.ts), so an unchanged text is never translated twice.
// A manager's correction (manual_text) always wins over the automatic
// translation (auto_text); a missing translation falls back to English.
//
// translateMissingCrewContent() is the only writer of auto_text: it gathers
// every crew-facing text, finds the (text, language) pairs that have no
// translation yet, and translates just those. It runs after every save that
// can change crew content (scheduleCrewTranslations → waitUntil), and from
// scripts/backfill-crew-translations.mts. A failed batch simply stays
// missing and is retried the next time either runs.
//
// Postgres only; no Sheets access.
import { waitUntil } from "@vercel/functions";
import { getSql } from "@/lib/db";
import { translateBatch, type CrewContentLang } from "@/lib/translate";
import { translationKey, type ContentTranslations } from "@/lib/translationKey";
import type { ChecklistSectionDef } from "@/lib/checklistTemplate";

export const CREW_CONTENT_LANGS: CrewContentLang[] = ["es", "pt"];
const BATCH_SIZE = 40;

function addSectionTexts(out: Set<string>, sections: ChecklistSectionDef[] | null | undefined) {
  for (const section of sections ?? []) {
    out.add(translationKey(section.title ?? ""));
    for (const item of section.items ?? []) {
      out.add(translationKey(item.label ?? ""));
      if (item.subNote) out.add(translationKey(item.subNote));
    }
  }
}

// Every text a crew can see, normalized, no blanks.
export async function collectCrewTexts(): Promise<string[]> {
  const sql = getSql();
  const [tabs, templates, library, rounds, supplies, labels] = await Promise.all([
    sql`SELECT name, sections_json FROM checklist_tabs WHERE deleted_at IS NULL`,
    sql`SELECT sections_json FROM checklist_templates`,
    sql`SELECT area, text FROM hub_checklist_library WHERE active`,
    sql`SELECT name FROM hub_round_library WHERE active`,
    sql`SELECT name, unit FROM supply_items WHERE active`,
    sql`SELECT DISTINCT instance_label FROM hub_crew_items WHERE enabled AND instance_label IS NOT NULL`,
  ]);
  const out = new Set<string>();
  for (const t of tabs) {
    out.add(translationKey(t.name as string));
    addSectionTexts(out, t.sections_json as ChecklistSectionDef[]);
  }
  for (const t of templates) addSectionTexts(out, t.sections_json as ChecklistSectionDef[]);
  for (const l of library) {
    out.add(translationKey(l.area as string));
    out.add(translationKey(l.text as string));
  }
  for (const r of rounds) out.add(translationKey(r.name as string));
  for (const s of supplies) {
    out.add(translationKey(s.name as string));
    out.add(translationKey(s.unit as string));
  }
  for (const l of labels) out.add(translationKey(l.instance_label as string));
  out.delete("");
  return [...out];
}

// (text, lang) pairs with neither an automatic nor a manual translation.
export async function findMissingTranslations(texts: string[]): Promise<Record<CrewContentLang, string[]>> {
  const sql = getSql();
  const rows = texts.length
    ? await sql`
        SELECT source_text, lang FROM content_translations
        WHERE source_text = ANY(${texts}) AND (auto_text IS NOT NULL OR manual_text IS NOT NULL)
      `
    : [];
  const have = new Set(rows.map((r) => `${r.lang as string}\u0000${r.source_text as string}`));
  const missing = { es: [] as string[], pt: [] as string[] };
  for (const lang of CREW_CONTENT_LANGS) {
    for (const text of texts) if (!have.has(`${lang}\u0000${text}`)) missing[lang].push(text);
  }
  return missing;
}

export async function translateMissingCrewContent(): Promise<{ translated: number; failed: number }> {
  const sql = getSql();
  const missing = await findMissingTranslations(await collectCrewTexts());
  let translated = 0;
  let failed = 0;
  for (const lang of CREW_CONTENT_LANGS) {
    const texts = missing[lang];
    for (let i = 0; i < texts.length; i += BATCH_SIZE) {
      const chunk = texts.slice(i, i + BATCH_SIZE);
      const result = await translateBatch(chunk, lang);
      if (!result) {
        failed += chunk.length;
        continue;
      }
      await sql.transaction(
        chunk.map(
          (text, j) => sql`
            INSERT INTO content_translations (source_text, lang, auto_text)
            VALUES (${text}, ${lang}, ${result[j]})
            ON CONFLICT (source_text, lang) DO UPDATE SET auto_text = EXCLUDED.auto_text, updated_at = now()
          `
        )
      );
      translated += chunk.length;
    }
  }
  return { translated, failed };
}

// Call after any save that can change crew content. Never blocks or fails
// the save; whatever doesn't get translated is retried next time.
export function scheduleCrewTranslations(): void {
  waitUntil(
    translateMissingCrewContent()
      .then(({ failed }) => {
        if (failed) console.error(`[crew translations] ${failed} text(s) not translated; will retry on next save/backfill`);
      })
      .catch((error) => console.error("[crew translations]", error))
  );
}

// ─── Reads ───────────────────────────────────────────────────────────────

// For crew screens: the ES/PT text for each given English text (manual
// correction first, else automatic). Missing entries → caller shows English.
export async function getContentTranslations(texts: string[]): Promise<ContentTranslations> {
  const keys = [...new Set(texts.map(translationKey))].filter(Boolean);
  if (keys.length === 0) return {};
  const sql = getSql();
  let rows: Record<string, unknown>[];
  try {
    rows = await sql`
      SELECT source_text, lang, COALESCE(manual_text, auto_text) AS text FROM content_translations
      WHERE source_text = ANY(${keys}) AND COALESCE(manual_text, auto_text) IS NOT NULL
    `;
  } catch (error) {
    // Never break a crew screen over translations — English is the fallback.
    console.error("[crew translations] read failed:", error);
    return {};
  }
  const map: ContentTranslations = {};
  for (const r of rows) {
    const key = r.source_text as string;
    map[key] = { ...(map[key] ?? {}), [r.lang as CrewContentLang]: r.text as string };
  }
  return map;
}

export function sectionTexts(sections: ChecklistSectionDef[]): string[] {
  const out = new Set<string>();
  addSectionTexts(out, sections);
  out.delete("");
  return [...out];
}

export type TranslationReviewRow = {
  text: string;
  es: { auto: string | null; manual: string | null };
  pt: { auto: string | null; manual: string | null };
};

// Manager "Review translations": every text on one account's Crew Link
// checklist tabs, in checklist order.
export async function listAccountTranslationsForReview(accountId: string): Promise<TranslationReviewRow[]> {
  const sql = getSql();
  const tabs = await sql`
    SELECT name, sections_json FROM checklist_tabs
    WHERE account_id = ${accountId} AND deleted_at IS NULL ORDER BY position, id
  `;
  const ordered: string[] = [];
  const seen = new Set<string>();
  const push = (text: string) => {
    const key = translationKey(text);
    if (key && !seen.has(key)) {
      seen.add(key);
      ordered.push(key);
    }
  };
  for (const tab of tabs) {
    push(tab.name as string);
    for (const section of (tab.sections_json as ChecklistSectionDef[]) ?? []) {
      push(section.title ?? "");
      for (const item of section.items ?? []) {
        push(item.label ?? "");
        if (item.subNote) push(item.subNote);
      }
    }
  }
  if (ordered.length === 0) return [];
  const rows = await sql`SELECT source_text, lang, auto_text, manual_text FROM content_translations WHERE source_text = ANY(${ordered})`;
  const byKey = new Map<string, TranslationReviewRow>();
  for (const text of ordered) byKey.set(text, { text, es: { auto: null, manual: null }, pt: { auto: null, manual: null } });
  for (const r of rows) {
    const row = byKey.get(r.source_text as string);
    const lang = r.lang as CrewContentLang;
    if (row && (lang === "es" || lang === "pt")) row[lang] = { auto: (r.auto_text as string | null) ?? null, manual: (r.manual_text as string | null) ?? null };
  }
  return ordered.map((text) => byKey.get(text)!);
}

// A manager's correction; empty value = remove the correction (back to the
// automatic translation).
export async function setManualTranslation(text: string, lang: CrewContentLang, value: string): Promise<void> {
  const key = translationKey(text);
  const manual = value.trim() ? value.trim().slice(0, 1000) : null;
  const sql = getSql();
  await sql`
    INSERT INTO content_translations (source_text, lang, manual_text)
    VALUES (${key}, ${lang}, ${manual})
    ON CONFLICT (source_text, lang) DO UPDATE SET manual_text = EXCLUDED.manual_text, updated_at = now()
  `;
}
