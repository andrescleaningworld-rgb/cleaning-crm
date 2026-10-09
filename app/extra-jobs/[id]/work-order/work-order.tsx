"use client";

import { useEffect, useState } from "react";
import { BigButton, EmptyState, ErrorBox, Screen, SkeletonList } from "@/app/ui";
import { EXTRA_JOBS_RULE, SOURCE_LABEL, STATUS_LABEL, dayLabel, money, type ExtraJob, type ExtraJobAccount } from "@/lib/extraJobs";
import styles from "../../extra-jobs.module.css";

type State = "loading" | "off" | "missing" | "failed" | "ready";

export default function WorkOrder({ id, copy }: { id: string; copy: "sub" | "office" }) {
  const [state, setState] = useState<State>("loading");
  const [job, setJob] = useState<ExtraJob | null>(null);
  const [account, setAccount] = useState<ExtraJobAccount | null>(null);

  useEffect(() => {
    fetch(`/api/extra-jobs?id=${encodeURIComponent(id)}`, { cache: "no-store" })
      .then(async (response) => {
        if (response.status === 404) return setState("missing");
        const body = (await response.json()) as { success?: boolean; ready?: boolean; job?: ExtraJob; account?: ExtraJobAccount | null };
        if (!response.ok || body.success !== true) throw new Error("failed");
        if (body.ready !== true) return setState("off");
        setJob(body.job ?? null);
        setAccount(body.account ?? null);
        setState(body.job ? "ready" : "missing");
      })
      .catch(() => setState("failed"));
  }, [id]);

  const office = copy === "office";
  const place = account ? [account.address, [account.city, account.zip].filter(Boolean).join(" ")].filter(Boolean).join(", ") : "";
  const access = account ? [account.keyAccess, account.hasKey ? `Key: ${account.hasKey}` : "", account.alarmCode ? `Alarm code: ${account.alarmCode}` : ""].filter(Boolean).join("\n") : "";

  return (
    <Screen title={office ? "Work order: office copy" : "Work order: sub copy"} backHref={`/extra-jobs/${encodeURIComponent(id)}`}>
      {state === "loading" ? (
        <SkeletonList rows={3} />
      ) : state === "off" ? (
        <EmptyState title="Not set up here yet" text="Extra Jobs works once this database has its tables." />
      ) : state === "missing" ? (
        <EmptyState title="That extra job was not found" text="It may have been opened from an old link." />
      ) : state === "failed" || !job ? (
        <ErrorBox title="The work order did not load." onRetry={() => window.location.reload()} />
      ) : (
        <>
          <div className={`${styles.buttonRow} no-print`}>
            <BigButton onClick={() => window.print()}>Print</BigButton>
            <BigButton kind="second" href={`/extra-jobs/${job.id}/work-order?copy=${office ? "sub" : "office"}`}>
              {office ? "Show the sub copy" : "Show the office copy"}
            </BigButton>
          </div>

          <div className="ui-print-view">
            <article className={styles.order}>
              <header className={styles.orderHead}>
                <div>
                  <p className={styles.orderBrand}>Cleaning World Inc.</p>
                  <p className={styles.orderTitle}>Extra job work order</p>
                </div>
                <div className={styles.orderNumber}>
                  <strong>{job.jobNumber}</strong>
                  <span className={styles.copyTag}>{office ? "Office copy" : "Sub copy"}</span>
                </div>
              </header>

              <dl className={styles.orderGrid}>
                <div>
                  <dt>Account</dt>
                  <dd>{job.accountName}</dd>
                </div>
                <div>
                  <dt>Date</dt>
                  <dd>{dayLabel(job.jobDate)}</dd>
                </div>
                <div style={{ gridColumn: "1 / -1" }}>
                  <dt>Address</dt>
                  <dd>{place || "Not on file"}</dd>
                </div>
                <div style={{ gridColumn: "1 / -1" }}>
                  <dt>Access and keys</dt>
                  <dd>{access || "Nothing on file. Ask the manager."}</dd>
                </div>
                <div className={styles.orderWhat} style={{ gridColumn: "1 / -1" }}>
                  <dt>What to do</dt>
                  <dd>{job.description}</dd>
                </div>
                <div>
                  <dt>Sub</dt>
                  <dd>{job.subName}</dd>
                </div>
                <div>
                  <dt>Sub pay</dt>
                  <dd>{money(job.subPay)}</dd>
                </div>
                <div>
                  <dt>Manager</dt>
                  <dd>{job.createdBy}</dd>
                </div>
                {office ? (
                  <>
                    <div>
                      <dt>Customer price</dt>
                      <dd>{money(job.customerPrice)}</dd>
                    </div>
                    <div>
                      <dt>Sold by</dt>
                      <dd>{job.soldBy}</dd>
                    </div>
                    <div>
                      <dt>Came in by</dt>
                      <dd>{SOURCE_LABEL[job.source]}</dd>
                    </div>
                    <div>
                      <dt>Status</dt>
                      <dd>
                        {STATUS_LABEL[job.status]}
                        {job.status === "done" ? `, ${job.doneBy}` : ""}
                      </dd>
                    </div>
                    <div>
                      <dt>Sale</dt>
                      <dd>{job.saleId || "None"}</dd>
                    </div>
                    {account?.contactName || account?.phone ? (
                      <div style={{ gridColumn: "1 / -1" }}>
                        <dt>Customer contact</dt>
                        <dd>{[account.contactName, account.phone].filter(Boolean).join(", ")}</dd>
                      </div>
                    ) : null}
                  </>
                ) : null}
              </dl>

              <div className={styles.sign}>
                <span>Done by (name)</span>
                <span>Date done</span>
              </div>
              <p className={styles.orderFoot}>{EXTRA_JOBS_RULE}</p>
            </article>
          </div>
        </>
      )}
    </Screen>
  );
}
