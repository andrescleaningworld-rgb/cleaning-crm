"use client";

// The Cleaning World Score card at the top of Overview (GET /api/cw-score,
// rules in lib/pg/cw-score.ts). The score and its band in the band's color,
// the change since about 30 days ago, and three small numbers. Tap the card
// for the subs that pull the score down the most, each linked to their page.
// Open complaints and complaints this month come from the Overview page's own
// complaint list, so they match its counters.

import Link from "next/link";
import { useEffect, useState } from "react";
import type { CwBand, CwScore } from "@/lib/pg/cw-score";
import styles from "./overview.module.css";

const BAND_CLASS: Record<CwBand, string> = {
  Excellent: styles.cwGood,
  Good: styles.cwGood,
  "Needs Attention": styles.cwWarn,
  "High Risk": styles.cwBad,
};

const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const shortDay = (day: string) => (day ? new Date(`${day}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "");

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

function addDaysIso(day: string, count: number): string {
  const date = new Date(`${day}T12:00:00`);
  date.setDate(date.getDate() + count);
  return date.toISOString().slice(0, 10);
}

export default function CwScoreCard({ openComplaints, complaintsThisMonth }: { openComplaints: string; complaintsThisMonth: string }) {
  const [data, setData] = useState<CwScore | null>(null);
  const [failed, setFailed] = useState(false);
  const [open, setOpen] = useState(false);

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
    <section className={styles.cwCard} aria-label="Cleaning World Score">
      <button type="button" className={styles.cwButton} aria-expanded={open} aria-controls="cw-score-subs" onClick={() => setOpen((value) => !value)} disabled={!data}>
        <span className={styles.cwTitle}>Cleaning World Score</span>
        {failed ? (
          <span className={styles.note}>The score did not load. Pull down to try again.</span>
        ) : !data ? (
          <span className={styles.note}>Working it out…</span>
        ) : data.score === null ? (
          <span className={styles.note}>No sub to count yet: no sub has sub pay on active accounts.</span>
        ) : (
          <>
            <span className={styles.cwScoreRow}>
              <span className={`${styles.cwScore} ${bandClass}`}>{data.score.toFixed(1)}</span>
              <span className={`${styles.cwBand} ${bandClass}`}>{data.band}</span>
            </span>
            <ChangeLine data={data} />
          </>
        )}
        <span className={styles.cwSmall}>
          <span>
            <strong>{openComplaints}</strong> open complaints
          </span>
          <span>
            <strong>{complaintsThisMonth}</strong> complaints this month
          </span>
          <span>
            <strong>{data ? data.subsBelow7 : "…"}</strong> {data?.subsBelow7 === 1 ? "sub" : "subs"} below 7
          </span>
        </span>
        {data && data.score !== null ? <span className={styles.openHint}>{open ? "Tap to close ▲" : "Tap to see who pulls it down ▼"}</span> : null}
      </button>

      {open && data ? (
        <div id="cw-score-subs" className={styles.cwList}>
          <p className={styles.note}>
            {data.subsCounted} subs counted, {money.format(data.totalPay)} a month in sub pay. A sub who gets more of the pay counts more: the points below are how much each one takes
            off a perfect 10.
          </p>
          {data.pullingDown.length === 0 ? (
            <p className={styles.allGood}>Every counted sub is at 10 ✓</p>
          ) : (
            <ol className={styles.cwSubs}>
              {data.pullingDown.slice(0, 10).map((sub) => (
                <li key={sub.subId}>
                  <Link href={`/subcontractors/${encodeURIComponent(sub.subId)}`} className="ui-account-link">
                    {sub.name}
                  </Link>
                  <span className={styles.cwSubFacts}>
                    Score {sub.score.toFixed(1)} · {Math.round(sub.weight * 100)}% of sub pay · takes off {sub.pullDown.toFixed(2)}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </div>
      ) : null}
    </section>
  );
}
