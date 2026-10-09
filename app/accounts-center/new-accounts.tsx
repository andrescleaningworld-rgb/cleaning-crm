"use client";

// Accounts Center -> New accounts: one card per new account still going
// through the Onboarding Checklist: the step it is on, who has it, and the
// days left. Red when late. A card opens the account on its checklist.

import { useMemo, useState } from "react";
import { BigButton, Counts, EmptyState, ErrorBox, PullToRefresh, Screen, SkeletonList, Tips, showToast } from "@/app/ui";
import { isLate, isMine, sortForWork } from "@/lib/handoffs";
import { HandoffCard, handoffCardHref, useHandoffs } from "../components/handoffs";

export default function NewAccountsBoard() {
  const handoffs = useHandoffs();
  const [quick, setQuick] = useState<"all" | "late" | "mine">("all");

  const accounts = useMemo(
    () => sortForWork(handoffs.items.filter((item) => item.kind === "account" && !item.doneAt), handoffs.settings),
    [handoffs.items, handoffs.settings]
  );
  const late = accounts.filter((item) => isLate(item, handoffs.settings));
  const mine = accounts.filter((item) => isMine(item, handoffs.settings, handoffs.me));
  const shown = quick === "late" ? late : quick === "mine" ? mine : accounts;

  return (
    <Screen title="New accounts" subtitle="Every new account, the step it is on, and who has it." backHref="/">
      <Tips
        id="new-accounts"
        ready={handoffs.state === "ready"}
        steps={[
          { target: '[data-tip="counts"]', text: "A new account goes through 7 steps. Each step belongs to the Office or to the account's manager." },
          { target: '[data-tip="board"]', text: "Each card says the step, who has it and the days left. Red means late. Tap a card to open its checklist." },
          { target: '[data-tip="how"]', text: "To put an account here: open it and tap Add accepted estimate." },
        ]}
      />
      <PullToRefresh
        onRefresh={async () => {
          await handoffs.reload();
          showToast("Updated ✓");
        }}
      />

      {handoffs.state === "off" ? (
        <EmptyState title="Not turned on here yet" text="The New accounts board works once this database has the handoff tables." />
      ) : handoffs.state === "failed" ? (
        <ErrorBox title="The new accounts did not load." onRetry={() => void handoffs.reload()} />
      ) : handoffs.state === "loading" ? (
        <SkeletonList rows={3} />
      ) : (
        <>
          <Counts
            data-tip="counts"
            items={[
              { label: "In progress", value: accounts.length, tone: "info", pressed: quick === "all", onClick: () => setQuick("all") },
              { label: "Late", value: late.length, tone: late.length > 0 ? "bad" : "good", pressed: quick === "late", onClick: () => setQuick(quick === "late" ? "all" : "late") },
              { label: "Waiting on me", value: mine.length, tone: "off", pressed: quick === "mine", onClick: () => setQuick(quick === "mine" ? "all" : "mine") },
            ]}
          />

          <div data-tip="board">
            {shown.length === 0 ? (
              <EmptyState
                title={quick === "late" ? "Nothing is late ✓" : quick === "mine" ? "Nothing is waiting on you ✓" : "No new accounts in progress"}
                text={quick === "all" ? "Open a new account and tap Add accepted estimate. It shows up here with its first step." : "Tap In progress to see every new account."}
              />
            ) : (
              <ul className="ui-acct-list">
                {shown.map((item) => (
                  <li key={item.itemId}>
                    <HandoffCard item={item} settings={handoffs.settings} href={handoffCardHref(item)} detail={item.manager ? `Manager: ${item.manager}` : "No manager yet"} />
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div data-tip="how" className="ui-more-actions">
            <BigButton kind="second" icon="plus" href="/accounts/new">
              Add a new account
            </BigButton>
            <BigButton kind="second" href="/help/how-it-works">
              How it works
            </BigButton>
          </div>
        </>
      )}
    </Screen>
  );
}
