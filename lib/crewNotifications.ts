// One email path for new supply orders and problem reports, shared by the
// Team Hub crew app and Crew Link (docs/crew-link-spec.md §7). Translates
// the worker's note first (SHARED TRANSLATION, docs/team-hub-spec.md §12),
// stores the English + detected language on the row, then emails info@/
// crm@ with English on top and the original below. Callers wrap this in
// waitUntil so the crew's "Send" never waits on translation or email.
import { sendInternalNotification } from "@/lib/email";
import { translateToEnglish } from "@/lib/translate";
import { lookupAccountSummary } from "@/lib/teamHubAccountLookup";
import {
  setTeamHubIssueNoteTranslation,
  setTeamHubSupplyOrderNoteTranslation,
  type TeamHubSupplyOrderLine,
} from "@/lib/teamHubDb";

// Where the order/problem came from. Team Hub: site label + crew name.
// Crew Link: the name the person typed.
export type CrewNotificationSource =
  | { kind: "team-hub"; siteLabel: string; crewName: string }
  | { kind: "crew-link"; reporterName: string };

async function translateNote(note: string, save: (english: string, lang: string) => Promise<void>): Promise<string> {
  if (!note) return note;
  const translated = await translateToEnglish(note);
  if (!translated) return note;
  await save(translated.english, translated.detectedLanguage);
  return translated.english;
}

function noteLines(note: string, englishNote: string): string[] {
  if (!note) return ["No note."];
  return [`Note: ${englishNote}`, ...(englishNote !== note ? [`Original: ${note}`] : [])];
}

function sourceLines(source: CrewNotificationSource): string[] {
  return source.kind === "team-hub" ? [`Crew: ${source.crewName}`] : ["From: Crew Link", `Reported by: ${source.reporterName}`];
}

function adminLink(origin: string, accountId: string, source: CrewNotificationSource): string {
  const url = `${origin}/accounts/${encodeURIComponent(accountId)}`;
  return source.kind === "team-hub" ? `Team Hub tab: ${url}?tab=team-hub` : `Account page (Crew Link): ${url}`;
}

export async function notifyNewSupplyOrder(input: {
  source: CrewNotificationSource;
  orderId: number;
  accountId: string;
  note: string;
  // Crew Link write-in ("Other supplies not on the list"); Team Hub has none.
  otherItems?: string | null;
  lines: Pick<TeamHubSupplyOrderLine, "itemName" | "qty" | "unit">[];
  origin: string;
}): Promise<void> {
  const englishNote = await translateNote(input.note, (english, lang) =>
    setTeamHubSupplyOrderNoteTranslation(input.orderId, english, lang)
  );
  const account = await lookupAccountSummary(input.accountId);
  const accountName = account?.accountName ?? input.accountId;
  const subject =
    input.source.kind === "team-hub"
      ? `Team Hub: new supply order — ${input.source.siteLabel}`
      : `Crew Link: new supply order — ${accountName}`;

  await sendInternalNotification(subject, [
    `Account: ${accountName}`,
    ...sourceLines(input.source),
    ...input.lines.map((l) => `${l.itemName} x${l.qty} ${l.unit}`),
    ...(input.otherItems ? [`Other supplies: ${input.otherItems}`] : []),
    ...noteLines(input.note, englishNote),
    adminLink(input.origin, input.accountId, input.source),
  ]);
}

export async function notifyNewProblem(input: {
  source: CrewNotificationSource;
  issueId: number;
  accountId: string;
  category: string;
  note: string;
  photoUrls: string[];
  origin: string;
}): Promise<void> {
  const englishNote = await translateNote(input.note, (english, lang) =>
    setTeamHubIssueNoteTranslation(input.issueId, english, lang)
  );
  const account = await lookupAccountSummary(input.accountId);
  const accountName = account?.accountName ?? input.accountId;
  const subject =
    input.source.kind === "team-hub"
      ? `Team Hub: new problem reported — ${input.source.siteLabel}`
      : `Crew Link: new problem reported — ${accountName}`;

  await sendInternalNotification(subject, [
    `Account: ${accountName}`,
    ...sourceLines(input.source),
    `Category: ${input.category}`,
    ...noteLines(input.note, englishNote),
    input.photoUrls.length > 0 ? `Photos: ${input.photoUrls.join(", ")}` : "No photos.",
    adminLink(input.origin, input.accountId, input.source),
  ]);
}
