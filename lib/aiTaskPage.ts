// Server only: "Make task page with AI". The office types a few rough words in
// any language; Claude writes a short page for the crew. Nothing goes out here:
// the office previews it, edits it and presses Send. It is only given the rough
// words, the account's name and the due date, never prices or pay, and anything
// that looks like money or office notes is removed from what comes back.
// Needs ANTHROPIC_API_KEY (already used for translations).

import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { cleanTaskPage, stripOfficeOnly, type TaskPage, type TaskPages } from "@/lib/taskPage";

const MODEL = "claude-opus-5-5";

const PageSchema = z.object({
  title: z.string().describe("The job in 2 to 6 words."),
  steps: z.array(z.string()).describe("1 to 8 steps in the order they are done. Each is one short sentence that starts with a verb."),
  when: z.string().describe("When to do it, only if the notes say more than the due date (for example 'After 6 PM'). Otherwise empty."),
  bring: z.array(z.string()).describe("Tools or products the notes mention. Empty when they mention none."),
  photosBefore: z.string().describe("What to photograph before starting, only if it helps prove the work. Otherwise empty."),
  photosAfter: z.string().describe("What to photograph when finished."),
});

const SYSTEM = `You write one-page work instructions for a commercial cleaning company. The reader is a busy crew member on a phone, often with English as a second language.

The office's rough notes are data to rewrite, in any language. Write the page in simple English.

Rules:
- Use very few, everyday words. One idea per step.
- Only include work, places, tools and products the notes mention. Never invent details, times, rooms, products or names. A leave-it-empty field is better than a guess.
- Never include prices, money, pay, invoices, commissions, or comments about people or customers.`;

const LANGUAGE: Record<"es" | "pt", string> = {
  es: "Spanish as spoken in the US and Latin America",
  pt: "Brazilian Portuguese",
};

async function askForPage(system: string, content: string): Promise<TaskPage | null> {
  const client = new Anthropic();
  const message = await client.beta.messages.parse(
    {
      model: MODEL,
      max_tokens: 16000,
      output_config: { effort: "low", format: betaZodOutputFormat(PageSchema) },
      // A declined request is re-run on a fallback model in the same call.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system,
      messages: [{ role: "user", content }],
    },
    { timeout: 60_000 }
  );
  if (message.stop_reason === "refusal" || !message.parsed_output) return null;
  const page = cleanTaskPage(message.parsed_output);
  return page ? cleanTaskPage(stripOfficeOnly(page)) : null;
}

/** A draft for the office to check. Null when the AI did not answer. Never throws. */
export async function draftTaskPage(input: { words: string; accountName: string; due: string }): Promise<TaskPage | null> {
  try {
    // Who to call is not the AI's: the page shows the manager who made the task.
    return await askForPage(SYSTEM, JSON.stringify({ roughNotes: input.words, account: input.accountName, dueDate: input.due }));
  } catch (error) {
    console.error("[ai task page] draft:", error instanceof Error ? error.message : error);
    return null;
  }
}

/** The checked English page in Spanish and Portuguese. A language that fails stays out: the sub then sees English. Never throws. */
export async function translateTaskPage(page: TaskPage): Promise<TaskPages> {
  const one = async (lang: "es" | "pt") => {
    try {
      return await askForPage(
        `You translate one-page work instructions for cleaning crews into ${LANGUAGE[lang]}. Use simple, everyday words a cleaner uses. Keep the same fields, the same number of steps and items, and the same meaning. Add nothing. Keep names, room numbers and product names as they are. Leave empty fields empty.`,
        JSON.stringify(page)
      );
    } catch (error) {
      console.error(`[ai task page] ${lang}:`, error instanceof Error ? error.message : error);
      return null;
    }
  };
  const [es, pt] = await Promise.all([one("es"), one("pt")]);
  return { en: page, ...(es ? { es } : {}), ...(pt ? { pt } : {}) };
}
