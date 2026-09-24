"use client";

import { CREW_LANGS, type TeamHubLang } from "../teamHubStrings";

// Always-visible EN / ES / PT picker (one tap, no menu) — the language
// chrome the GLOBAL RULES allow. The choice is remembered on the device by
// useTeamHubLang.
export default function LangToggle({ lang, onChange }: { lang: TeamHubLang; onChange: (lang: TeamHubLang) => void }) {
  return (
    <div className="flex gap-1 rounded-full bg-white/15 p-1" role="group" aria-label="Language">
      {CREW_LANGS.map((option) => (
        <button
          key={option}
          type="button"
          onClick={() => onChange(option)}
          aria-pressed={lang === option}
          className={`min-h-[40px] min-w-[44px] rounded-full px-2 text-base font-bold ${lang === option ? "bg-white text-blue-800" : "text-white"}`}
        >
          {option.toUpperCase()}
        </button>
      ))}
    </div>
  );
}
