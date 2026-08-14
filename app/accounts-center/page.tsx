"use client";

import { useEffect, useState } from "react";
import AccountsPage from "../accounts/page";
import VisitsPage from "../visits/page";
import ComplaintsPage from "../complaints/page";
import AccountUpdatesPage from "../account-updates/page";
import RecentActivitySummary from "./recent-activity";
import AccountsCenterKeys from "./keys";

type CenterTab = "all" | "visits" | "complaints" | "updates" | "keys";

const TAB_STORAGE_KEY = "cwAccountsCenterTab";

const TABS: { id: CenterTab; label: string }[] = [
  { id: "all", label: "All accounts" },
  { id: "visits", label: "Visits" },
  { id: "complaints", label: "Complaints" },
  { id: "updates", label: "Updates" },
  { id: "keys", label: "Keys" },
];

function getStoredTab(): CenterTab {
  if (typeof window === "undefined") return "all";
  const stored = window.localStorage.getItem(TAB_STORAGE_KEY);
  return stored === "all" ||
    stored === "visits" ||
    stored === "complaints" ||
    stored === "updates" ||
    stored === "keys"
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
        {/* overflow-x-auto + shrink-0: on narrow screens the 5 tabs don't
            fit in one row, and with no wrap they'd otherwise get clipped
            by globals.css's html/body overflow-x:hidden with no way to
            reach the cut-off tabs (e.g. Keys). Scrolling keeps the
            folder-tab look intact instead of wrapping to a second row. */}
        <div className="mx-auto flex max-w-7xl gap-2 overflow-x-auto">
          {TABS.map(({ id, label }) => (
            <button
              key={id}
              type="button"
              onClick={() => handleTabChange(id)}
              className={`shrink-0 rounded-t-lg px-5 py-2.5 text-sm font-black transition ${
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
      {activeTab === "keys" && <AccountsCenterKeys />}
    </div>
  );
}
