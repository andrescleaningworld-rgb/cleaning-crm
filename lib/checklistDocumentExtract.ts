// Server-only: turns an uploaded PDF/DOCX into the same {section, item,
// sub_note} shape the CSV/JSON upload path already produces, via a Claude
// API call. This is deliberately the ONLY new code path here — the result
// is fed straight through the existing buildSectionsFromRows/validateSections
// (lib/checklistTemplate.ts) so a bad extraction is rejected exactly like a
// bad CSV, and this module never writes to checklist_templates itself (see
// app/api/checklist-templates/route.ts's extractTemplateFromDocument action
// — it only returns a preview for the client to review before saving).
//
// PDF is sent to Claude directly as a native `document` content block
// rather than text-extracted first (e.g. via pdf-parse): Claude's PDF
// understanding reads visual layout — tables, checkbox glyphs, columns —
// natively, which a text-extraction step would flatten and often mangle
// (exactly the messy formatting these source documents have). DOCX has no
// equivalent native input type, so that path extracts plain text (mammoth)
// first, then sends the text.
import Anthropic, {
  AuthenticationError,
  RateLimitError,
  APIConnectionError,
  APIError,
} from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import mammoth from "mammoth";
import {
  buildSectionsFromRows,
  validateSections,
  type ChecklistSectionDef,
} from "@/lib/checklistTemplate";

// Raw file size cap — comfortably under Vercel's request body limit once
// base64-inflated (~4MB) plus JSON envelope overhead.
export const MAX_UPLOAD_BYTES = 3 * 1024 * 1024;

export type DocumentExtractResult =
  | { ok: true; locationName: string; sections: ChecklistSectionDef[] }
  | { ok: false; error: string };

const ExtractedChecklistSchema = z.object({
  locationName: z.string().optional(),
  // No .min(1) here — the prompt explicitly asks for an empty array when the
  // document isn't a checklist, and a schema-enforced minimum would force
  // the model to fabricate a placeholder item to satisfy it instead (this
  // was caught during testing: a non-checklist document without .min(1)
  // relaxed made the model invent "No checklist items found in document" as
  // a fake item rather than returning items: []). The empty-array case is
  // handled explicitly below instead.
  items: z.array(
    z.object({
      section: z.string(),
      item: z.string(),
      sub_note: z.string().optional(),
    })
  ),
});

const SYSTEM_PROMPT = `You extract cleaning/porter checklists from source documents (PDFs, Word docs) into a structured format.

The source document may have tables, checkbox glyphs (such as ☐ □ ✓), numbered or bulleted lists, and inconsistent formatting. Extract every distinct checklist item as one entry.

Rules:
- Group items under whatever section/area headers the document uses (e.g. "Lobby", "Restrooms", "Kitchen"). If the document has no clear sections, use a single section named "Checklist".
- "item" is the short task description itself — strip leading checkbox glyphs, numbers, and bullet markers, but keep the task's own wording.
- "sub_note" is only for genuinely extra guidance/detail beyond the item label (e.g. a parenthetical instruction) — omit it when there is nothing beyond the item text itself.
- If the document has a clear property/location name (e.g. in a title or header), return it as locationName — otherwise omit it.
- Do not invent items that are not in the document. Do not summarize or merge distinct items together.
- If the document does not appear to contain a checklist at all, return an empty items array rather than guessing.`;

async function runExtraction(
  content: Anthropic.Messages.ContentBlockParam[],
  sourceLabel: string
): Promise<DocumentExtractResult> {
  let message;
  try {
    // Constructed inside the try block on purpose — with no credentials
    // resolvable (missing/misnamed ANTHROPIC_API_KEY, no other credential
    // source), `new Anthropic()` throws synchronously rather than at the
    // API-call site, and that needs the same clear message as an
    // AuthenticationError from a live call, not a raw SDK internals string.
    const client = new Anthropic();
    message = await client.messages.parse({
      model: "claude-opus-5",
      max_tokens: 8000,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content }],
      output_config: { format: zodOutputFormat(ExtractedChecklistSchema) },
    });
  } catch (err) {
    console.error(`[checklist-extract] Claude API call failed for "${sourceLabel}":`, err);
    if (err instanceof AuthenticationError || (err instanceof Error && /credential|api.?key/i.test(err.message))) {
      return { ok: false, error: "Checklist extraction is not configured correctly (missing or invalid Anthropic API key)." };
    }
    if (err instanceof RateLimitError) {
      return { ok: false, error: "Checklist extraction is temporarily rate-limited — try again in a minute." };
    }
    if (err instanceof APIConnectionError) {
      return { ok: false, error: "Could not reach the extraction service — check your connection and try again." };
    }
    if (err instanceof APIError) {
      return { ok: false, error: `Checklist extraction failed: ${err.message}` };
    }
    return { ok: false, error: err instanceof Error ? err.message : "Unknown error extracting checklist." };
  }

  if (message.stop_reason === "refusal") {
    return { ok: false, error: "The extraction request was declined — try a different document." };
  }

  const parsed = message.parsed_output;
  if (!parsed) {
    return {
      ok: false,
      error: "Could not interpret this document as a checklist — the response didn't match the expected structure.",
    };
  }

  if (parsed.items.length === 0) {
    return { ok: false, error: "This document doesn't appear to contain a checklist — no items were found." };
  }

  const built = buildSectionsFromRows(
    parsed.items.map((item) => ({ section: item.section, item: item.item, sub_note: item.sub_note }))
  );
  if (!built.ok) {
    return { ok: false, error: `The extracted structure didn't look like a checklist: ${built.error}` };
  }

  const validated = validateSections(built.sections);
  if (!validated.ok) {
    return { ok: false, error: `The extracted structure didn't look like a checklist: ${validated.error}` };
  }

  return { ok: true, locationName: parsed.locationName?.trim() || "", sections: validated.sections };
}

export async function extractChecklistFromPdf(base64Data: string, filename: string): Promise<DocumentExtractResult> {
  return runExtraction(
    [
      { type: "document", source: { type: "base64", media_type: "application/pdf", data: base64Data } },
      { type: "text", text: "Extract the checklist from this document." },
    ],
    filename
  );
}

export async function extractChecklistFromDocx(buffer: Buffer, filename: string): Promise<DocumentExtractResult> {
  let text: string;
  try {
    const result = await mammoth.extractRawText({ buffer });
    text = result.value;
  } catch (err) {
    console.error(`[checklist-extract] mammoth failed for "${filename}":`, err);
    return {
      ok: false,
      error: "Couldn't extract text from this Word document — it may be corrupted or in an unsupported format.",
    };
  }

  if (!text.trim()) {
    return {
      ok: false,
      error: "Couldn't extract any text from this Word document — it may be empty or image-only.",
    };
  }

  return runExtraction([{ type: "text", text: `Extract the checklist from this document:\n\n${text}` }], filename);
}
