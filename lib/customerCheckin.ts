// The customer monthly check-in: the words, the email and the text message.
// Plain TS (no server imports). Sending and answers: lib/pg/customer-checkin.ts.
//
// Channels: only "email" is sent today. Textbelt does not allow links yet;
// checkinTextMessage is ready for when it does (send it where the email is
// sent, with channel "text").

import { BRAND_GREEN, emailButtonHtml, escHtml, simpleEmailHtml } from "@/lib/simpleEmail";

export type CheckinChannel = "email" | "text";
export type CheckinAnswer = "up" | "down";
/** One month's check-in, as the account page shows it. */
export type CheckinResult = { month: string; sentAt: string; answer: "" | CheckinAnswer; comment: string };

/** The check-ins go out from this day of the month on (each account once a month). */
export const CHECKIN_SEND_FROM_DAY = 25;
/** "Send me a test" goes here. */
export const CHECKIN_TEST_EMAIL = "crm@cleaningworldinc.com";
/** At most this many emails a day (the rest go the next day). */
export const CHECKIN_DAILY_LIMIT = 120;

export const CHECKIN_SUBJECT = "How was your cleaning this month?";

export type CheckinLinks = { upUrl: string; downUrl: string; stopUrl: string };

export function checkinEmail(input: { accountName: string; test?: boolean } & CheckinLinks): { subject: string; html: string; text: string } {
  const place = input.accountName ? ` at ${input.accountName}` : "";
  const subject = `${input.test ? "[TEST] " : ""}${CHECKIN_SUBJECT}`;
  return {
    subject,
    html: simpleEmailHtml({
      title: CHECKIN_SUBJECT,
      subtitle: input.accountName || undefined,
      blocks: [escHtml(`Hi! How was your cleaning${place} this month?`), "Tap one. It takes one second."],
      buttonsHtml:
        emailButtonHtml({ label: "👍 Good", url: input.upUrl, color: BRAND_GREEN }, "huge") + emailButtonHtml({ label: "👎 Not good", url: input.downUrl, color: "#b91c1c" }, "huge"),
      footerHtml: `Don't want these emails? <a href="${escHtml(input.stopUrl)}" style="color:#475569;">Stop them</a>.`,
    }),
    text: [`Hi! How was your cleaning${place} this month?`, "", `👍 Good: ${input.upUrl}`, `👎 Not good: ${input.downUrl}`, "", `Stop these emails: ${input.stopUrl}`].join("\n"),
  };
}

/** For later: the same check-in as a text message, once Textbelt allows links. */
export function checkinTextMessage(input: { accountName: string } & Pick<CheckinLinks, "upUrl" | "downUrl">): string {
  return [`Cleaning World: how was your cleaning this month?`, `👍 ${input.upUrl}`, `👎 ${input.downUrl}`].join("\n");
}

/* ---------- the answer page (app/checkin) ---------- */

export const CHECKIN_PAGE = {
  thanksUp: "Thank you! 👍",
  thanksUpText: "We are glad. Have a great month!",
  sorry: "We are sorry 👎",
  whatWrong: "What went wrong? (you can skip this)",
  send: "Send",
  thanksDown: "Thank you. Your manager will look at it.",
  stopTitle: "Stop these emails?",
  stopButton: "Yes, stop them",
  stopped: "Done. You will not get these emails anymore.",
  gone: "This link no longer works.",
  test: "This is a test. Nothing was saved.",
};
