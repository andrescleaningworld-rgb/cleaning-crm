"use client";

// Staff screens: each sub's checklist completion, last 30 days. For showing
// only. It does not change the score.

import { useEffect, useState } from "react";
import type { SubCompletion } from "@/lib/pg/crew-shifts";

export function useChecklistCompletion(): Map<string, SubCompletion> {
  const [bySub, setBySub] = useState<Map<string, SubCompletion>>(new Map());
  useEffect(() => {
    let alive = true;
    fetch("/api/crew-link/shift?view=completion", { cache: "no-store" })
      .then((response) => response.json())
      .then((data: { subs?: SubCompletion[] }) => {
        if (alive) setBySub(new Map((data.subs ?? []).map((sub) => [sub.subId, sub])));
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);
  return bySub;
}

export const completionText = (entry: SubCompletion | undefined) => (entry ? `${entry.percent}% (${entry.done} of ${entry.expected} cleanings)` : "No checklist accounts yet");
