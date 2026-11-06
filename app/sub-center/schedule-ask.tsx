"use client";

// Sub Center → Schedules to set. Subs are asked to set the real schedule of
// their Active accounts that have none (the box at the top of their portal,
// app/subcontractor-portal/schedule-ask.tsx). Per sub: how many are still to
// set and how many they set, most missing first. Accounts with no sub, or on
// the "Cleaning World" / "Pending ask Patricia" records, are the office's own
// list: no sub will fill those in. Server: GET /api/admin/schedule-ask.
// Nothing is emailed: the office tells the subs.

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Card, Counts, EmptyState, ErrorBox, Screen, SkeletonList, StatusPill } from "@/app/ui";
import AccountLink from "@/app/components/AccountLink";
import type { AskOfficeAccount, AskProgressSub } from "@/lib/pg/schedule-ask";

type Data = { subs: AskProgressSub[]; office: AskOfficeAccount[] };

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? "" : "s"}`;

export default function SubCenterScheduleAsk() {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState("");
  const [openSub, setOpenSub] = useState("");

  const load = useCallback(async () => {
    setError("");
    try {
      const response = await fetch("/api/admin/schedule-ask", { cache: "no-store" });
      const body = (await response.json().catch(() => ({}))) as { success?: boolean; error?: string } & Partial<Data>;
      if (!response.ok || !body.success) throw new Error(body.error || "The list did not load.");
      setData({ subs: body.subs ?? [], office: body.office ?? [] });
    } catch (err) {
      setError(err instanceof Error ? err.message : "The list did not load.");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const onSubs = data ? data.subs.reduce((sum, sub) => sum + sub.missing.length, 0) : 0;
  const setBySubs = data ? data.subs.reduce((sum, sub) => sum + sub.setCount, 0) : 0;

  return (
    <Screen
      title="Schedules to set"
      subtitle="Active accounts with no Cleaning schedule. Each sub sees their own list at the top of their portal and sets the real days and times. Nothing is emailed: tell them yourself."
    >
      {error ? <ErrorBox title="The list did not load." text={error} onRetry={() => void load()} /> : null}
      {!data && !error ? <SkeletonList rows={4} /> : null}

      {data ? (
        <>
          <Counts
            label="Schedules to set at a glance"
            items={[
              { label: "Still to set by subs", value: onSubs, tone: onSubs > 0 ? "bad" : "good" },
              { label: "Set by subs", value: setBySubs, tone: setBySubs > 0 ? "good" : "off" },
              { label: "For the office", value: data.office.length, tone: data.office.length > 0 ? "bad" : "good" },
            ]}
          />

          <section className="ui-stack" aria-label="By sub">
            <h2 className="ui-section-title">By sub</h2>
            {data.subs.length === 0 ? (
              <EmptyState title="Nothing to set" text="Every Active account of every sub has a schedule." />
            ) : (
              <ul className="ui-list-plain" style={{ gap: 10 }}>
                {data.subs.map((sub) => {
                  const open = openSub === sub.subRecordId;
                  return (
                    <li key={sub.subRecordId}>
                      <Card
                        title={sub.subName || sub.subRecordId}
                        right={<span style={{ fontSize: 28, fontWeight: 800 }}>{sub.missing.length}</span>}
                      >
                        {sub.contactName && sub.contactName !== sub.subName ? <p className="ui-card-text">{sub.contactName}</p> : null}
                        <p className="ui-card-text">
                          {plural(sub.missing.length, "account")} still to set · {sub.setCount} set by them
                        </p>
                        <div className="ui-actions-row" style={{ marginTop: 8 }}>
                          {sub.missing.length === 0 ? <StatusPill kind="done">All set</StatusPill> : <StatusPill kind="waiting">Waiting for the sub</StatusPill>}
                          {sub.missing.length > 0 ? (
                            <button type="button" className="ui-btn ui-btn-quiet" aria-expanded={open} onClick={() => setOpenSub(open ? "" : sub.subRecordId)}>
                              {open ? "Hide accounts" : "Show accounts"}
                            </button>
                          ) : null}
                        </div>
                        {open ? (
                          <ul className="ui-list-plain" style={{ gap: 4, marginTop: 8 }}>
                            {sub.missing.map((account) => (
                              <li key={account.accountId} className="ui-card-text">
                                <AccountLink accountId={account.accountId} name={account.accountName || account.accountId} />
                              </li>
                            ))}
                          </ul>
                        ) : null}
                      </Card>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section className="ui-stack" aria-label="For the office">
            <h2 className="ui-section-title">For the office ({data.office.length})</h2>
            <p className="ui-muted">No sub, or on the Cleaning World or Pending ask Patricia records: no sub will fill these in. Add each schedule from Sub Schedules.</p>
            {data.office.length === 0 ? (
              <EmptyState title="Nothing for the office" text="These all have a schedule." />
            ) : (
              <ul className="ui-list-plain" style={{ gap: 10 }}>
                {data.office.map((account) => (
                  <li key={account.accountId}>
                    <Card title={<AccountLink accountId={account.accountId} name={account.accountName || account.accountId} />}>
                      <p className="ui-card-text">{account.subName || "No sub"}</p>
                      <div className="ui-actions-row" style={{ marginTop: 8 }}>
                        <Link className="ui-btn ui-btn-second" href={account.addHref}>
                          Add schedule
                        </Link>
                      </div>
                    </Card>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      ) : null}
    </Screen>
  );
}
