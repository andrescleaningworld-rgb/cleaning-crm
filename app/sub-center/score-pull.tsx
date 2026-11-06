"use client";

// Sub Center, at the top: "Who's pulling our score down". The subs that take
// the most off the Cleaning World Score (Overview), from GET /api/cw-score
// (lib/pg/cw-score.ts): each sub's share of the sub pay × how far their score
// is below 10. Staff only, like the rest of Sub Center. Nothing shows when no
// sub takes anything off.

import Link from "next/link";
import { useEffect, useState } from "react";
import type { CwScore } from "@/lib/pg/cw-score";

const SHOW = 5;

function shareText(weight: number): string {
  const percent = weight * 100;
  return percent < 1 ? "less than 1%" : `${Math.round(percent)}%`;
}

export default function ScorePull() {
  const [subs, setSubs] = useState<CwScore["pullingDown"] | null>(null);

  useEffect(() => {
    let alive = true;
    fetch("/api/cw-score", { cache: "no-store" })
      .then(async (response) => {
        const body = (await response.json().catch(() => ({}))) as { success?: boolean } & Partial<CwScore>;
        if (alive && response.ok && body.success) setSubs(body.pullingDown ?? []);
      })
      // Best effort: the section just does not show.
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  if (!subs || subs.length === 0) return null;

  return (
    <section className="ui-card" aria-label="Who's pulling our score down" style={{ marginBottom: 16 }}>
      <h2 className="ui-card-title">Who&apos;s pulling our score down</h2>
      <p className="ui-muted">Bigger subs count more. Here&apos;s who&apos;s pulling our score down the most:</p>
      <ol style={{ margin: "8px 0 0", paddingLeft: 24, display: "flex", flexDirection: "column", gap: 8 }}>
        {subs.slice(0, SHOW).map((sub) => (
          <li key={sub.subId}>
            <Link href={`/subcontractors/${encodeURIComponent(sub.subId)}`} className="ui-account-link">
              {sub.name}
            </Link>
            <span className="ui-muted" style={{ display: "block" }}>
              Score {sub.score.toFixed(1)} · does {shareText(sub.weight)} of our work · costs us {sub.pullDown.toFixed(2)} points
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}
