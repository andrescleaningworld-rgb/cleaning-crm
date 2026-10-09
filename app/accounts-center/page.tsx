"use client";

import { useEffect, useState } from "react";
import AccountsPage from "../accounts/page";
import VisitsPage from "../visits/page";
import ComplaintsPage from "../complaints/page";
import AccountUpdatesPage from "../account-updates/page";
import RecentActivitySummary from "./recent-activity";
import AccountsCenterKeys from "./keys";
import MissingEmails from "./missing-emails";
import NewAccountsBoard from "./new-accounts";
import TeamHubStaffQueue from "./team-hub-queue";
import { Tabs } from "@/app/ui";
import { useHandoffs } from "../components/handoffs";

type CenterTab = "all" | "new" | "visits" | "complaints" | "updates" | "keys" | "team-hub" | "emails";

const TAB_STORAGE_KEY = "cwAccountsCenterTab";

const TABS: { value: CenterTab; label: string }[] = [
  { value: "all", label: "All accounts" },
  { value: "new", label: "New accounts" },
  { value: "visits", label: "Visits" },
  { value: "complaints", label: "Complaints" },
  { value: "updates", label: "Updates" },
  { value: "keys", label: "Keys" },
  { value: "emails", label: "Missing emails" },
  { value: "team-hub", label: "Crew Link" },
];

function getStoredTab(): CenterTab {
  if (typeof window === "undefined") return "all";
  const stored = window.localStorage.getItem(TAB_STORAGE_KEY);
  return stored === "all" ||
    stored === "new" ||
    stored === "visits" ||
    stored === "complaints" ||
    stored === "updates" ||
    stored === "keys" ||
    stored === "team-hub"
    ? stored
    : "all";
}

export default function AccountsCenterPage() {
  const [activeTab, setActiveTab] = useState<CenterTab>("all");
  // Phase 6: open-problem count across every account's Team Hub, shown as a
  // badge on the tab itself so staff notice without opening it.
  const [openTeamHubCount, setOpenTeamHubCount] = useState(0);
  const [showRecent, setShowRecent] = useState(false);

  useEffect(() => {
    // Deferred read: localStorage isn't available during SSR, so reading it
    // eagerly (lazy initializer) would mismatch the server-rendered tab.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setActiveTab(getStoredTab());
    // "See problem" on an account card opens the Crew Link tab: by link
    // (?tab=team-hub) from elsewhere, or by this event when already here.
    const wanted = new URLSearchParams(window.location.search).get("tab");
    if (wanted === "team-hub" || wanted === "new" || wanted === "updates") setActiveTab(wanted);
    const onTab = (event: Event) => {
      if ((event as CustomEvent<string>).detail === "team-hub") setActiveTab("team-hub");
    };
    window.addEventListener("cw:accounts-center-tab", onTab);
    return () => window.removeEventListener("cw:accounts-center-tab", onTab);
  }, []);

  useEffect(() => {
    fetch("/api/admin/team-hub/open-counts", { cache: "no-store" })
      .then((res) => res.json())
      .then((data: { countsByAccountId?: Record<string, number> }) => {
        const total = Object.values(data.countsByAccountId ?? {}).reduce((sum, n) => sum + n, 0);
        setOpenTeamHubCount(total);
      })
      .catch(() => setOpenTeamHubCount(0));
  }, []);

  function handleTabChange(next: CenterTab) {
    setActiveTab(next);
    if (typeof window !== "undefined") window.localStorage.setItem(TAB_STORAGE_KEY, next);
  }

  // The open-problem count rides in the tab's own label so staff notice it
  // without opening the tab.
  // The New accounts board only exists where handoffs are turned on.
  const handoffsOn = useHandoffs().state === "ready";
  const tabs = TABS.filter((tab) => tab.value !== "new" || handoffsOn).map((tab) =>
    tab.value === "team-hub" && openTeamHubCount > 0 ? { ...tab, label: `${tab.label} (${openTeamHubCount})` } : tab
  );

  return (
    // .ui-screen here only sets the type and focus styles for the tab bar;
    // each tab below brings its own Screen (title, back, main action).
    <div className="ui-screen">
      <Tabs label="Accounts Center sections" tabs={tabs} value={activeTab} onChange={handleTabChange} />

      {activeTab === "all" && (
        <>
          {/* The counts, the search box and the accounts come first. What was
              added lately (it used to sit on top) is one tap away below. */}
          <AccountsPage />
          <button type="button" className="ui-money-toggle" aria-expanded={showRecent} onClick={() => setShowRecent((value) => !value)}>
            {showRecent ? "Recent activity · tap to hide" : "Recent activity · tap to show"}
          </button>
          {showRecent ? <RecentActivitySummary /> : null}
        </>
      )}
      {activeTab === "new" && (handoffsOn ? <NewAccountsBoard /> : <AccountsPage />)}
      {activeTab === "visits" && <VisitsPage />}
      {activeTab === "complaints" && <ComplaintsPage />}
      {activeTab === "updates" && <AccountUpdatesPage />}
      {activeTab === "keys" && <AccountsCenterKeys />}
      {activeTab === "emails" && <MissingEmails />}
      {activeTab === "team-hub" && <TeamHubStaffQueue />}
    </div>
  );
}
