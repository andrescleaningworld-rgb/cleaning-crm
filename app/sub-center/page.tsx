"use client";

import { useEffect, useState } from "react";
import SubcontractorsPage from "../subcontractors/page";
import SubSchedulesPage from "../sub-schedules/page";
import SubCenterCoverage from "./coverage";

type CenterTab = "subs" | "schedules" | "coverage";

const TAB_STORAGE_KEY = "cwSubCenterTab";

const TABS: { id: CenterTab; label: string }[] = [
  { id: "subs", label: "Subs" },
  { id: "schedules", label: "Sub Schedules" },
  { id: "coverage", label: "Coverage" },
];

function getStoredTab(): CenterTab {
  if (typeof window === "undefined") return "subs";
  const stored = window.localStorage.getItem(TAB_STORAGE_KEY);
  return stored === "subs" || stored === "schedules" || stored === "coverage" ? stored : "subs";
}

export default function SubCenterPage() {
  const [activeTab, setActiveTab] = useState<CenterTab>("subs");

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

      {activeTab === "subs" && <SubcontractorsPage />}
      {activeTab === "schedules" && <SubSchedulesPage />}
      {activeTab === "coverage" && <SubCenterCoverage />}
    </div>
  );
}
