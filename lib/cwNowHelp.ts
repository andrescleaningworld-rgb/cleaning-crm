// The help on each step of CW Now setup: one line, an example, a short video.
// Simple words. Plain TS, safe in the browser.

export type CwNowHelpKey = "items" | "mode" | "crew" | "send";

export const CW_NOW_HELP: Record<CwNowHelpKey, { title: string; tip: string; exampleTitle: string; example: string[]; video: string }> = {
  items: {
    title: "What do they clean?",
    tip: "One job per line. Start with a doing word.",
    exampleTitle: "Good items",
    example: ["✅ Empty all trash cans", "✅ Mop the kitchen floor", "❌ Kitchen (too short: do what?)"],
    video: "/help/cw-now/items.webm",
  },
  mode: {
    title: "How do they check it off?",
    tip: "Normal: tap a box. Photo: take a picture of each job.",
    exampleTitle: "Which one?",
    example: ["Normal: most accounts", "Photo: when you need proof"],
    video: "/help/cw-now/mode.webm",
  },
  crew: {
    title: "Who's on the crew?",
    tip: "Add each person: name, phone, language.",
    exampleTitle: "Example",
    example: ["Maria · 201-555-0123 · Español", "Jose · 201-555-0188 · English"],
    video: "/help/cw-now/crew.webm",
  },
  send: {
    title: "Shift and send",
    tip: "Set the shift time. Then send each person their link.",
    exampleTitle: "Example",
    example: ["Shift: 6:00 PM to 10:00 PM", "Send by WhatsApp to each person"],
    video: "/help/cw-now/send.webm",
  },
};

export const CW_NOW_TOUR_ID = "cw-now-setup";

export const CW_NOW_TOUR = [
  { target: '[data-cw-tour="account"]', text: "1. This is the account." },
  { target: '[data-cw-tour="items"]', text: "2. Add the items, or let AI make them." },
  { target: '[data-cw-tour="mode"]', text: "3. Pick how they check it off." },
  { target: '[data-cw-tour="crew"]', text: "4. Add the crew." },
  { target: '[data-cw-tour="send"]', text: "5. Set the shift and send. Done!" },
];

/** The account's status, in plain words. */
export function checklistStatusWords(input: { crew: number; lastDoneText: string; missedDays: number | null }): { text: string; warn: boolean } {
  if (input.missedDays !== null && input.missedDays >= 3) return { text: `⚠ No checklist done in ${input.missedDays} days`, warn: true };
  const crew = input.crew > 0 ? `crew of ${input.crew}` : "no crew yet";
  return { text: `✅ Checklist set up · ${crew} · ${input.lastDoneText ? `last done ${input.lastDoneText}` : "not done yet"}`, warn: false };
}
