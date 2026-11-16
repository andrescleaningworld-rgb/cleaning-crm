// The customer check-in: the words, the email and the answer page's words.
// Plain TS (no server imports). Sending, lists and answers:
// lib/pg/customer-checkin.ts. The link: lib/checkinLink.ts.
//
// Sent only when someone presses Send (one account, picked accounts, or a
// saved list): never by itself. The email uses the Welcome Packet's template
// (lib/welcomePacket.ts). Customer-facing words never say "sub": it is "your
// cleaning team".

import { WELCOME_COLORS as C, welcomeDocumentHtml, welcomeEsc as esc, welcomeFooterHtml, welcomeTopHtml } from "@/lib/welcomePacket";

/** The customer's answer. 'up' / 'down' are the old monthly check-in's (migration 059) and read as Great / Needs attention. */
export type CheckinRating = "great" | "ok" | "attention";
export type CheckinAnswerValue = "" | CheckinRating | "up" | "down";
export type CheckinStatus = "queued" | "sent" | "failed" | "skipped";
export type CheckinBatchKind = "single" | "picked" | "list";

export const CHECKIN_RATINGS: { value: CheckinRating; emoji: string; label: string; color: string }[] = [
  { value: "great", emoji: "😀", label: "Great", color: "#15803d" },
  { value: "ok", emoji: "😐", label: "OK", color: "#b45309" },
  { value: "attention", emoji: "😟", label: "Needs attention", color: "#b91c1c" },
];

/** Great / OK / Needs attention, or "" for no answer (the old 👍 / 👎 too). */
export function ratingOf(answer: string): CheckinRating | "" {
  if (answer === "great" || answer === "up") return "great";
  if (answer === "ok") return "ok";
  if (answer === "attention" || answer === "down") return "attention";
  return "";
}

/** "😀 Great", or "No answer". */
export function ratingText(answer: string): string {
  const rating = CHECKIN_RATINGS.find((r) => r.value === ratingOf(answer));
  return rating ? `${rating.emoji} ${rating.label}` : "No answer";
}

export const CHECKIN_STATUS_TEXT: Record<CheckinStatus, string> = { queued: "Queued", sent: "Sent", failed: "Failed", skipped: "Skipped" };

/** At most this many check-in emails a day (Resend's free plan allows 100). The rest wait for the next days. */
export const CHECKIN_DAILY_LIMIT = 90;
/** An account that got a check-in in the last this many days is skipped. */
export const CHECKIN_REPEAT_DAYS = 30;
/** "Send me a test" goes here. */
export const CHECKIN_TEST_EMAIL = "crm@cleaningworldinc.com";

export const CHECKIN_LINE = "We want to make sure your cleaning team is doing a great job. How are we doing?";

export function checkinSubject(customerName: string): string {
  const name = customerName.trim();
  return name ? `How is your cleaning going, ${name}?` : "How is your cleaning going?";
}

export type CheckinEmailInput = {
  /** The account (the customer's business). */
  customerName: string;
  managerName: string;
  managerPhone: string;
  managerEmail: string;
  /** One link per answer, and "Stop these emails". */
  links: Record<CheckinRating, string> & { stop: string };
  test?: boolean;
};

// A table button (Outlook draws it too), full width so it is easy to tap.
function bigButton(label: string, url: string, color: string): string {
  return (
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 12px;"><tr>` +
    `<td bgcolor="${color}" align="center" style="background:${color};border-radius:12px;">` +
    `<a href="${esc(url)}" style="display:block;padding:18px 12px;font-size:22px;font-weight:700;color:#ffffff;text-decoration:none;font-family:Arial,Helvetica,sans-serif;">${esc(label)}</a>` +
    `</td></tr></table>`
  );
}

function signatureLines(input: Pick<CheckinEmailInput, "managerName" | "managerPhone" | "managerEmail">): string[] {
  return [input.managerName || "Your Cleaning World Team", input.managerName ? "Your Account Manager, Cleaning World Inc." : "", input.managerPhone, input.managerEmail].filter(Boolean);
}

export function checkinEmail(input: CheckinEmailInput): { subject: string; html: string; text: string } {
  const subject = `${input.test ? "[TEST] " : ""}${checkinSubject(input.customerName)}`;
  const buttons = CHECKIN_RATINGS.map((r) => bigButton(`${r.emoji} ${r.label}`, input.links[r.value], r.color)).join("");
  const signature = signatureLines(input);
  const body =
    welcomeTopHtml("How is your cleaning going?") +
    `<div style="background:#ffffff;padding:18px 16px 8px;">` +
    `<p style="margin:0 0 6px;font-size:17px;font-weight:700;color:${C.label};">${esc(input.customerName)}</p>` +
    `<p style="margin:0 0 18px;font-size:16px;line-height:1.55;color:${C.text};">${esc(CHECKIN_LINE)}</p>` +
    buttons +
    `<p style="margin:6px 0 0;font-size:13px;color:${C.muted};">One tap is all it takes. No login needed.</p>` +
    `</div>` +
    `<div style="background:#ffffff;padding:8px 16px 16px;font-size:14px;line-height:1.6;color:${C.text};">` +
    `<div style="border-top:1px solid ${C.line};padding-top:10px;">` +
    signature.map((line, index) => (index === 0 ? `<strong style="color:${C.label};">${esc(line)}</strong>` : esc(line))).join("<br>") +
    `</div></div>` +
    welcomeFooterHtml() +
    `<p style="margin:12px 0 0;font-size:12px;color:${C.muted};text-align:center;">Don't want these emails? <a href="${esc(input.links.stop)}" style="color:${C.muted};">Stop them</a>.</p>`;

  const text = [
    checkinSubject(input.customerName),
    "",
    CHECKIN_LINE,
    "",
    ...CHECKIN_RATINGS.map((r) => `${r.emoji} ${r.label}: ${input.links[r.value]}`),
    "",
    ...signature,
    "",
    `Stop these emails: ${input.links.stop}`,
  ].join("\n");

  return { subject, html: welcomeDocumentHtml(subject, body), text };
}

/* ---------- the answer page (app/checkin) ---------- */

export const CHECKIN_PAGE = {
  thanksGreat: "Thank you! 😀",
  thanksGreatText: "We are glad your cleaning team is doing a great job.",
  better: "What can we do better?",
  betterHint: "Tell us what to fix. You can add photos too.",
  photos: "Photos (optional, up to 3)",
  send: "Send",
  skip: "Skip",
  thanksSent: "Thank you. Your account manager will look at it.",
  thanksNoted: "Thank you. We got your answer.",
  stopTitle: "Stop these emails?",
  stopButton: "Yes, stop them",
  stopped: "Done. You will not get these emails anymore.",
  gone: "This link no longer works.",
  goneText: "Links in these emails work for 30 days. Call us at 201-487-1313 any time.",
  test: "This is a test. Nothing was saved.",
};

/* ---------- what the staff pages read ---------- */

/** One check-in on an account (its history) or in a send (batch detail). */
export type CheckinRow = {
  id: number;
  accountId: string;
  accountName: string;
  createdAt: string;
  sentAt: string;
  status: CheckinStatus;
  sentBy: string;
  sentTo: string;
  batchId: number | null;
  batchKind: CheckinBatchKind | "";
  listName: string;
  answer: CheckinAnswerValue;
  answeredAt: string;
  comment: string;
  photos: string[];
  error: string;
  hasCopy: boolean;
};

/** One press of Send. */
export type CheckinBatch = {
  id: number;
  createdAt: string;
  createdBy: string;
  kind: CheckinBatchKind;
  listName: string;
  total: number;
  sent: number;
  queued: number;
  failed: number;
  skipped: number;
  answered: number;
  attention: number;
};

/** An account the send leaves out, and why. */
export type CheckinSkip = { accountId: string; accountName: string; reason: string };

/** The last check-in of each account, for the Check-ins page's filters. */
export type CheckinLast = { lastSentAt: string; lastAnswer: CheckinAnswerValue; lastStatus: CheckinStatus | ""; lastComment: string };

export type CheckinList = { id: number; name: string; accountIds: string[]; createdBy: string; updatedAt: string };

export const BATCH_KIND_TEXT: Record<CheckinBatchKind, string> = { single: "Single", picked: "Picked", list: "List" };
