"use client";

// Extra Jobs: every one-time job a customer asked for, from "Set up" to
// "Ready to invoice". The office's "New" list is the Set up tab; its
// "Ready to invoice" list is the second tab. Cancelled jobs keep their own
// tab, with why. Staff only.

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { BigButton, EmptyState, ErrorBox, Screen, SkeletonList, StatusPill, Tabs } from "@/app/ui";
import { EXTRA_JOBS_RULE, STATUS_LABEL, dayLabel, money, type ExtraJob } from "@/lib/extraJobs";
import styles from "./extra-jobs.module.css";

type Tab = "setup" | "done" | "cancelled" | "all";
type State = "loading" | "off" | "failed" | "ready";

export default function ExtraJobsPage() {
  const [state, setState] = useState<State>("loading");
  const [jobs, setJobs] = useState<ExtraJob[]>([]);
  const [tab, setTab] = useState<Tab>("setup");

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/extra-jobs", { cache: "no-store" });
      const body = (await response.json()) as { success?: boolean; ready?: boolean; jobs?: ExtraJob[] };
      if (!response.ok || body.success !== true) throw new Error("failed");
      if (body.ready !== true) return setState("off");
      setJobs(body.jobs ?? []);
      setState("ready");
    } catch {
      setState("failed");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const counts = useMemo(
    () => ({
      setup: jobs.filter((job) => job.status === "setup").length,
      done: jobs.filter((job) => job.status === "done").length,
      cancelled: jobs.filter((job) => job.status === "cancelled").length,
    }),
    [jobs]
  );
  const shown = tab === "all" ? jobs : jobs.filter((job) => job.status === tab);

  return (
    <Screen title="Extra Jobs">
      <p className={styles.rule}>{EXTRA_JOBS_RULE}</p>

      <div className={styles.topButtons}>
        <BigButton icon="plus" href="/extra-jobs/new">
          Extra job
        </BigButton>
        <BigButton kind="second" href="/extra-jobs/pay">
          Extra jobs to pay
        </BigButton>
      </div>

      {state === "loading" ? (
        <SkeletonList rows={3} />
      ) : state === "off" ? (
        <EmptyState title="Not set up here yet" text="Extra Jobs works once this database has its tables." />
      ) : state === "failed" ? (
        <ErrorBox title="The extra jobs did not load." onRetry={() => void load()} />
      ) : (
        <>
          <Tabs
            tabs={[
              { value: "setup", label: `Set up (${counts.setup})` },
              { value: "done", label: `Ready to invoice (${counts.done})` },
              { value: "cancelled", label: `Cancelled (${counts.cancelled})` },
              { value: "all", label: `All (${jobs.length})` },
            ]}
            value={tab}
            onChange={setTab}
            label="Which extra jobs"
          />

          {shown.length === 0 ? (
            <EmptyState
              title={tab === "setup" ? "No extra jobs waiting" : tab === "done" ? "Nothing ready to invoice" : tab === "cancelled" ? "No cancelled jobs" : "No extra jobs yet"}
              text={
                tab === "done"
                  ? "A job shows here when its manager marks it Done with an after photo."
                  : tab === "cancelled"
                    ? "A cancelled job shows here, with who cancelled it and why."
                    : "Tap Extra job to set one up. It takes under a minute."
              }
              icon={tab === "setup" ? "check" : "inbox"}
            />
          ) : (
            <ul className={styles.list}>
              {shown.map((job) => (
                <li key={job.id}>
                  <Link href={`/extra-jobs/${job.id}`} className={`${styles.job} ${job.status === "done" ? styles.jobDone : job.status === "cancelled" ? styles.jobCancelled : ""}`}>
                    <span className={styles.jobTop}>
                      <span className={styles.number}>{job.jobNumber}</span>
                      <StatusPill kind={job.status === "done" ? "done" : job.status === "cancelled" ? "off" : "waiting"}>{STATUS_LABEL[job.status]}</StatusPill>
                    </span>
                    <span className={styles.jobName}>{job.accountName}</span>
                    <span className={styles.jobWhat}>{job.description}</span>
                    <span className={styles.jobFacts}>
                      {dayLabel(job.jobDate)} · {job.subName} · {money(job.customerPrice)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </Screen>
  );
}
