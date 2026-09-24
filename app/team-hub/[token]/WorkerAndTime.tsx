"use client";

// Top of every Team Hub form: who is signed in and today's date/time
// (Eastern). Team Hub keeps its signed-in worker — no typed name here.
import type { TeamHubLang } from "@/app/team-hub/teamHubStrings";
import { useNowLabel } from "@/app/porter/[code]/ui";

export default function WorkerAndTime({ workerName, lang }: { workerName?: string; lang: TeamHubLang }) {
  const nowLabel = useNowLabel(lang);
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl bg-white px-4 py-3 text-lg font-semibold text-slate-700 shadow-sm">
      {workerName ? (
        <span>
          <span aria-hidden="true">👤</span> {workerName}
        </span>
      ) : null}
      <span>
        <span aria-hidden="true">🕒</span> {nowLabel}
      </span>
    </div>
  );
}
