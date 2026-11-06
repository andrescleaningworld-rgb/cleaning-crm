"use client";

// The Cleaning World Score card at the top of Overview (GET /api/cw-score,
// rules in lib/pg/cw-score.ts): the score and its band in the band's color,
// the change since about 30 days ago, and three small numbers. Nothing to
// tap: who pulls the score down is on Sub Center (app/sub-center/score-pull.tsx).
// Open complaints and complaints this month come from the Overview page's own
// complaint list, so they match its counters.

import { useEffect, useState } from "react";
import type { CwBand, CwScore } from "@/lib/pg/cw-score";
import styles from "./overview.module.css";

const BAND_CLASS: Record<CwBand, string> = {
  Excellent: styles.cwGood,
  Good: styles.cwGood,
  "Needs Attention": styles.cwWarn,
  "High Risk": styles.cwBad,
};

const shortDay = (day: string) => (day ? new Date(`${day}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "");

function addDaysIso(day: string, count: number): string {
  const date = new Date(`${day}T12:00:00`);
  date.setDate(date.getDate() + count);
  return date.toISOString().slice(0, 10);
}

function ChangeLine({ data }: { data: CwScore }) {
  if (data.change === null) {
    return (
      <p className={styles.cwChange}>
        {data.historySince
          ? `The change since last month shows from ${shortDay(addDaysIso(data.historySince, 30))} (saved daily since ${shortDay(data.historySince)}).`
          : "The change since last month shows once 30 days of daily scores are saved."}
      </p>
    );
  }
  const word = data.change > 0 ? "▲" : data.change < 0 ? "▼" : "■";
  const tone = data.change > 0 ? styles.cwGood : data.change < 0 ? styles.cwBad : "";
  return (
    <p className={`${styles.cwChange} ${tone}`.trim()}>
      {word} {Math.abs(data.change).toFixed(1)} since last month
      {data.change === 0 ? " (no change)" : ""}
    </p>
  );
}

export default function CwScoreCard({ openComplaints, complaintsThisMonth }: { openComplaints: string; complaintsThisMonth: string }) {
  const [data, setData] = useState<CwScore | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    fetch("/api/cw-score", { cache: "no-store" })
      .then(async (response) => {
        const body = (await response.json().catch(() => ({}))) as { success?: boolean } & Partial<CwScore>;
        if (!alive) return;
        if (response.ok && body.success) setData(body as CwScore);
        else setFailed(true);
      })
      .catch(() => {
        if (alive) setFailed(true);
      });
    return () => {
      alive = false;
    };
  }, []);

  const bandClass = data?.band ? BAND_CLASS[data.band] : "";

  return (
    <section className={`${styles.cwCard} ${styles.cwBody}`} aria-label="Cleaning World Score">
      <h2 className={styles.cwTitle}>Cleaning World Score</h2>
      {failed ? (
        <p className={styles.note}>The score did not load. Pull down to try again.</p>
      ) : !data ? (
        <p className={styles.note}>Working it out…</p>
      ) : data.score === null ? (
        <p className={styles.note}>No sub to count yet: no sub has sub pay on active accounts.</p>
      ) : (
        <>
          <p className={styles.cwScoreRow}>
            <span className={`${styles.cwScore} ${bandClass}`}>{data.score.toFixed(1)}</span>
            <span className={`${styles.cwBand} ${bandClass}`}>{data.band}</span>
          </p>
          <ChangeLine data={data} />
        </>
      )}
      <p className={styles.cwSmall}>
        <span>
          <strong>{openComplaints}</strong> open complaints
        </span>
        <span>
          <strong>{complaintsThisMonth}</strong> complaints this month
        </span>
        <span>
          <strong>{data ? data.subsBelow7 : "…"}</strong> {data?.subsBelow7 === 1 ? "sub" : "subs"} below 7
        </span>
      </p>
    </section>
  );
}
