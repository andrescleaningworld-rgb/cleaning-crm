"use client";

// "See what the crew sees" (app/crew-link/preview): an admin opens these same
// crew screens with this context around them. Only that admin-only page
// provides it; the public /porter link never does, so a crew can never be in
// preview. In preview every Send stops in the browser: nothing is posted, so
// no checklist, supply order, problem report, email, text or stock change.
import { createContext, useContext } from "react";

export type CrewLinkPreview = { onClose: () => void };

export const CrewLinkPreviewContext = createContext<CrewLinkPreview | null>(null);

/** Null on the real crew link; set when an admin is previewing. */
export function useCrewLinkPreview(): CrewLinkPreview | null {
  return useContext(CrewLinkPreviewContext);
}

export function PreviewBanner({ onClose }: { onClose: () => void }) {
  return (
    <div className="sticky top-0 z-40 flex items-center justify-between gap-3 bg-yellow-300 px-4 py-3 text-slate-900 shadow-md">
      <p className="text-base font-black leading-tight">PREVIEW — nothing you do here is sent</p>
      <button type="button" onClick={onClose} className="min-h-[44px] shrink-0 rounded-xl bg-slate-900 px-4 text-base font-black text-white active:bg-slate-700">
        Close preview
      </button>
    </div>
  );
}

/** Shown where the crew would see the green "Sent!" screen. */
export function PreviewNotSentScreen({ onDone, onClose }: { onDone: () => void; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-8 bg-yellow-300 px-6 text-center text-slate-900">
      <div className="flex h-36 w-36 items-center justify-center rounded-full bg-white text-7xl font-black" aria-hidden="true">
        👀
      </div>
      <p className="text-4xl font-black">Preview only — not sent</p>
      <p className="max-w-sm text-lg font-semibold">A crew member would see a green &quot;Sent!&quot; screen here.</p>
      <button type="button" onClick={onDone} className="min-h-[72px] w-full max-w-sm rounded-3xl bg-white text-2xl font-black shadow-lg active:bg-yellow-50">
        Back to start
      </button>
      <button type="button" onClick={onClose} className="min-h-[56px] w-full max-w-sm rounded-3xl bg-slate-900 text-xl font-black text-white active:bg-slate-700">
        Close preview
      </button>
    </div>
  );
}
