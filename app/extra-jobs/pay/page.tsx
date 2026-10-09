"use client";

// "Extra jobs to pay": what each sub is owed for extra jobs in one pay
// period. Built only from jobs that are in the app and marked Done. The pay
// period is a calendar month unless other days are picked; a job counts in
// the period its job date falls in.

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { BigButton, EmptyState, ErrorBox, Field, Screen, SkeletonList } from "@/app/ui";
import { EXTRA_JOBS_RULE, dayLabel, isDay, money, monthOf, todayDay, type PayRow } from "@/lib/extraJobs";
import styles from "../extra-jobs.module.css";

type State = "loading" | "off" | "failed" | "ready";

export default function ExtraJobsPayPage() {
  const [state, setState] = useState<State>("loading");
  const [from, setFrom] = useState(() => monthOf(todayDay()).from);
  const [to, setTo] = useState(() => monthOf(todayDay()).to);
  const [rows, setRows] = useState<PayRow[]>([]);
  const validRange = isDay(from) && isDay(to) && to >= from;

  const load = useCallback(async () => {
    if (!validRange) return;
    setState("loading");
    try {
      const response = await fetch(`/api/extra-jobs?view=pay&from=${from}&to=${to}`, { cache: "no-store" });
      const body = (await response.json()) as { success?: boolean; ready?: boolean; rows?: PayRow[] };
      if (!response.ok || body.success !== true) throw new Error("failed");
      if (body.ready !== true) return setState("off");
      setRows(body.rows ?? []);
      setState("ready");
    } catch {
      setState("failed");
    }
  }, [from, to, validRange]);

  useEffect(() => {
    void load();
  }, [load]);

  const month = from.slice(0, 7);
  const isWholeMonth = isDay(from) && monthOf(from).from === from && monthOf(from).to === to;
  const total = Math.round(rows.reduce((sum, row) => sum + row.total, 0) * 100) / 100;
  const jobCount = rows.reduce((sum, row) => sum + row.jobs.length, 0);

  return (
    <Screen title="Extra jobs to pay" backHref="/extra-jobs">
      <p className={styles.rule}>{EXTRA_JOBS_RULE}</p>

      <div className={`${styles.period} no-print`}>
        <Field
          label="Month"
          type="month"
          value={isWholeMonth ? month : ""}
          onChange={(event) => {
            if (!/^\d{4}-\d{2}$/.test(event.target.value)) return;
            const period = monthOf(`${event.target.value}-01`);
            setFrom(period.from);
            setTo(period.to);
          }}
        />
        <Field label="From" type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
        <Field label="To" type="date" value={to} onChange={(event) => setTo(event.target.value)} />
        <BigButton kind="second" onClick={() => window.print()}>
          Print
        </BigButton>
      </div>
      {!validRange ? <p className="ui-field-error">Pick the first and the last day of the pay period.</p> : null}

      {state === "loading" ? (
        <SkeletonList rows={3} />
      ) : state === "off" ? (
        <EmptyState title="Not set up here yet" text="Extra Jobs works once this database has its tables." />
      ) : state === "failed" ? (
        <ErrorBox title="The report did not load." onRetry={() => void load()} />
      ) : (
        <div className="ui-print-view">
          <div className="ui-stack">
            <h2 className="ui-section-title">
              Extra jobs to pay, {dayLabel(from, false)} to {dayLabel(to, false)}
            </h2>
            <p className="ui-muted">Done jobs only, by the date of the job. A job that is not in the app, or not marked Done, is not here.</p>

            {rows.length === 0 ? (
              <EmptyState title="No extra jobs to pay in these days" text="A job shows here once its manager marks it Done." icon="inbox" />
            ) : (
              <>
                {rows.map((row) => (
                  <section key={row.subId || row.subName} className="ui-card">
                    <h3 className="ui-card-title">{row.subName}</h3>
                    <table className={styles.payTable}>
                      <thead>
                        <tr>
                          <th scope="col">Job</th>
                          <th scope="col">Date</th>
                          <th scope="col">Account</th>
                          <th scope="col">What</th>
                          <th scope="col" className={styles.amount}>
                            Sub pay
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {row.jobs.map((job) => (
                          <tr key={job.id}>
                            <td>
                              <Link className="ui-link" href={`/extra-jobs/${job.id}`}>
                                {job.jobNumber}
                              </Link>
                            </td>
                            <td>{dayLabel(job.jobDate, false)}</td>
                            <td>{job.accountName}</td>
                            <td>{job.description}</td>
                            <td className={styles.amount}>{money(job.subPay)}</td>
                          </tr>
                        ))}
                        <tr className={styles.payTotal}>
                          <td colSpan={4}>
                            Total for {row.subName} ({row.jobs.length} {row.jobs.length === 1 ? "job" : "jobs"})
                          </td>
                          <td className={styles.amount}>{money(row.total)}</td>
                        </tr>
                      </tbody>
                    </table>
                  </section>
                ))}
                <p className={styles.grand}>
                  <span>
                    All subs ({jobCount} {jobCount === 1 ? "job" : "jobs"})
                  </span>
                  <span>{money(total)}</span>
                </p>
              </>
            )}
          </div>
        </div>
      )}
    </Screen>
  );
}
