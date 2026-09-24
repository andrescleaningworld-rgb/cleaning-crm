// Server-only shared translation helper (docs/team-hub-spec.md §12, SHARED
// TRANSLATION — a global rule for every phase, not just Team Hub). Wraps
// Claude Haiku 4.5 via the existing ANTHROPIC_API_KEY credential, same
// zero-arg `new Anthropic()` + `messages.parse()`/zodOutputFormat pattern
// lib/checklistDocumentExtract.ts already uses. Every call has a short
// timeout and never throws — a failure (missing credentials, timeout, rate
// limit, malformed response) returns null so the caller keeps the original
// text untouched. Translation is best-effort, never a blocking dependency
// for a worker/manager write to succeed.
import Anthropic, { APIError } from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";

const MODEL = "claude-haiku-4-5";
const TIMEOUT_MS = 8000;

// Common Spanish function words/accented characters — enough to recognize
// this app's actual bilingual pair (EN/ES, per app/team-hub/teamHubStrings.ts)
// without a network call. Deliberately imprecise: a false negative here just
// means a real API call runs instead of being skipped, never data loss or a
// wrong translation — it only ever widens which text gets a real call.
const SPANISH_HINT = /[áéíóúñ¿¡]|\b(el|la|los|las|una?|para|con|está|están|qué|cómo|baño|piso|sí|hola|gracias)\b/i;

function looksLikeEnglish(text: string): boolean {
  return !SPANISH_HINT.test(text);
}

function looksLikeSpanish(text: string): boolean {
  return SPANISH_HINT.test(text);
}

// True only for the one pair this app actually needs to skip cheaply
// (English <-> Spanish); any other target language always falls through to
// a real call, since there's no cheap heuristic for it here.
function looksAlreadyInLanguage(text: string, lang: string): boolean {
  const normalized = lang.trim().toLowerCase();
  if (normalized === "en") return looksLikeEnglish(text);
  if (normalized === "es") return looksLikeSpanish(text);
  return false;
}

const DetectAndTranslateSchema = z.object({
  detectedLanguage: z.string().describe('ISO 639-1 code of the input text\'s language, e.g. "en" or "es"'),
  english: z.string().describe("The text translated to English. If the input is already English, return it unchanged."),
});

export type DetectAndTranslateResult = { english: string; detectedLanguage: string };

// Detects the language and translates to English in one call — the
// function every worker-written text field goes through before being
// stored (original + english + detectedLanguage, per §12). Always asks the
// model (no keyword guessing — crews write Spanish AND Portuguese, and
// Portuguese often has none of the Spanish hint words); when the model says
// the text is already English, the original is kept verbatim.
export async function translateToEnglish(text: string): Promise<DetectAndTranslateResult | null> {
  const trimmed = text.trim();
  if (!trimmed) return { english: "", detectedLanguage: "en" };

  try {
    const client = new Anthropic();
    const message = await client.messages.parse(
      {
        model: MODEL,
        max_tokens: 1024,
        system: "Detect the language of the user's text and translate it to English. If it is already English, return it unchanged verbatim.",
        messages: [{ role: "user", content: trimmed }],
        output_config: { format: zodOutputFormat(DetectAndTranslateSchema) },
      },
      { timeout: TIMEOUT_MS }
    );
    if (message.stop_reason === "refusal") return null;
    const parsed = message.parsed_output;
    if (!parsed) return null;
    const detectedLanguage = parsed.detectedLanguage.trim().toLowerCase().slice(0, 2);
    return detectedLanguage === "en" ? { english: trimmed, detectedLanguage: "en" } : { english: parsed.english, detectedLanguage };
  } catch (error) {
    console.error("[translate] translateToEnglish failed:", error instanceof APIError ? error.message : error);
    return null;
  }
}

// Translates arbitrary text to `lang` (an ISO 639-1 code, e.g. "es") — used
// to show manager-written text to a crew in that crew's device language.
// Returns the original text unchanged (not null) when it's already
// recognizably in that language, since "no translation needed" isn't a
// failure; returns null only on an actual call failure.
export async function translateTo(text: string, lang: string): Promise<string | null> {
  const trimmed = text.trim();
  if (!trimmed) return trimmed;
  const targetLang = lang.trim().toLowerCase();
  if (looksAlreadyInLanguage(trimmed, targetLang)) return trimmed;

  try {
    const client = new Anthropic();
    const message = await client.messages.create(
      {
        model: MODEL,
        max_tokens: 1024,
        system: `Translate the user's text to the language with ISO 639-1 code "${targetLang}". Respond with ONLY the translated text, nothing else — no preamble, no quotes. If it is already in that language, return it unchanged verbatim.`,
        messages: [{ role: "user", content: trimmed }],
      },
      { timeout: TIMEOUT_MS }
    );
    if (message.stop_reason === "refusal") return null;
    const block = message.content[0];
    return block && block.type === "text" ? block.text.trim() : null;
  } catch (error) {
    console.error("[translate] translateTo failed:", error instanceof APIError ? error.message : error);
    return null;
  }
}

// ─── Crew-facing content (checklists, supply items, rounds) ─────────────

export type CrewContentLang = "es" | "pt";

const CREW_LANGUAGE_NAME: Record<CrewContentLang, string> = {
  es: "Spanish (as spoken in the US / Latin America)",
  pt: "Brazilian Portuguese",
};

const BatchSchema = z.object({
  translations: z.array(z.string()).describe("One translation per input line, same order, same count."),
});

// Translates a batch of short crew-facing lines (checklist items, section
// names, supply names…) in one call. Returns translations in the same order,
// or null on any failure or if the count doesn't match (never a partial or
// shifted result). Callers keep English for anything that comes back null.
export async function translateBatch(texts: string[], lang: CrewContentLang): Promise<string[] | null> {
  if (texts.length === 0) return [];
  try {
    const client = new Anthropic();
    const message = await client.messages.parse(
      {
        model: MODEL,
        max_tokens: 4096,
        system:
          `You translate short lines from a commercial cleaning company's checklists and supply lists into ${CREW_LANGUAGE_NAME[lang]}, ` +
          "for cleaning crew members who are not tech-savvy. Use natural, simple, everyday words a cleaner would use; keep it short. " +
          "Keep brand names, product names, room numbers and codes as they are. " +
          "Return exactly one translation per input line, in the same order.",
        messages: [{ role: "user", content: JSON.stringify(texts) }],
        output_config: { format: zodOutputFormat(BatchSchema) },
      },
      { timeout: 30_000 }
    );
    if (message.stop_reason === "refusal") return null;
    const out = message.parsed_output?.translations;
    if (!out || out.length !== texts.length) return null;
    return out.map((t) => t.trim());
  } catch (error) {
    console.error("[translate] translateBatch failed:", error instanceof APIError ? error.message : error);
    return null;
  }
}
