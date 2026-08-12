"use client";

import { useEffect } from "react";
import OneSignal from "react-onesignal";
import { ONESIGNAL_APP_ID } from "@/lib/oneSignalAppId";

const MANAGER_ID_STORAGE_KEY = "cwManagerId";

// Module-level guard (not component state): React 19 Strict Mode
// double-invokes effects in dev, and OneSignal throws if init() is called
// more than once per page load.
let initialized = false;

// Exists unconditionally at module load (not created inside the component's
// effect) so identifyManager below always has something to await regardless
// of whether it's called before or after OneSignalInit's own effect has run
// — sibling client components on the same page can't rely on effect order.
// Resolved by the effect once OneSignal.init() settles, success or failure.
let resolveInitSettled: () => void;
const initSettled: Promise<void> = new Promise((resolve) => {
  resolveInitSettled = resolve;
});

// A failed init() does NOT leave the SDK object safely usable — confirmed
// live: calling OneSignal.login() after a failed init() (e.g. "App not
// configured for web push," the OneSignal dashboard's Web Push channel
// never having been set up for this app id) throws its own unrelated-looking
// internal error ("Cannot read properties of undefined") from deep inside
// the SDK, rather than failing cleanly. Tracked separately from
// initSettled so identifyManager can skip login() entirely on that path
// and log the real cause once, instead of surfacing the SDK's confusing
// secondary crash.
let initSucceeded = false;

export default function OneSignalInit() {
  useEffect(() => {
    if (initialized) return;
    initialized = true;

    // Registered at its own /push/onesignal/ scope, deliberately kept
    // separate from the app's existing PWA service worker (public/sw.js,
    // registered at root scope by ServiceWorkerRegister.tsx) — this is
    // OneSignal's own recommended approach for sites with an existing
    // service worker, since only one worker can control a given scope and
    // merging the two into one file is unnecessary added risk here.
    OneSignal.init({
      appId: ONESIGNAL_APP_ID,
      serviceWorkerPath: "push/onesignal/OneSignalSDKWorker.js",
      serviceWorkerParam: { scope: "/push/onesignal/" },
      allowLocalhostAsSecureOrigin: true,
    })
      .then(() => {
        initSucceeded = true;
      })
      .catch((error) => {
        console.error("OneSignal init failed:", error);
      })
      .finally(() => resolveInitSettled());

    // Re-identify a returning manager (new tab, browser restart, etc.) —
    // login() is what links this browser's push subscription to the
    // manager id the server-side send (lib/push.ts) targets via
    // include_aliases. Only ever set by identifyManager below, from the
    // "notify me for my assignments" picker on the To-Do page.
    const storedId = getStoredManagerId();
    if (storedId) identifyManager(storedId);
  }, []);

  return null;
}

export function getStoredManagerId(): string {
  if (typeof window === "undefined") return "";
  return window.localStorage.getItem(MANAGER_ID_STORAGE_KEY) ?? "";
}

// Called by the To-Do page when a manager picks their own name from the
// "notify me for my assignments" control. Persists the choice so future
// visits re-identify automatically (see the effect above), then tags this
// browser's OneSignal subscription with it. Never throws — same
// best-effort, "don't break the caller" convention as lib/sms.ts's
// sendSms: a manager who hasn't granted push permission yet still gets
// tagged, so login() has already run by the time they do grant it.
export async function identifyManager(managerId: string): Promise<void> {
  const id = managerId.trim();
  if (!id) return;

  if (typeof window !== "undefined") {
    window.localStorage.setItem(MANAGER_ID_STORAGE_KEY, id);
  }

  await initSettled;
  if (!initSucceeded) {
    // Already logged once, loudly, by the init() failure above — this is
    // just the quiet downstream consequence of it, not a new problem.
    console.debug("[push] skip login(): OneSignal.init() did not succeed");
    return;
  }

  try {
    await OneSignal.login(id);
  } catch (error) {
    console.error("[push] OneSignal.login failed:", error instanceof Error ? error.message : error);
  }
}
