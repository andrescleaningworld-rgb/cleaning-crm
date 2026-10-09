"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import SubcontractorsPage from "../subcontractors/page";
import SubSchedulesPage from "../sub-schedules/page";
import SubCenterCoverage from "./coverage";
import SubCenterActivityLog from "./activity-log";
import { Tabs } from "@/app/ui";
// Team Hub tab hidden 2026-09-24 (Crew Link replaces it); ./team-hub.tsx kept.

type CenterTab = "subs" | "schedules" | "coverage" | "activity";

const TAB_STORAGE_KEY = "cwSubCenterTab";

const TABS: { value: CenterTab; label: string }[] = [
  { value: "subs", label: "Subs" },
  { value: "schedules", label: "Sub Schedules" },
  { value: "coverage", label: "Coverage" },
  { value: "activity", label: "Activity Log" },
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
    // .ui-screen here only sets the type and focus styles for the tab bar;
    // each tab below brings its own Screen (title, back, main action).
    <div className="ui-screen">
      <Tabs label="Sub Center sections" tabs={TABS} value={activeTab} onChange={handleTabChange} />

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
