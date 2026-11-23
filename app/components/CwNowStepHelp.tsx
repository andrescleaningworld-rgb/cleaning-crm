"use client";

// The "?" on each step of CW Now setup: one line, an example, a short video.

import { useState } from "react";
import { CW_NOW_HELP, type CwNowHelpKey } from "@/lib/cwNowHelp";

export default function CwNowStepHelp({ step }: { step: CwNowHelpKey }) {
  const [open, setOpen] = useState(false);
  const [video, setVideo] = useState(false);
  const help = CW_NOW_HELP[step];
  return (
    <div>
      <button type="button" onClick={() => setOpen((now) => !now)} aria-expanded={open} aria-label={`Help: ${help.title}`} className="flex h-11 w-11 items-center justify-center rounded-full border-2 border-blue-600 bg-white text-xl font-black text-blue-700" data-step-help>
        ?
      </button>
      {open ? (
        <div className="mt-2 space-y-2 rounded-2xl border-2 border-blue-200 bg-blue-50 p-3">
          <p className="text-lg font-black text-slate-900">{help.tip}</p>
          <p className="text-sm font-bold text-slate-600">{help.exampleTitle}</p>
          <ul className="space-y-1">
            {help.example.map((line) => <li key={line} className="rounded-lg bg-white px-3 py-2 text-base font-semibold text-slate-800">{line}</li>)}
          </ul>
          <button type="button" onClick={() => setVideo((now) => !now)} className="min-h-[48px] w-full rounded-xl bg-blue-700 px-3 text-base font-black text-white">
            {video ? "Close video" : "▶ Watch how (30 sec)"}
          </button>
          {video ? <video src={help.video} controls autoPlay muted playsInline className="w-full rounded-xl border border-slate-300" /> : null}
        </div>
      ) : null}
    </div>
  );
}
