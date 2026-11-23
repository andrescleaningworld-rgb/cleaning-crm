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

// emoji / label: what staff see (badges, history, the board). customer: what
// the customer sees on the email's buttons and the answer page. The value
// behind each is the same, so history and counts do not change.
export const CHECKIN_RATINGS: { value: CheckinRating; emoji: string; label: string; color: string; customer: string }[] = [
  { value: "great", emoji: "😀", label: "Great", color: "#15803d", customer: "😊 Loving it" },
  { value: "ok", emoji: "😐", label: "OK", color: "#b45309", customer: "🙂 It's fine" },
  { value: "attention", emoji: "😟", label: "Needs attention", color: "#b91c1c", customer: "😕 Could be better" },
];

/** The customer's emoji for an answer (the first character of its button). */
export const customerEmoji = (r: { customer: string }) => Array.from(r.customer)[0] ?? "";

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
/* ---------- who gets it: never a billing robot ---------- */

// Inboxes no person reads: invoice capture, accounts payable, billing, no-reply,
// and the invoice systems (Concur, Coupa, Ariba). A check-in sent there is lost
// (Woodard & Curran's went to an invoice-capture inbox).
const ROBOT_INBOX = /invoice|accountspayable|accounts[._-]payable|billing|no-?reply|concursolutions|coupa|ariba|(^|[._-])ap@/i;

/** True when the address looks like an automated billing / no-reply inbox. */
export function isRobotInbox(email: string): boolean {
  return ROBOT_INBOX.test(email.trim());
}

const EMAIL_SHAPE = /^[^@\s,;]+@[^@\s,;]+\.[^@\s,;]+$/;

/**
 * The address a check-in goes to: the first real-person address, in the
 * order given (the account's email, then its main contact, then its other
 * contacts). billingOnly: every address there is a billing robot.
 */
export function pickCheckinEmail(addresses: string[]): { email: string; billingOnly: boolean } {
  const all = [...new Set(addresses.flatMap((value) => String(value ?? "").split(/[,;\s]+/)).map((part) => part.trim()).filter((part) => EMAIL_SHAPE.test(part)))];
  const person = all.find((email) => !isRobotInbox(email));
  return { email: person ?? "", billingOnly: !person && all.length > 0 };
}

/** The skip reason when only billing inboxes are on file. */
export const BILLING_ONLY_REASON = "Billing inbox only";

/** "Send me a test" goes here. */
export const CHECKIN_TEST_EMAIL = "crm@cleaningworldinc.com";

export const CHECKIN_LINE =
  "Hi there! We really care about keeping your space just the way you like it. How's the cleaning been lately? Your answer comes straight to me, so if anything's not up to your expectations, I'll make it right.";
/** The email's big title. */
export const CHECKIN_TITLE = "How's it going?";

export function checkinSubject(customerName: string): string {
  const name = customerName.trim();
  return name ? `Quick question, ${name} 👋` : "Quick question 👋";
}

export type CheckinEmailInput = {
  /** The account (the customer's business). */
  customerName: string;
  managerName: string;
  managerPhone: string;
  managerEmail: string;
  /** One link per answer, and "Stop these emails". */
  links: Record<CheckinRating, string> & { stop: string };
  /** The 1x1 picture that marks the email "Viewed" (/checkin/<token>/open). Left out of the saved copy and the previews, so staff opening them never counts. */
  openPixelUrl?: string;
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

export function signatureLines(input: Pick<CheckinEmailInput, "managerName" | "managerPhone" | "managerEmail">): string[] {
  return [input.managerName || "Your Cleaning World Team", input.managerName ? "Your Account Manager, Cleaning World" : "", input.managerPhone, input.managerEmail].filter(Boolean);
}

const CHECKIN_SMALL = "Just one tap. No login, no forms.";

export function checkinEmail(input: CheckinEmailInput): { subject: string; html: string; text: string } {
  const subject = `${input.test ? "[TEST] " : ""}${checkinSubject(input.customerName)}`;
  const buttons = CHECKIN_RATINGS.map((r) => bigButton(r.customer, input.links[r.value], r.color)).join("");
  const signature = signatureLines(input);
  const body =
    welcomeTopHtml(CHECKIN_TITLE) +
    `<div style="background:#ffffff;padding:18px 16px 8px;">` +
    `<p style="margin:0 0 6px;font-size:17px;font-weight:700;color:${C.label};">${esc(input.customerName)}</p>` +
    `<p style="margin:0 0 18px;font-size:16px;line-height:1.55;color:${C.text};">${esc(CHECKIN_LINE)}</p>` +
    buttons +
    `<p style="margin:6px 0 0;font-size:13px;color:${C.muted};">${esc(CHECKIN_SMALL)}</p>` +
    `</div>` +
    `<div style="background:#ffffff;padding:8px 16px 16px;font-size:14px;line-height:1.6;color:${C.text};">` +
    `<div style="border-top:1px solid ${C.line};padding-top:10px;">` +
    `Thanks!<br>` +
    signature.map((line, index) => (index === 0 ? `<strong style="color:${C.label};">${esc(line)}</strong>` : esc(line))).join("<br>") +
    `</div></div>` +
    welcomeFooterHtml() +
    `<p style="margin:12px 0 0;font-size:12px;color:${C.muted};text-align:center;">Don't want these emails? <a href="${esc(input.links.stop)}" style="color:${C.muted};">Stop them</a>.</p>` +
    (input.openPixelUrl ? `<img src="${esc(input.openPixelUrl)}" width="1" height="1" alt="" style="display:block;width:1px;height:1px;border:0;" />` : "");

  const text = [
    CHECKIN_TITLE,
    "",
    CHECKIN_LINE,
    "",
    ...CHECKIN_RATINGS.map((r) => `${r.customer}: ${input.links[r.value]}`),
    "",
    CHECKIN_SMALL,
    "",
    "Thanks!",
    ...signature,
    "",
    `Stop these emails: ${input.links.stop}`,
  ].join("\n");

  return { subject, html: welcomeDocumentHtml(subject, body), text };
}

/* ---------- the reply to an OK answer ---------- */

/** On the answer page and in the reply email. Never promises a visit date. */
export const CHECKIN_OK_LINE = "Thanks for letting us know. We want your cleaning to be great, not just fine. Is there anything we could do better?";
const CHECKIN_OK_BUTTON = "Share your feedback";

/** The one short email after an OK answer, signed with the manager's name and phone. */
export function checkinOkEmail(input: { customerName: string; managerName: string; managerPhone: string; betterUrl: string; stopUrl: string }): { subject: string; html: string; text: string } {
  const subject = "Thanks for letting us know";
  const signature = signatureLines({ managerName: input.managerName, managerPhone: input.managerPhone, managerEmail: "" });
  const body =
    welcomeTopHtml(subject) +
    `<div style="background:#ffffff;padding:18px 16px 8px;">` +
    `<p style="margin:0 0 6px;font-size:17px;font-weight:700;color:${C.label};">${esc(input.customerName)}</p>` +
    `<p style="margin:0 0 18px;font-size:16px;line-height:1.55;color:${C.text};">${esc(CHECKIN_OK_LINE)}</p>` +
    bigButton(CHECKIN_OK_BUTTON, input.betterUrl, C.bar) +
    `</div>` +
    `<div style="background:#ffffff;padding:8px 16px 16px;font-size:14px;line-height:1.6;color:${C.text};">` +
    `<div style="border-top:1px solid ${C.line};padding-top:10px;">` +
    signature.map((line, index) => (index === 0 ? `<strong style="color:${C.label};">${esc(line)}</strong>` : esc(line))).join("<br>") +
    `</div></div>` +
    welcomeFooterHtml() +
    `<p style="margin:12px 0 0;font-size:12px;color:${C.muted};text-align:center;">Don't want these emails? <a href="${esc(input.stopUrl)}" style="color:${C.muted};">Stop them</a>.</p>`;
  const text = [CHECKIN_OK_LINE, "", `${CHECKIN_OK_BUTTON}: ${input.betterUrl}`, "", ...signature, "", `Stop these emails: ${input.stopUrl}`].join("\n");
  return { subject, html: welcomeDocumentHtml(subject, body), text };
}

/* ---------- the answer page (app/checkin) ---------- */

export const CHECKIN_PAGE = {
  thanksGreat: "Thanks so much! 😊",
  thanksGreatText: "Happy to hear it. We'll pass the good word on to your cleaning team.",
  /** The feedback box, by answer (the answer is already saved when it shows). */
  got: "Got it, thanks!",
  prompt: {
    great: "Anything we could do even better?",
    ok: CHECKIN_OK_LINE,
    attention: "Sorry about that! What's not right?",
  } as Record<CheckinRating, string>,
  hint: {
    great: "Totally optional.",
    ok: "Just a few words is plenty. Photos help too.",
    attention: "This comes straight to your account manager, and we'll make it right. Photos help too.",
  } as Record<CheckinRating, string>,
  change: "Change your answer",
  reach: "Best way to reach you (optional)",
  reachHint: "Phone or email",
  better: "What would make it better?",
  photos: "Photos (optional, up to 3)",
  send: "Send",
  skip: "No thanks",
  thanksSent: "Thanks! Your account manager will reach out soon.",
  thanksNoted: "Thanks! We got your answer.",
  stopTitle: "Stop these emails?",
  stopButton: "Yes, stop them",
  stopped: "All set. You won't get these emails anymore.",
  gone: "Oops, this link doesn't work anymore.",
  goneText: "Links in these emails work for 30 days. Give us a call at 201-487-1313 any time.",
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
  /** "Best way to reach you" from the feedback box (migration 080). */
  reach: string;
  /** First time the email was opened ("Viewed", approximate; migration 080). */
  openedAt: string;
  openCount: number;
  error: string;
  hasCopy: boolean;
  /** The complaint made from this check-in with "Turn into complaint", or "" (account page only). */
  complaintKey?: string;
};

/** The line a complaint made from a check-in carries in its Notes; it is how the two are matched (no extra column). */
export const checkinComplaintMarker = (checkinId: number) => `From customer check-in #${checkinId}`;

/** "Turn into complaint": the New complaint form, filled in from the check-in. */
export function checkinComplaintHref(input: { checkinId: number; accountId: string; accountName: string }): string {
  const params = new URLSearchParams({ fromCheckin: String(input.checkinId), accountId: input.accountId, accountName: input.accountName });
  return `/complaints/new?${params.toString()}`;
}

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
  /** Opened ("Viewed", approximate). */
  viewed: number;
  /** The accounts in the send: the ones it went to (A to Z), then the ones it skipped. */
  accounts: { id: string; name: string }[];
};

/** An account the send leaves out, and why. */
export type CheckinSkip = { accountId: string; accountName: string; reason: string };

/** The last check-in of each account, for the Check-ins page's filters. */
export type CheckinLast = { lastSentAt: string; lastAnswer: CheckinAnswerValue; lastStatus: CheckinStatus | ""; lastComment: string };

export type CheckinList = { id: number; name: string; accountIds: string[]; createdBy: string; updatedAt: string };

export const CHECKIN_VIEWED_NOTE = "Viewed is approximate — some email apps block or auto-load images.";

export const BATCH_KIND_TEXT: Record<CheckinBatchKind, string> = { single: "Single", picked: "Picked", list: "List" };
