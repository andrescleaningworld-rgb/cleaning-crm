// The one door for every text and push the app sends (docs/unification-plan.md,
// Phase 5). The words and the timing stay with each feature; how a message goes
// out and how it is written down live here. Server only.
//
//   sendText(phone, message, context)        a text
//   sendText(phone, message, context, logAs) the same, written to the text log
//                                            under that name (a to-do's id, or
//                                            "board:<paper>")
//   logText(entry)                           a log line with no text (a skip or a failed lookup)
//   sendPush                                 a push
//
// A log problem never hides what really happened to the text.

import { appendSmsLog } from "@/lib/data/todos";
import { sendSms } from "@/lib/sms";

export { sendPush } from "@/lib/push";

export async function logText(entry: Parameters<typeof appendSmsLog>[0]): Promise<void> {
  try {
    await appendSmsLog(entry);
  } catch (error) {
    console.error("[sms] failed to write SmsLog row:", error instanceof Error ? error.message : error);
  }
}

export async function sendText(phone: string, message: string, context: string, logAs?: string): Promise<Awaited<ReturnType<typeof sendSms>>> {
  const result = await sendSms(phone, message, context);
  if (logAs) {
    await logText({
      toDoId: logAs,
      managerPhone: phone,
      textId: result.textId !== undefined ? String(result.textId) : "",
      status: result.success ? "sent" : "failed",
      quotaRemaining: result.quotaRemaining,
    });
  }
  return result;
}
