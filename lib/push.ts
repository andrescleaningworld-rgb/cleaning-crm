// Requires ONESIGNAL_REST_API_KEY in .env.local (added to Vercel directly —
// not present locally as of this writing, so a local dev run will hit the
// early "not configured" skip below rather than actually sending). Mirrors
// lib/sms.ts's shape and conventions: a thin, best-effort wrapper around a
// third-party send API, used alongside sendSms from the same trigger points
// in app/api/to-do/route.ts so a to-do notification goes out over both
// channels. Never throws — same "a provider outage never breaks the
// caller's request" convention as sendSms.

import { ONESIGNAL_APP_ID } from "./oneSignalAppId";

const ONESIGNAL_API_URL = "https://api.onesignal.com/notifications";

export async function sendPush(
  externalUserId: string,
  title: string,
  body: string,
  url: string,
  routeContext: string = "unknown"
): Promise<{ success: boolean }> {
  const restApiKey = process.env.ONESIGNAL_REST_API_KEY;
  if (!restApiKey) {
    console.warn(`[push] skip (${routeContext}): ONESIGNAL_REST_API_KEY not configured`);
    return { success: false };
  }

  try {
    const response = await fetch(ONESIGNAL_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        // Current OneSignal REST API auth format (not the older "Basic"
        // prefix some out-of-date docs/examples still show).
        Authorization: `Key ${restApiKey}`,
      },
      body: JSON.stringify({
        app_id: ONESIGNAL_APP_ID,
        // include_aliases + target_channel is the current, non-deprecated
        // way to target a user by external id (OneSignal.login()'s id) —
        // include_external_user_ids still technically works but is being
        // phased out in favor of this.
        include_aliases: { external_id: [externalUserId] },
        target_channel: "push",
        headings: { en: title },
        contents: { en: body },
        url,
      }),
    });

    const data = (await response.json()) as { id?: string; errors?: unknown; recipients?: number };

    // OneSignal returns HTTP 200 with an "errors" array (not a non-2xx
    // status) for the most common real-world case here: the target
    // external_id has no active push subscription (never granted browser
    // permission, or was tagged via OneSignal.login() but hasn't had that
    // subscription confirmed yet) — e.g. {"id":"","errors":["All included
    // players are not subscribed"],"recipients":0}. That's an expected,
    // silent-skip outcome for this app's callers (SMS/other channels may
    // still be the manager's real notification path), not a bug to
    // surface loudly.
    const hasErrors = Array.isArray(data.errors) && data.errors.length > 0;
    if (!response.ok || hasErrors) {
      console.warn(
        `[push] not delivered (${routeContext}) to ${externalUserId}:`,
        hasErrors ? data.errors : `HTTP ${response.status}`
      );
      return { success: false };
    }

    console.log(`[push] sent (${routeContext}) to ${externalUserId}, notificationId=${data.id}`);
    return { success: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[push] threw (${routeContext}) to ${externalUserId}:`, message);
    return { success: false };
  }
}
