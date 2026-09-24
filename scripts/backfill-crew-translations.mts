/**
 * One-time (and safe to repeat) backfill of Spanish + Portuguese for every
 * crew-facing text that has no translation yet — same function the app runs
 * after each save (lib/crewTranslations.ts translateMissingCrewContent), so
 * texts already translated are never sent again.
 *
 * Usage (needs scripts/setup-content-translations-db.js --apply first):
 *   npx tsx --env-file=.env.local scripts/backfill-crew-translations.mts           # read-only count (default)
 *   npx tsx --env-file=.env.local scripts/backfill-crew-translations.mts --apply   # translate
 */
import { collectCrewTexts, findMissingTranslations, translateMissingCrewContent, CREW_CONTENT_LANGS } from "@/lib/crewTranslations";
import { getSql } from "@/lib/db";

const apply = process.argv.includes("--apply");
const sql = getSql();
const [{ exists }] = await sql`SELECT to_regclass('public.content_translations') IS NOT NULL AS exists`;
const texts = await collectCrewTexts();
const missing = exists ? await findMissingTranslations(texts) : { es: texts, pt: texts };
const total = CREW_CONTENT_LANGS.reduce((n, lang) => n + missing[lang].length, 0);
console.log(apply ? "== APPLY ==" : "== DRY RUN (read-only) — pass --apply to translate ==");
console.log(`unique crew-facing texts: ${texts.length}`);
for (const lang of CREW_CONTENT_LANGS) console.log(`  missing ${lang.toUpperCase()}: ${missing[lang].length} (${Math.ceil(missing[lang].length / 40)} model call(s))`);
console.log(`total translations to make: ${total}`);
if (apply && !exists) {
  console.error("content_translations doesn't exist — run scripts/setup-content-translations-db.js --apply first.");
  process.exitCode = 1;
} else if (apply) {
  const result = await translateMissingCrewContent();
  console.log(`translated: ${result.translated}, failed (retry later): ${result.failed}`);
}
