"use client";

// Accounts Center -> New accounts: one card per new account in the 8-step
// New Account flow (account_flows, lib/accountFlow.ts), the same system as
// the account page tracker and the Pin Board. Each card: the step it is on
// ("Step 3 of 8"), who it is with, and the tracker; red when late (no
// progress for 2 work days). A card opens the account. Server:
// GET /api/account-flow?list=1.

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { AddButton, BigButton, Counts, EmptyState, ErrorBox, PullToRefresh, Screen, SkeletonList, StatusPill, Tips, showToast } from "@/app/ui";
import PizzaTracker from "../components/pizza-tracker";
import { FLOW_STEPS, type FlowView } from "@/lib/accountFlow";

type OpenFlow = { accountId: string; accountName: string; manager: string; view: FlowView; mine: boolean };

const STEPS = FLOW_STEPS.length - 1;

export default function NewAccountsBoard() {
  const [state, setState] = useState<"loading" | "ready" | "off" | "failed">("loading");
  const [flows, setFlows] = useState<OpenFlow[]>([]);
  const [quick, setQuick] = useState<"all" | "late" | "mine">("all");

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/account-flow?list=1", { cache: "no-store" });
      const data = (await response.json().catch(() => ({}))) as { success?: boolean; ready?: boolean; flows?: OpenFlow[] };
      if (!response.ok || !data.success) throw new Error("failed");
      if (!data.ready) {
        setState("off");
        return;
      }
      setFlows(data.flows ?? []);
      setState("ready");
    } catch {
      setState((current) => (current === "ready" ? current : "failed"));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const late = flows.filter((flow) => flow.view.red);
  const mine = flows.filter((flow) => flow.mine);
  const shown = quick === "late" ? late : quick === "mine" ? mine : flows;

  return (
    <Screen
      title="New accounts"
      subtitle="Every new account, the step it is on, and who has it."
      backHref="/"
      addAction={<AddButton href="/accounts/new-accepted">Add a new account</AddButton>}
    >
      <Tips
        id="new-accounts-flow"
        ready={state === "ready"}
        steps={[
          { target: '[data-tip="counts"]', text: `A new account goes through ${STEPS} steps, from the Welcome Packet to the first-clean follow-up.` },
          { target: '[data-tip="board"]', text: "Each card says the step and who it is with. Red means no progress for 2 work days. Tap a card to open the account." },
        ]}
      />
      <PullToRefresh
        onRefresh={async () => {
          await load();
          showToast("Updated ✓");
        }}
      />
      {state === "off" ? (
        <EmptyState title="Not turned on here yet" text="The New accounts board works once this database has the new-account steps." />
      ) : state === "failed" ? (
        <ErrorBox title="The new accounts did not load." onRetry={() => void load()} />
      ) : state === "loading" ? (
        <SkeletonList rows={3} />
      ) : (
        <>
          <Counts
            data-tip="counts"
            items={[
              { label: "In progress", value: flows.length, tone: "info", pressed: quick === "all", onClick: () => setQuick("all") },
              { label: "Late", value: late.length, tone: late.length > 0 ? "bad" : "good", pressed: quick === "late", onClick: () => setQuick(quick === "late" ? "all" : "late") },
              { label: "Waiting on me", value: mine.length, tone: "off", pressed: quick === "mine", onClick: () => setQuick(quick === "mine" ? "all" : "mine") },
            ]}
          />

          <div data-tip="board">
            {shown.length === 0 ? (
              <EmptyState
                title={quick === "late" ? "Nothing is late ✓" : quick === "mine" ? "Nothing is waiting on you ✓" : "No new accounts in progress"}
                text={quick === "all" ? "Tap Add a new account. It shows up here on step 1." : "Tap In progress to see every new account."}
              />
            ) : (
              <ul className="ui-acct-list">
                {shown.map((flow) => {
                  const step = FLOW_STEPS[flow.view.index];
                  return (
                    <li key={flow.accountId}>
                      <Link href={`/accounts/${encodeURIComponent(flow.accountId)}`} className={`ui-acct ui-acct-link ${flow.view.red ? "ui-acct-problem" : ""}`.trim()}>
                        <span className="ui-acct-name">{flow.accountName || flow.accountId}</span>
                        <span className="ui-actions-row">
                          <StatusPill kind={flow.view.red ? "needs-you" : "waiting"}>
                            {flow.view.red ? "Late · " : ""}Step {flow.view.index + 1} of {STEPS}
                          </StatusPill>
                        </span>
                        <span className="ui-acct-line">
                          <span className="ui-strong">{step?.action}</span>
                          {flow.view.withWho ? ` · ${flow.view.withWho}` : ""}
                        </span>
                        <PizzaTracker view={flow.view} size="pin" />
                        <span className="ui-acct-line">{flow.manager ? `Manager: ${flow.manager}` : "No manager yet"}</span>
                        {flow.view.stuckNote ? <span className="ui-acct-line ui-clamp">Stuck: {flow.view.stuckNote}</span> : null}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div className="ui-more-actions">
            <BigButton kind="second" href="/help/how-it-works">
              How it works
            </BigButton>
          </div>
        </>
      )}
    </Screen>
  );
}
