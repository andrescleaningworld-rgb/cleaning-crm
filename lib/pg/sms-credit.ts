// Textbelt credit: what is left after the last text, for the warning on the
// Pin Board (and its TV), and one email to the office when it drops under
// SMS_LOW_QUOTA_THRESHOLD and again at 0. Not again for the same level until
// the credit is topped up (it goes back to the threshold or more).
//
// Every text the app sends goes through lib/sms.ts sendSms, which calls
// recordSmsCredit with Textbelt's own number (it is on failed replies too:
// "Out of quota" comes back with 0). Kept in feature_settings under
// "sms_credit" (migration 056): no new table. Server only. Never throws.

import { getSql } from "@/lib/db";
import { sendStaffNotification } from "@/lib/email";
import { SMS_LOW_QUOTA_THRESHOLD } from "@/lib/sms";

const KEY = "sms_credit";
/** Who gets the low-credit email. */
export const SMS_CREDIT_ALERT_EMAIL = "info@cleaningworldinc.com";

type Level = "ok" | "low" | "zero";
type Stored = { quota: number; at: string; alerted: "" | "low" | "zero" };

export type SmsCredit = { quota: number; at: string; level: Level };

const levelOf = (quota: number): Level => (quota <= 0 ? "zero" : quota < SMS_LOW_QUOTA_THRESHOLD ? "low" : "ok");

async function read(): Promise<Stored | null> {
  const rows = (await getSql()`SELECT value FROM feature_settings WHERE key = ${KEY} LIMIT 1`) as { value: Partial<Stored> | null }[];
  const value = rows[0]?.value;
  if (!value || typeof value.quota !== "number") return null;
  return { quota: value.quota, at: String(value.at ?? ""), alerted: value.alerted === "low" || value.alerted === "zero" ? value.alerted : "" };
}

/** The last credit Textbelt reported, or null when no text has reported one yet. */
export async function smsCredit(): Promise<SmsCredit | null> {
  try {
    const stored = await read();
    return stored ? { quota: stored.quota, at: stored.at, level: levelOf(stored.quota) } : null;
  } catch (error) {
    console.error("[sms credit] read:", error instanceof Error ? error.message : error);
    return null;
  }
}

/** After a text: saves the credit left, and emails the office the first time it is low, and the first time it is 0. */
export async function recordSmsCredit(quota: number): Promise<void> {
  if (!Number.isFinite(quota)) return;
  try {
    const before = await read();
    const level = levelOf(quota);
    // Topped up: the next drop emails again.
    let alerted: Stored["alerted"] = level === "ok" ? "" : before?.alerted ?? "";
    let email: "low" | "zero" | "" = "";
    if (level === "zero" && alerted !== "zero") email = "zero";
    else if (level === "low" && alerted === "") email = "low";
    if (email) alerted = email;

    const value: Stored = { quota, at: new Date().toISOString(), alerted };
    await getSql()`
      INSERT INTO feature_settings (key, value, updated_by, updated_at) VALUES (${KEY}, ${JSON.stringify(value)}::jsonb, 'Textbelt', now())
      ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_by = EXCLUDED.updated_by, updated_at = now()
    `;

    if (email === "zero") {
      await sendStaffNotification(SMS_CREDIT_ALERT_EMAIL, "Texts are OFF: Textbelt credit is 0", [
        "Textbelt credit is 0, so the app cannot send any texts (Pin Board, complaints to subs, new accounts).",
        "Emails and phone notifications still go out.",
        "Buy more credit on textbelt.com. The warning on the Pin Board goes away with the next text after that.",
      ]);
    } else if (email === "low") {
      await sendStaffNotification(SMS_CREDIT_ALERT_EMAIL, `Textbelt credit low: ${quota} left`, [
        `Textbelt credit is down to ${quota} texts.`,
        "When it reaches 0 the app stops sending texts (Pin Board, complaints to subs, new accounts).",
        "Buy more credit on textbelt.com.",
      ]);
    }
  } catch (error) {
    console.error("[sms credit] record:", error instanceof Error ? error.message : error);
  }
}
