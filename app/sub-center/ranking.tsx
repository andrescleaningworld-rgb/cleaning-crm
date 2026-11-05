"use client";

// Sub Center → Ranking, for the year-end incentive: the top 3 scores of 8.5
// or higher, among subs with at least 10 active accounts. The score is the
// same one on the sub's page (lib/googleSheets.ts computeSubcontractorScore),
// which already makes each complaint cost a small sub more. With the same
// score, the sub with more active accounts places higher. Subs with fewer
// than 10 accounts are listed apart, with no place.

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Card, Counts, EmptyState, ErrorBox, Screen, SkeletonList, StatusPill } from "@/app/ui";
import styles from "./ranking.module.css";

/** The lowest score that can win an incentive. */
export const INCENTIVE_MIN_SCORE = 8.5;
/** How many places win. */
export const INCENTIVE_PLACES = 3;
/** The fewest active accounts a sub needs to be ranked. */
export const INCENTIVE_MIN_ACCOUNTS = 10;

type SubRow = Record<string, string | undefined>;

type Row = {
  id: string;
  name: string;
  contact: string;
  score: number;
  accounts: number;
  openComplaints: number;
};

type Ranked = Row & {
  /** 1 = first. Only the same score AND the same number of accounts share a place. */
  place: number;
  wins: boolean;
};

const pick = (sub: SubRow, keys: string[]) => keys.map((key) => sub[key]).find((value) => value !== undefined && value !== "") ?? "";

/** Highest score first; with the same score, more active accounts first. */
const byScore = (a: Row, b: Row) => b.score - a.score || b.accounts - a.accounts || a.name.localeCompare(b.name);

function split(subs: SubRow[]): { ranked: Ranked[]; tooSmall: Row[] } {
  const rows: Row[] = subs
    // Only subs that clean for us now (a blank status is Active, as on the Subs list).
    .filter((sub) => (pick(sub, ["status", "Status"]) || "Active").trim().toLowerCase() === "active")
    .map((sub) => ({
      id: pick(sub, ["id", "ID", "subcontractorId"]),
      name: pick(sub, ["companyName", "CompanyName", "company"]) || "Unnamed Subcontractor",
      contact: pick(sub, ["contactName", "ContactName"]),
      scoreText: pick(sub, ["score", "Score"]).trim(),
      accounts: Number(pick(sub, ["accountsAssigned", "AccountsAssigned", "Accounts Assigned"])) || 0,
      openComplaints: Number(pick(sub, ["complaints", "Complaints"])) || 0,
    }))
    // With a score, and at least one active account.
    .filter((row) => row.scoreText !== "" && Number.isFinite(Number(row.scoreText)) && row.accounts > 0)
    .map(({ scoreText, ...row }) => ({ ...row, score: Number(scoreText) }))
    .sort(byScore);

  const big = rows.filter((row) => row.accounts >= INCENTIVE_MIN_ACCOUNTS);
  const ranked = big.map((row) => {
    // (10, 30), (10, 12), (10, 12), (9.4, 15) → 1, 2, 2, 4.
    const place = big.findIndex((other) => other.score === row.score && other.accounts === row.accounts) + 1;
    return { ...row, place, wins: place <= INCENTIVE_PLACES && row.score >= INCENTIVE_MIN_SCORE };
  });
  return { ranked, tooSmall: rows.filter((row) => row.accounts < INCENTIVE_MIN_ACCOUNTS) };
}

const MEDAL: Record<number, string> = { 1: "🥇", 2: "🥈", 3: "🥉" };

function placeWord(place: number, tied: boolean) {
  const suffix = place % 100 >= 11 && place % 100 <= 13 ? "th" : ({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[place % 10] ?? "th";
  return `${tied ? "Tied " : ""}${place}${suffix}`;
}

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? "" : "s"}`;

function SubName({ row }: { row: Row }) {
  return row.id ? (
    <Link href={`/subcontractors/${encodeURIComponent(row.id)}`} className="ui-account-link">
      {row.name}
    </Link>
  ) : (
    <>{row.name}</>
  );
}

export default function SubCenterRanking() {
  const [lists, setLists] = useState<{ ranked: Ranked[]; tooSmall: Row[] } | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setError("");
    try {
      const res = await fetch("/api/subcontractors", { cache: "no-store" });
      const data = (await res.json().catch(() => ({}))) as { success?: boolean; error?: string; subcontractors?: SubRow[]; data?: SubRow[] } | SubRow[];
      if (!res.ok || (!Array.isArray(data) && data.success === false)) throw new Error((!Array.isArray(data) && data.error) || "Try again.");
      setLists(split(Array.isArray(data) ? data : data.subcontractors ?? data.data ?? []));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Try again.");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const ranked = lists?.ranked ?? [];
  const tooSmall = lists?.tooSmall ?? [];
  const winners = ranked.filter((row) => row.wins);
  const above = ranked.filter((row) => row.score >= INCENTIVE_MIN_SCORE).length;
  const year = new Date().getFullYear();

  return (
    <Screen
      title="Ranking"
      subtitle={`The top ${INCENTIVE_PLACES} scores of ${INCENTIVE_MIN_SCORE} or higher on December 31, ${year} get the year-end incentive. A sub needs at least ${INCENTIVE_MIN_ACCOUNTS} active accounts to be ranked.`}
    >
      {error ? <ErrorBox title="The ranking did not load." text={error} onRetry={() => void load()} /> : null}
      {!lists && !error ? <SkeletonList rows={4} /> : null}

      {lists ? (
        <>
          <Counts
            label="Ranking at a glance"
            items={[
              { label: "Ranked subs", value: ranked.length, tone: "info" },
              { label: `${INCENTIVE_MIN_SCORE} or higher`, value: above, tone: above > 0 ? "good" : "off" },
              { label: "In the top 3 now", value: winners.length, tone: winners.length > 0 ? "good" : "off" },
            ]}
          />
          {winners.length > INCENTIVE_PLACES ? (
            <p className={styles.tieNote} role="note">
              {winners.length} subs are in the top {INCENTIVE_PLACES}: some have the same score and the same number of accounts. Decide how to break the tie before December 31.
            </p>
          ) : null}

          {ranked.length === 0 ? (
            <EmptyState
              title="No subs to rank yet"
              text={`A sub is ranked once it is Active, has a score and has at least ${INCENTIVE_MIN_ACCOUNTS} active accounts.`}
            />
          ) : (
            <ol className={styles.list} aria-label="Subs by score">
              {ranked.map((row) => {
                const tied = ranked.filter((other) => other.place === row.place).length > 1;
                return (
                  <li key={row.id || row.name} className={`${styles.row} ${row.wins ? styles.win : ""}`.trim()}>
                    <span className={`${styles.place} ${row.wins ? styles.placeWin : ""}`.trim()} aria-label={placeWord(row.place, tied)}>
                      {row.wins ? <span aria-hidden="true">{MEDAL[row.place]}</span> : null}
                      {row.place}
                    </span>
                    <Card title={<SubName row={row} />} right={<span className={styles.score}>{row.score.toFixed(1)}</span>}>
                      {row.contact ? <p className="ui-card-text">{row.contact}</p> : null}
                      <p className="ui-card-text">
                        {placeWord(row.place, tied)} · {plural(row.accounts, "active account")} · {plural(row.openComplaints, "open complaint")}
                      </p>
                      <div className="ui-actions-row" style={{ marginTop: 8 }}>
                        {row.wins ? (
                          <StatusPill kind="done">Incentive: in the top {INCENTIVE_PLACES}</StatusPill>
                        ) : row.score >= INCENTIVE_MIN_SCORE ? (
                          <StatusPill kind="waiting">{INCENTIVE_MIN_SCORE}+ but not in the top {INCENTIVE_PLACES}</StatusPill>
                        ) : (
                          <StatusPill kind="off">Needs {INCENTIVE_MIN_SCORE} to qualify</StatusPill>
                        )}
                      </div>
                    </Card>
                  </li>
                );
              })}
            </ol>
          )}

          {tooSmall.length > 0 ? (
            <section className="ui-stack" aria-label={`Under ${INCENTIVE_MIN_ACCOUNTS} accounts`}>
              <h2 className="ui-section-title">Not ranked yet: under {INCENTIVE_MIN_ACCOUNTS} accounts ({tooSmall.length})</h2>
              <p className="ui-muted">These subs join the ranking when they have {INCENTIVE_MIN_ACCOUNTS} active accounts.</p>
              <ul className={styles.list}>
                {tooSmall.map((row) => (
                  <li key={row.id || row.name}>
                    <Card title={<SubName row={row} />} right={<span className={styles.score}>{row.score.toFixed(1)}</span>}>
                      <p className="ui-card-text">
                        {plural(row.accounts, "active account")} · {plural(row.openComplaints, "open complaint")}
                      </p>
                      <div className="ui-actions-row" style={{ marginTop: 8 }}>
                        <StatusPill kind="off">
                          Needs {INCENTIVE_MIN_ACCOUNTS - row.accounts} more account{INCENTIVE_MIN_ACCOUNTS - row.accounts === 1 ? "" : "s"}
                        </StatusPill>
                      </div>
                    </Card>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <p className="ui-muted">
            Scores change every month: complaints take points off, clean months add them back. A complaint costs a small sub more points than a big one, and with the same
            score the sub with more active accounts places higher. The ranking on December 31 is the one that counts.
          </p>
        </>
      ) : null}
    </Screen>
  );
}
