// Requires TEXTBELT_API_KEY in .env.local. Best-effort only: every call is
// wrapped so a Textbelt outage or missing key never breaks the caller's
// request — same "never throws" convention as lib/googleCalendar.ts.

const SMS_MAX_BYTES = 140;

// Textbelt bills by segment past 140 bytes, and non-ASCII punctuation (curly
// quotes, em dashes, ellipses) silently pushes a message into multi-segment
// GSM-7/UCS-2 encoding — this collapses those back to plain ASCII before
// truncating so callers can build messages from free-text sheet fields
// without hand-sanitizing every string themselves. \n is explicitly kept
// alongside the printable-ASCII range: multi-line bodies (title/description/
// link) rely on it as their only separator, and \x20-\x7E excludes it like
// any other control character — omitting it here silently glued every line
// of a message together with no separator at all.
export function sanitizeSmsText(text: string, maxBytes: number = SMS_MAX_BYTES): string {
  const asciiOnly = text
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/…/g, "...")
    .replace(/[^\x20-\x7E\n]/g, "");

  return asciiOnly.length > maxBytes ? asciiOnly.slice(0, maxBytes) : asciiOnly;
}

// Single-segment GSM-7 budget. Callers that want the full body sent
// regardless of segment count (see notifyManagerOfNewToDo and its
// account/complaint equivalents) pass sanitizeSmsText(text, Infinity) rather
// than truncating — this just logs so segment count stays visible.
const SMS_SEGMENT_WARN_LENGTH = 160;

// Exported so the /to-do quota banner (app/api/to-do/sms-quota/route.ts)
// uses the exact same cutoff as this file's own console.warn below, rather
// than a second hardcoded number that could drift out of sync with it.
export const SMS_LOW_QUOTA_THRESHOLD = 50;

// Textbelt's own error text sometimes embeds a live URL containing the
// caller's API key — confirmed live: an "Out of quota" response reads
// "Out of quota. Refill at https://textbelt.com/purchase?key=<the active
// key>". That went straight into console.error unfiltered and leaked a
// real key into Vercel's logs. Strips any URL out of third-party error
// text before it's ever logged, protecting whichever key is active at the
// time regardless of today's specific rotation.
function redactUrls(text: string): string {
  return text.replace(/https?:\/\/\S+/gi, "[URL removed]");
}

export async function sendSms(
  phone: string,
  message: string,
  routeContext: string = "unknown"
): Promise<{ success: boolean; quotaRemaining?: number; textId?: string | number }> {
  const last4 = phone.slice(-4);

  if (message.length > SMS_SEGMENT_WARN_LENGTH) {
    console.warn(
      `[sms] message is ${message.length} chars (${routeContext}) — exceeds one SMS segment (${SMS_SEGMENT_WARN_LENGTH}), Textbelt will send multi-segment`
    );
  }

  try {
    const response = await fetch("https://textbelt.com/text", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        phone,
        message,
        key: process.env.TEXTBELT_API_KEY,
      }),
    });

    const data = (await response.json()) as {
      success?: boolean;
      quotaRemaining?: number;
      // Only present when success=true (Textbelt's own docs) — this is what
      // GET https://textbelt.com/status/:textId needs to look up delivery
      // status (DELIVERED/SENT/SENDING/FAILED/UNKNOWN) after the fact.
      // Previously discarded entirely, which made a "logged success but no
      // text arrived" report unactionable — nothing to look up.
      textId?: string | number;
      error?: string;
    };

    if (!data.success) {
      const safeError = data.error ? redactUrls(data.error) : "Textbelt returned success:false";
      console.error(`[sms] failed (${routeContext}) to ***${last4}: ${safeError}`);
      // Textbelt includes quotaRemaining on failure responses too (confirmed
      // live: an "Out of quota" error came back with quotaRemaining:0) — this
      // was previously dropped here, which meant fetchLatestSmsQuota (the
      // /to-do low-quota banner) could only ever see a number from a
      // successful send. With quota actually at 0, every send has been
      // failing, so that banner had no way to ever fire despite the account
      // being fully depleted.
      return { success: false, quotaRemaining: data.quotaRemaining };
    }

    console.log(
      `[sms] sent (${routeContext}) to ***${last4}, quotaRemaining=${data.quotaRemaining}, textId=${data.textId}`
    );
    if (typeof data.quotaRemaining === "number" && data.quotaRemaining < SMS_LOW_QUOTA_THRESHOLD) {
      console.warn(`[sms] quota low: ${data.quotaRemaining} remaining`);
    }

    return { success: true, quotaRemaining: data.quotaRemaining, textId: data.textId };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[sms] threw (${routeContext}) to ***${last4}:`, redactUrls(message));
    return { success: false };
  }
}
