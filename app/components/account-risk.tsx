"use client";

// "At risk" on the staff screens (lib/accountRisk.ts). Server:
// app/api/account-risk. Staff only.
//
//   useRiskFlags()   every active account's flag, read once per page
//   RiskPill         🟢 OK / 🟡 Watch / 🔴 At risk
//   RiskReason       the one line ("2 complaints this month"), yellow and red only

import { useEffect, useState } from "react";
import { StatusPill, type StatusKind } from "@/app/ui";
import { RISK_DOT, RISK_WORDS, type RiskFlag, type RiskLevel } from "@/lib/accountRisk";

const KIND: Record<RiskLevel, StatusKind> = { green: "done", yellow: "waiting", red: "needs-you" };

let cached: Promise<Record<string, RiskFlag>> | null = null;

export function useRiskFlags(): Record<string, RiskFlag> {
  const [flags, setFlags] = useState<Record<string, RiskFlag>>({});
  useEffect(() => {
    let alive = true;
    cached ??= fetch("/api/account-risk", { cache: "no-store" })
      .then((response) => response.json())
      .then((data: { success?: boolean; flags?: Record<string, RiskFlag> }) => (data.success && data.flags ? data.flags : {}))
      .catch(() => {
        cached = null;
        return {};
      });
    void cached.then((next) => alive && setFlags(next));
    return () => {
      alive = false;
    };
  }, []);
  return flags;
}

export function RiskPill({ flag }: { flag: RiskFlag | undefined | null }) {
  if (!flag) return null;
  return (
    <StatusPill kind={KIND[flag.level]}>
      {RISK_DOT[flag.level]} {RISK_WORDS[flag.level]}
    </StatusPill>
  );
}

export function RiskReason({ flag }: { flag: RiskFlag | undefined | null }) {
  if (!flag || flag.level === "green") return null;
  return <p className={flag.level === "red" ? "ui-acct-wrong" : "ui-acct-line"}>{flag.reason}</p>;
}
