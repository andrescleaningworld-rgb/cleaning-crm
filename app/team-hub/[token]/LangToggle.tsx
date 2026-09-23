"use client";

import type { TeamHubLang } from "../teamHubStrings";

// Small flag icon, tap to flip EN/ES — the one "hidden" piece of chrome the
// GLOBAL RULES allow, since it's always visible (not a menu) and one tap.
export default function LangToggle({ lang, onChange }: { lang: TeamHubLang; onChange: (lang: TeamHubLang) => void }) {
  const next = lang === "en" ? "es" : "en";
  return (
    <button
      type="button"
      onClick={() => onChange(next)}
      aria-label={lang === "en" ? "Switch to Spanish" : "Switch to English"}
      className="flex h-9 w-9 items-center justify-center rounded-full bg-white/15 text-lg"
    >
      {lang === "en" ? "🇺🇸" : "🇲🇽"}
    </button>
  );
}
