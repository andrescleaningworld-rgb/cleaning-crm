"use client";

// Active accounts with no Sub Schedule (lib/pg/no-schedule.ts). Coverage →
// "Who's free?" cannot count them, so they are put in front of the office:
//   <NoScheduleTile />                  Accounts Center: the red "No schedule" tile and its list
//   <NoScheduleBanner accountId="…" />  the account page: a red banner at the top
// "Add schedule" opens Sub Schedules with Add schedule open for that account.
// Nothing shows when there is nothing to add.

import { useEffect, useState } from "react";
import { BigButton } from "@/app/ui";
import AccountLink from "./AccountLink";

type Missing = { accountId: string; accountName: string; subName: string; cleaningDays: string; frequency: string; addHref: string };

export function NoScheduleTile() {
  const [accounts, setAccounts] = useState<Missing[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let alive = true;
    fetch("/api/no-schedule", { cache: "no-store" })
      .then((response) => response.json())
      .then((data: { success?: boolean; accounts?: Missing[] }) => {
        if (alive && data.success) setAccounts(data.accounts ?? []);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  if (accounts.length === 0) return null;

  return (
    <>
      <button type="button" className="ui-score-alert-card" aria-expanded={open} aria-controls="no-schedule-list" onClick={() => setOpen((value) => !value)}>
        <span className="ui-score-alert-icon" aria-hidden="true">
          !
        </span>
        <span>
          <strong style={{ fontSize: 22 }}>No schedule: {accounts.length}</strong>
          <br />
          {open ? "Tap to hide." : "Active accounts with no Sub Schedule. Tap to see them."}
        </span>
      </button>

      {open ? (
        <ul id="no-schedule-list" className="ui-list-plain" style={{ gap: 10, marginBottom: 16 }}>
          {accounts.map((account, index) => (
            <li key={account.accountId}>
              {index === 0 || accounts[index - 1].subName !== account.subName ? (
                <p className="ui-label" style={{ fontSize: 18, marginTop: index === 0 ? 0 : 10 }}>
                  {account.subName || "No sub"}
                </p>
              ) : null}
              <div className="ui-card" style={{ borderLeft: "8px solid #c62828" }}>
                <p className="ui-strong" style={{ fontSize: 18, margin: 0 }}>
                  <AccountLink accountId={account.accountId} name={account.accountName} />
                </p>
                <p className="ui-muted" style={{ margin: "4px 0 10px" }}>
                  {[account.cleaningDays, account.frequency].filter(Boolean).join(" · ") || "No days on file"}
                </p>
                <BigButton icon="plus" href={account.addHref}>
                  Add schedule
                </BigButton>
              </div>
            </li>
          ))}
        </ul>
      ) : null}
    </>
  );
}

export function NoScheduleBanner({ accountId }: { accountId: string }) {
  const [missing, setMissing] = useState<Missing | null>(null);

  useEffect(() => {
    if (!accountId) return;
    let alive = true;
    fetch(`/api/no-schedule?accountId=${encodeURIComponent(accountId)}`, { cache: "no-store" })
      .then((response) => response.json())
      .then((data: { success?: boolean; account?: Missing | null }) => {
        if (alive && data.success) setMissing(data.account ?? null);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [accountId]);

  if (!missing) return null;

  return (
    <div className="ui-score-alert-card account-detail-print-hide" role="alert" style={{ flexWrap: "wrap" }}>
      <span className="ui-score-alert-icon" aria-hidden="true">
        !
      </span>
      <span style={{ flex: 1, minWidth: 160 }}>
        <strong style={{ fontSize: 20 }}>No schedule — Add one</strong>
        <br />
        Coverage cannot count this account without one.
      </span>
      <BigButton icon="plus" href={missing.addHref}>
        Add schedule
      </BigButton>
    </div>
  );
}
