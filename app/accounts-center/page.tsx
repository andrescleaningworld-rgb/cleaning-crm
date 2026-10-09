"use client";

import { useEffect, useState } from "react";
import AccountsPage from "../accounts/page";
import VisitsPage from "../visits/page";
import ComplaintsPage from "../complaints/page";
import AccountUpdatesPage from "../account-updates/page";
import RecentActivitySummary from "./recent-activity";
import AccountsCenterKeys from "./keys";
import MissingEmails from "./missing-emails";
import TeamHubStaffQueue from "./team-hub-queue";
import { Tabs } from "@/app/ui";

type CenterTab = "all" | "visits" | "complaints" | "updates" | "keys" | "team-hub" | "emails";

const TAB_STORAGE_KEY = "cwAccountsCenterTab";

const TABS: { value: CenterTab; label: string }[] = [
  { value: "all", label: "All accounts" },
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

  useEffect(() => {
    // Deferred read: localStorage isn't available during SSR, so reading it
    // eagerly (lazy initializer) would mismatch the server-rendered tab.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setActiveTab(getStoredTab());
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
  const tabs = TABS.map((tab) =>
    tab.value === "team-hub" && openTeamHubCount > 0 ? { ...tab, label: `${tab.label} (${openTeamHubCount})` } : tab
  );

  return (
    // .ui-screen here only sets the type and focus styles for the tab bar;
    // each tab below brings its own Screen (title, back, main action).
    <div className="ui-screen">
      <Tabs label="Accounts Center sections" tabs={tabs} value={activeTab} onChange={handleTabChange} />

      {activeTab === "all" && (
        <>
          <RecentActivitySummary />
          <AccountsPage />
        </>
      )}
      {activeTab === "visits" && <VisitsPage />}
      {activeTab === "complaints" && <ComplaintsPage />}
      {activeTab === "updates" && <AccountUpdatesPage />}
      {activeTab === "keys" && <AccountsCenterKeys />}
      {activeTab === "emails" && <MissingEmails />}
      {activeTab === "team-hub" && <TeamHubStaffQueue />}
    </div>
  );
}
