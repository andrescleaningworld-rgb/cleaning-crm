"use client";

// Shared pieces for the crew-facing Crew Link screens. Sizing rules for the
// whole flow: text at least 18px (text-lg), every tap target at least 56px
// tall, one thing per screen, nothing hidden behind menus.
import Image from "next/image";
import type { ReactNode } from "react";
import type { TeamHubLang } from "@/app/team-hub/teamHubStrings";
import type { CrewLinkStrings } from "./strings";

// Always-visible English/Español switch (the choice is remembered per phone
// by useTeamHubLang).
export function LangSwitch({ lang, onChange }: { lang: TeamHubLang; onChange: (lang: TeamHubLang) => void }) {
  return (
    <div className="grid grid-cols-2 gap-1 rounded-2xl bg-blue-900/40 p-1">
      {(["en", "es"] as const).map((option) => (
        <button
          key={option}
          type="button"
          onClick={() => onChange(option)}
          aria-pressed={lang === option}
          className={`min-h-[56px] rounded-xl px-3 text-lg font-bold ${
            lang === option ? "bg-white text-blue-800" : "text-white"
          }`}
        >
          {option === "en" ? "English" : "Español"}
        </button>
      ))}
    </div>
  );
}

export function CrewHeader({
  s,
  lang,
  onLangChange,
  locationName,
  children,
}: {
  s: CrewLinkStrings;
  lang: TeamHubLang;
  onLangChange: (lang: TeamHubLang) => void;
  locationName: string;
  children?: ReactNode;
}) {
  return (
    <header className="rounded-3xl bg-blue-700 p-4 text-white shadow-sm">
      <div className="flex items-center gap-2">
        <Image
          src="/logo-CW-single-phone-optimized.png"
          alt="Cleaning World"
          width={32}
          height={32}
          className="h-8 w-8 rounded bg-white object-contain"
        />
        <p className="text-lg font-bold text-blue-100">{s.appName}</p>
      </div>
      <h1 className="mt-2 text-3xl font-black leading-tight">{locationName || s.defaultTitle}</h1>
      {children}
      <div className="mt-3">
        <LangSwitch lang={lang} onChange={onLangChange} />
      </div>
    </header>
  );
}

export function BackButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-h-[56px] items-center gap-2 rounded-2xl bg-white px-5 text-xl font-bold text-blue-800 shadow-sm active:bg-gray-100"
    >
      <span aria-hidden="true">←</span> {label}
    </button>
  );
}

// The one big action at the bottom of a screen. Sticky so it's always in
// reach on a long checklist.
export function SendBar({
  label,
  busyLabel,
  busy,
  disabled,
  onClick,
  hint,
}: {
  label: string;
  busyLabel: string;
  busy: boolean;
  disabled: boolean;
  onClick: () => void;
  hint?: string;
}) {
  return (
    <div className="sticky bottom-0 -mx-4 bg-gradient-to-t from-slate-100 via-slate-100 to-transparent px-4 pb-4 pt-6">
      {hint ? <p className="mb-2 text-center text-lg font-semibold text-slate-600">{hint}</p> : null}
      <button
        type="button"
        onClick={onClick}
        disabled={disabled || busy}
        className="min-h-[72px] w-full rounded-3xl bg-green-600 text-2xl font-black text-white shadow-lg active:bg-green-700 disabled:bg-slate-300 disabled:text-slate-500 disabled:shadow-none"
      >
        {busy ? busyLabel : label}
      </button>
    </div>
  );
}

export function ErrorBox({ message }: { message: string }) {
  if (!message) return null;
  return <p className="rounded-2xl bg-amber-100 px-4 py-3 text-lg font-semibold text-amber-900">{message}</p>;
}

// Full-screen green confirmation after any Send, with one way out.
export function SentScreen({ s, onDone }: { s: CrewLinkStrings; onDone: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-8 bg-green-600 px-6 text-center text-white">
      <div className="flex h-36 w-36 items-center justify-center rounded-full bg-white text-8xl font-black text-green-600" aria-hidden="true">
        ✔
      </div>
      <p className="text-5xl font-black">{s.sent}</p>
      <button
        type="button"
        onClick={onDone}
        className="min-h-[72px] w-full max-w-sm rounded-3xl bg-white text-2xl font-black text-green-700 shadow-lg active:bg-green-50"
      >
        {s.backToStart}
      </button>
    </div>
  );
}

export function CenteredMessage({ title, body }: { title: string; body?: string }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 px-6 text-center">
      <div>
        <p className="text-2xl font-black text-slate-900">{title}</p>
        {body ? <p className="mt-3 text-lg text-slate-600">{body}</p> : null}
      </div>
    </div>
  );
}
