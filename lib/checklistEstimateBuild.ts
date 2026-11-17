// Server-only: "Build from estimate" (Crew Link → Build from estimate).
// Staff paste the scope of work from an estimate and pick the crew size;
// Claude turns it into crew checklists, one tab per person. Nothing is saved
// here: the result goes through the same parser as an uploaded file
// (buildSectionsFromRows + validateSections in lib/checklistTemplate.ts) and
// comes back as a preview to fix up before Save (app/api/checklist-templates,
// actions buildFromEstimate / saveBuiltTabs).
//
// The tabs keep the classic checklist screen: how often a task is done goes
// in the section name ("EVERY NIGHT – Main Floor", "MON / WED / FRI ONLY –
// Basement", "1st Friday of the month"), never in route fields.

import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { buildSectionsFromRows, cleanTabName, validateSections, type ChecklistSectionDef } from "@/lib/checklistTemplate";
import { checklistAiError } from "@/lib/checklistDocumentExtract";

export const CREW_SIZES = [1, 2, 3, 4] as const;
export const MAX_SCOPE_CHARS = 20_000;
const MODEL = "claude-sonnet-5-5";

export type BuiltTab = { name: string; sections: ChecklistSectionDef[] };
export type EstimateBuildResult = { ok: true; tabs: BuiltTab[] } | { ok: false; error: string };

/** Tab names: one tab is "Checklist" (every account's first tab); more are "Person 1", "Person 2"… */
export const builtTabName = (index: number, crewSize: number) => (crewSize === 1 ? "Checklist" : cleanTabName(`Person ${index + 1}`));

const BuiltSchema = z.object({
  tabs: z.array(
    z.object({
      sections: z.array(
        z.object({
          name: z.string(),
          items: z.array(z.string()),
        })
      ),
    })
  ),
});

const SYSTEM_PROMPT = `You turn the scope of work from a commercial cleaning estimate into checklists for the cleaning crew.

The crew reads these on a phone while working. Many speak English as a second language.

Output: a list of tabs, one per person on the crew, in order (Person 1 first). Each tab is a list of sections; each section has a name and a list of short task lines.

Rules:
- Only tasks that are in the scope. Never add a task, area, product or step that the scope does not ask for. If the scope is unclear about something, leave it out rather than guess.
- Group tasks by area, in the order the work is done: start each area with trash, then dusting and wiping high to low, then floors last (vacuum, sweep, mop). Do bathrooms early in the night.
- Put how often a task is done in the section name, in capital letters, then the area: "EVERY NIGHT – Main Floor", "MON / WED / FRI ONLY – Basement", "TUE / THU ONLY – Lobby".
- Monthly and yearly tasks: one section "MONTHLY / SCHEDULED – only on the night listed", and each line starts with when: "1st Friday of the month: …", "2nd Friday of the month: …", "January and July (1st Friday): …". Spread "2x per month" over the 1st and 3rd week, "2x per year" over January and July, unless the scope says when.
- Turn estimate wording into crew words: "5x/week" or "1x per Service Date" = EVERY NIGHT (if the service is 5 nights a week); "3x/week" = MON / WED / FRI ONLY; "2x/week" = TUE / THU ONLY; "1x per Service Month" = once a month; "2x per Service Month" = twice a month; "2x per Service Year" = twice a year.
- Simple words, short lines (about 4 to 12 words). Start each line with a verb ("Empty all trash cans", "Mop the floor"). No prices, no hours, no customer contract terms.
- Never write the word "sub" or "subcontractor". Say "team" or "crew" if needed.
- Do not number the lines. Do not add a "Rules" section unless the scope lists rules for the crew (for example: do not move papers on desks).

Crew size:
- 1 person: one tab with all the work.
- More than 1: split the work evenly between the people (about the same amount of work each, whole areas where you can). Each person gets one tab.
  - Add short hand-off lines where one person's work depends on another's, in the tab of the person who must tell the other: "Tell Person 2 the floor is ready", "Tell Person 1 the bathrooms are done".
  - The last person (the highest number) locks up: their tab ends with a "Before Leaving" section with "Check that everyone is done", "Turn off the lights", "Lock all the doors" and, only if the scope mentions an alarm, "Set the alarm". Hand-off lines and this section are the only lines allowed that are not in the scope.
- With 1 person, end with the same "Before Leaving" section (alarm only if the scope mentions one).`;

/** "sub" never reaches the crew (customer- and crew-facing rule), whatever the model wrote. */
const noSub = (text: string) => text.replace(/\bsub-?contractors?\b/gi, "team").replace(/\bsubs?\b(?!-)/gi, "team");

export async function buildChecklistFromEstimate(scope: string, crewSize: number): Promise<EstimateBuildResult> {
  const text = scope.trim();
  if (!text) return { ok: false, error: "Paste the scope of work first." };
  if (text.length > MAX_SCOPE_CHARS) return { ok: false, error: `That is too long (${text.length} characters). Paste only the scope of work, up to ${MAX_SCOPE_CHARS}.` };
  if (!(CREW_SIZES as readonly number[]).includes(crewSize)) return { ok: false, error: "Pick a crew size: 1, 2, 3 or 4 people." };

  let message;
  try {
    const client = new Anthropic();
    message = await client.beta.messages.parse({
      model: MODEL,
      max_tokens: 16000,
      output_config: { effort: "medium", format: betaZodOutputFormat(BuiltSchema) },
      // A declined request is re-run on a fallback model in the same call.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: `Crew size: ${crewSize} ${crewSize === 1 ? "person" : "people"} (make exactly ${crewSize} tab${crewSize === 1 ? "" : "s"}).\n\nScope of work from the estimate:\n\n${text}`,
        },
      ],
    });
  } catch (err) {
    console.error("[checklist-estimate] Claude API call failed:", err);
    return { ok: false, error: checklistAiError(err, "Build from estimate") };
  }

  if (message.stop_reason === "refusal") return { ok: false, error: "The AI declined this text. Check that it is the scope of work, then try again." };
  if (message.stop_reason === "max_tokens") return { ok: false, error: "The scope is too long to make in one go. Paste a shorter part and try again." };
  const parsed = message.parsed_output;
  if (!parsed) return { ok: false, error: "The AI answer did not come back as a checklist. Try again." };
  if (parsed.tabs.length !== crewSize) {
    return { ok: false, error: `The AI made ${parsed.tabs.length} tab(s) for ${crewSize} ${crewSize === 1 ? "person" : "people"}. Try again.` };
  }

  // Every tab goes through the same parser as an uploaded file.
  const tabs: BuiltTab[] = [];
  for (const [index, tab] of parsed.tabs.entries()) {
    const name = builtTabName(index, crewSize);
    const rows = tab.sections.flatMap((section) =>
      section.items.map((item) => ({ section: noSub(section.name.trim()), item: noSub(item.trim()) })).filter((row) => row.section && row.item)
    );
    const built = buildSectionsFromRows(rows);
    if (!built.ok) return { ok: false, error: `${name}: ${built.error}` };
    const valid = validateSections(built.sections);
    if (!valid.ok) return { ok: false, error: `${name}: ${valid.error}` };
    tabs.push({ name, sections: valid.sections });
  }
  return { ok: true, tabs };
}
