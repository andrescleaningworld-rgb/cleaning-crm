"use client";

// The visit types the visit forms offer: Settings -> Visit Types (saved in
// feature_settings as "visitTypes"). Starts with the built-in list so the
// form works at once; the saved list replaces it when it arrives.

import { useEffect, useState } from "react";
import { DEFAULT_VISIT_TYPES, type VisitTypesSetting } from "@/lib/featureSettings";

/** The active visit types, plus `keep` (the value already on the form) if it is not one of them, so a saved visit never loses its type. */
export function useVisitTypes(keep?: string): string[] {
  const [active, setActive] = useState<string[]>(DEFAULT_VISIT_TYPES);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/feature-settings", { cache: "no-store" })
      .then((response) => response.json())
      .then((data: { settings?: { visitTypes?: VisitTypesSetting } }) => {
        const list = data.settings?.visitTypes?.active;
        if (!cancelled && Array.isArray(list) && list.length > 0) setActive(list);
      })
      .catch((error) => console.error("[visit types] the saved list did not load; using the built-in one:", error));
    return () => {
      cancelled = true;
    };
  }, []);

  const current = (keep ?? "").trim();
  return current && !active.some((type) => type.toLowerCase() === current.toLowerCase()) ? [...active, current] : active;
}
