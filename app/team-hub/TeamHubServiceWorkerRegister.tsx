"use client";

import { useEffect } from "react";

// Mirrors app/components/ServiceWorkerRegister.tsx's shape, but registers a
// DIFFERENT script (public/team-hub-sw.js) with an explicit narrower scope
// so it only ever controls /team-hub/* pages — the main app's /sw.js
// registration (root layout, scope "/") is untouched and keeps controlling
// everything else.
export default function TeamHubServiceWorkerRegister() {
  useEffect(() => {
    if (
      typeof window !== "undefined" &&
      "serviceWorker" in navigator &&
      process.env.NODE_ENV === "production"
    ) {
      navigator.serviceWorker.register("/team-hub-sw.js", { scope: "/team-hub/" }).catch((error) => {
        console.error("Team Hub service worker registration failed:", error);
      });
    }
  }, []);

  return null;
}
