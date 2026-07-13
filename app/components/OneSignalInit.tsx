"use client";

import { useEffect } from "react";
import OneSignal from "react-onesignal";

const ONESIGNAL_APP_ID = "1812df0b-4118-457e-9a38-f484bf0337a9";

// Module-level guard (not component state): React 19 Strict Mode
// double-invokes effects in dev, and OneSignal throws if init() is called
// more than once per page load.
let initialized = false;

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
    }).catch((error) => {
      console.error("OneSignal init failed:", error);
    });
  }, []);

  return null;
}
