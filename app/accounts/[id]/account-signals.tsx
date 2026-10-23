"use client";

// One small card on the account page for the reminder features: the "At
// risk" flag with its reason and the numbers behind it. Staff only (the
// account page is). Nothing shows for an account that is not active.
// Server: app/api/account-risk.

import { useEffect, useState } from "react";
import { Card } from "@/app/ui";
import { RiskPill, RiskReason } from "@/app/components/account-risk";
import type { RiskFlag, RiskSignals } from "@/lib/accountRisk";

type Flag = RiskFlag & { signals: RiskSignals };

function RiskPart({ accountId }: { accountId: string }) {
  const [flag, setFlag] = useState<Flag | null>(null);
  useEffect(() => {
    let alive = true;
    fetch(`/api/account-risk?accountId=${encodeURIComponent(accountId)}`, { cache: "no-store" })
      .then((response) => response.json())
      .then((data: { success?: boolean; flag?: Flag | null }) => alive && setFlag(data.success ? (data.flag ?? null) : null))
      .catch(() => alive && setFlag(null));
    return () => {
      alive = false;
    };
  }, [accountId]);
  if (!flag) return null;
  const s = flag.signals;
  return (
    <div className="ui-stack">
      <div className="ui-actions-row">
        <RiskPill flag={flag} />
        {flag.level === "green" ? <span className="ui-muted">Nothing to worry about.</span> : null}
      </div>
      <RiskReason flag={flag} />
      <p className="ui-muted">
        {s.complaints30} complaint{s.complaints30 === 1 ? "" : "s"} in 30 days ·{" "}
        {s.daysSinceVisit === null ? "no visit date" : s.noVisitYet ? `no visit yet (${s.daysSinceVisit} days)` : `last visit ${s.daysSinceVisit} days ago`} ·{" "}
        {s.subScore === null ? "no sub score" : `sub score ${s.subScore.toFixed(1)}`}
        {s.thumbsDown60 > 0 ? ` · ${s.thumbsDown60} 👎` : ""}
      </p>
    </div>
  );
}

export default function AccountSignals({ accountId, active }: { accountId: string; active: boolean }) {
  if (!accountId || !active) return null;
  return (
    <Card title="How this account is doing">
      <RiskPart accountId={accountId} />
    </Card>
  );
}
