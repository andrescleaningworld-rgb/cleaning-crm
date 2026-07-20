"use client";

import { useEffect, useState } from "react";
import AccountsPage from "../accounts/page";
import VisitsPage from "../visits/page";
import ComplaintsPage from "../complaints/page";
import AccountUpdatesPage from "../account-updates/page";
import RecentActivitySummary from "./recent-activity";

type CenterTab = "all" | "visits" | "complaints" | "updates";

const TAB_STORAGE_KEY = "cwAccountsCenterTab";

const TABS: { id: CenterTab; label: string }[] = [
  { id: "all", label: "All accounts" },
  { id: "visits", label: "Visits" },
  { id: "complaints", label: "Complaints" },
  { id: "updates", label: "Updates" },
];

function getStoredTab(): CenterTab {
  if (typeof window === "undefined") return "all";
  const stored = window.localStorage.getItem(TAB_STORAGE_KEY);
  return stored === "all" || stored === "visits" || stored === "complaints" || stored === "updates"
    ? stored
    : "all";
}

export default function AccountsCenterPage() {
  const [activeTab, setActiveTab] = useState<CenterTab>("all");

  useEffect(() => {
    // Deferred read: localStorage isn't available during SSR, so reading it
    // eagerly (lazy initializer) would mismatch the server-rendered tab.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setActiveTab(getStoredTab());
  }, []);

  function handleTabChange(next: CenterTab) {
    setActiveTab(next);
    if (typeof window !== "undefined") window.localStorage.setItem(TAB_STORAGE_KEY, next);
  }

  return (
    <div>
      <div className="border-b border-slate-200 bg-white px-4 pt-4 sm:px-6">
        <div className="mx-auto flex max-w-7xl gap-2">
          {TABS.map(({ id, label }) => (
            <button
              key={id}
              type="button"
              onClick={() => handleTabChange(id)}
              className={`rounded-t-lg px-5 py-2.5 text-sm font-black transition ${
                activeTab === id
                  ? "bg-blue-700 text-white shadow-sm"
                  : "bg-slate-100 text-slate-700 hover:bg-slate-200"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {activeTab === "all" && (
        <>
          <RecentActivitySummary />
          <AccountsPage />
        </>
      )}
      {activeTab === "visits" && <VisitsPage />}
      {activeTab === "complaints" && <ComplaintsPage />}
      {activeTab === "updates" && <AccountUpdatesPage />}
    </div>
  );
}
