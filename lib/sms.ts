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
      console.error(
        `[sms] failed (${routeContext}) to ***${last4}: ${data.error || "Textbelt returned success:false"}`
      );
      return { success: false };
    }

    console.log(
      `[sms] sent (${routeContext}) to ***${last4}, quotaRemaining=${data.quotaRemaining}, textId=${data.textId}`
    );
    if (typeof data.quotaRemaining === "number" && data.quotaRemaining < 50) {
      console.warn(`[sms] quota low: ${data.quotaRemaining} remaining`);
    }

    return { success: true, quotaRemaining: data.quotaRemaining, textId: data.textId };
  } catch (error) {
    console.error(
      `[sms] threw (${routeContext}) to ***${last4}:`,
      error instanceof Error ? error.message : error
    );
    return { success: false };
  }
}
