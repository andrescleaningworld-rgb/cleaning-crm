"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import SubcontractorsPage from "../subcontractors/page";
import SubSchedulesPage from "../sub-schedules/page";
import SubCenterCoverage from "./coverage";
import SubCenterActivityLog from "./activity-log";

type CenterTab = "subs" | "schedules" | "coverage" | "activity";

const TAB_STORAGE_KEY = "cwSubCenterTab";

const TABS: { id: CenterTab; label: string }[] = [
  { id: "subs", label: "Subs" },
  { id: "schedules", label: "Sub Schedules" },
  { id: "coverage", label: "Coverage" },
  { id: "activity", label: "Activity Log" },
];

function isCenterTab(value: string | null): value is CenterTab {
  return value === "subs" || value === "schedules" || value === "coverage" || value === "activity";
}

function getStoredTab(): CenterTab {
  if (typeof window === "undefined") return "subs";
  const stored = window.localStorage.getItem(TAB_STORAGE_KEY);
  return isCenterTab(stored) ? stored : "subs";
}

function SubCenterPageContent() {
  const searchParams = useSearchParams();
  const [activeTab, setActiveTab] = useState<CenterTab>("subs");

  useEffect(() => {
    // ?tab= wins on first load (e.g. the old /activity-log route now
    // redirects to /sub-center?tab=activity) — falls back to whatever was
    // last stored otherwise. Deferred read: localStorage isn't available
    // during SSR, so reading it eagerly (lazy initializer) would mismatch
    // the server-rendered tab.
    const fromQuery = searchParams.get("tab");
    setActiveTab(isCenterTab(fromQuery) ? fromQuery : getStoredTab());
    // Only ever consulted on first mount — a later change to the URL while
    // already on this page shouldn't yank the user back to another tab.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleTabChange(next: CenterTab) {
    setActiveTab(next);
    if (typeof window !== "undefined") window.localStorage.setItem(TAB_STORAGE_KEY, next);
  }

  return (
    <div>
      <div className="border-b border-slate-200 bg-white px-4 pt-4 sm:px-6">
        <div className="mx-auto flex max-w-7xl flex-wrap gap-2">
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
      {activeTab === "activity" && <SubCenterActivityLog />}
    </div>
  );
}

// useSearchParams requires a Suspense boundary for the static-generation
// shell; the tab bar itself renders instantly regardless since the actual
// value is only read client-side in the effect above.
export default function SubCenterPage() {
  return (
    <Suspense fallback={null}>
      <SubCenterPageContent />
    </Suspense>
  );
}
