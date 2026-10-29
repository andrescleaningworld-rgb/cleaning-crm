"use client";

// Crew Link "Send photos": as quick as a chat app. One giant button opens the
// phone's picker (pick many at once, or take one with the camera), an
// optional one-tap tag (Before / After / Problem), one Send. No typing. The
// photos wait on the phone and go one by one (photo-queue.ts), with a big
// status: "Sending 12 of 20 · Keep this page open", then "✓ All sent".

import { useEffect, useMemo, useRef, useState } from "react";
import type { TeamHubLang } from "@/app/team-hub/teamHubStrings";
import { CREW_PHOTO_MAX_BATCH, CREW_PHOTO_TAGS, type CrewPhotoTag } from "@/lib/crewPhotos";
import type { CrewLinkStrings } from "./strings";
import type { CrewPhotoFail, PhotoQueue } from "./photo-queue";
import { WhoAndWhen } from "./ui";

/** Each reason once, with how many photos it was. */
function reasons(failed: CrewPhotoFail[]): [CrewPhotoFail, number][] {
  const counts = new Map<CrewPhotoFail, number>();
  for (const why of failed) counts.set(why, (counts.get(why) ?? 0) + 1);
  return [...counts];
}

export default function CrewPhotos({
  queue,
  s,
  lang,
  name,
  onNameChange,
  onNameUsed,
  preview,
  showButton = true,
}: {
  /** false on the other screens: only the sending status shows there. */
  showButton?: boolean;
  /** The page's one photo sender (shared with the route rows' cameras, so only one sends). */
  queue: PhotoQueue;
  s: CrewLinkStrings;
  lang: TeamHubLang;
  name: string;
  onNameChange: (name: string) => void;
  /** The name went with photos: the phone remembers it. */
  onNameUsed: () => void;
  /** Admin preview: nothing is sent (shows "Preview only"). */
  preview?: () => void;
}) {
  const { state, add } = queue;
  const [picked, setPicked] = useState<File[]>([]);
  const [tag, setTag] = useState<CrewPhotoTag>("");
  const input = useRef<HTMLInputElement>(null);

  // Small previews of what was picked (the first few), freed when done.
  const previews = useMemo(() => picked.slice(0, 8).map((file) => URL.createObjectURL(file)), [picked]);
  useEffect(() => () => previews.forEach((url) => URL.revokeObjectURL(url)), [previews]);

  const send = () => {
    if (!name.trim() || picked.length === 0) return;
    navigator.vibrate?.(15);
    if (preview) {
      setPicked([]);
      preview();
      return;
    }
    onNameUsed();
    void add(picked, name.trim(), tag);
    setPicked([]);
    setTag("");
  };

  const total = state.sent + state.waiting;
  const going = state.waiting > 0 || state.preparing > 0;

  return (
    <div className="space-y-3">
      <input
        ref={input}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(event) => {
          const files = Array.from(event.target.files ?? []).filter((file) => file.type.startsWith("image/") || /\.(heic|heif|jpe?g|png)$/i.test(file.name));
          event.target.value = "";
          if (files.length) setPicked(files.slice(0, CREW_PHOTO_MAX_BATCH));
        }}
      />

      {!showButton ? null : picked.length === 0 ? (
        <button
          type="button"
          onClick={() => input.current?.click()}
          className="flex min-h-[120px] w-full items-center justify-center gap-4 rounded-3xl bg-green-600 px-6 text-4xl font-black text-white shadow-lg active:bg-green-700"
        >
          <span className="text-6xl" aria-hidden="true">
            📷
          </span>
          {s.sendPhotos}
        </button>
      ) : (
        <div className="space-y-4 rounded-3xl bg-white p-4 shadow-sm">
          <p className="text-3xl font-black text-slate-900">{s.photosPicked(picked.length)}</p>
          <div className="grid grid-cols-4 gap-2">
            {previews.map((url) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={url} src={url} alt="" className="aspect-square w-full rounded-xl object-cover" />
            ))}
          </div>
          {!name.trim() ? <WhoAndWhen s={s} lang={lang} name={name} onNameChange={onNameChange} /> : null}
          <div>
            <p className="mb-2 text-lg font-bold text-slate-600">{s.tagOptional}</p>
            <div className="grid grid-cols-3 gap-2">
              {CREW_PHOTO_TAGS.map((each) => (
                <button
                  key={each}
                  type="button"
                  aria-pressed={tag === each}
                  onClick={() => setTag(tag === each ? "" : each)}
                  className={`min-h-[64px] rounded-2xl border-2 text-xl font-bold ${tag === each ? (each === "problem" ? "border-amber-600 bg-amber-500 text-white" : "border-blue-700 bg-blue-700 text-white") : "border-slate-300 bg-white text-slate-800 active:bg-slate-100"}`}
                >
                  {s.tags[each]}
                </button>
              ))}
            </div>
          </div>
          <button
            type="button"
            onClick={send}
            disabled={!name.trim()}
            className="min-h-[80px] w-full rounded-3xl bg-green-600 text-3xl font-black text-white shadow-lg active:bg-green-700 disabled:bg-slate-300 disabled:text-slate-500"
          >
            {s.sendNPhotos(picked.length)}
          </button>
          {!name.trim() ? <p className="text-center text-lg font-semibold text-amber-700">{s.writeYourName}</p> : null}
          <button type="button" onClick={() => setPicked([])} className="min-h-[56px] w-full rounded-2xl bg-slate-100 text-xl font-bold text-slate-700 active:bg-slate-200">
            {s.cancel}
          </button>
        </div>
      )}

      {/* The big status: what is going, and when it is all done. */}
      {going ? (
        <div className="rounded-3xl border-4 border-blue-600 bg-blue-50 p-4 text-center" role="status" aria-live="polite">
          {state.resumed > 0 && state.sent === 0 ? <p className="text-2xl font-black text-blue-900">{s.stillSending(state.waiting)}</p> : null}
          <p className="text-3xl font-black text-blue-900">
            {state.waiting > 0 ? s.sendingProgress(Math.min(total, state.sent + 1), total + state.preparing) : s.gettingReady}
          </p>
          <div className="mt-3 h-4 w-full overflow-hidden rounded-full bg-blue-200">
            <div className="h-full rounded-full bg-blue-600 transition-all" style={{ width: `${total + state.preparing ? Math.round((state.sent / (total + state.preparing)) * 100) : 0}%` }} />
          </div>
          <p className="mt-3 text-xl font-bold text-blue-900">⚠️ {s.keepOpen}</p>
          {state.offline ? <p className="mt-2 text-lg font-semibold text-amber-800">{s.waitingForSignal}</p> : null}
        </div>
      ) : state.sent > 0 && state.failed.length === 0 ? (
        <div className="rounded-3xl bg-green-600 p-4 text-center text-3xl font-black text-white" role="status">
          {s.allSent}
        </div>
      ) : null}

      {/* Photos that did not go, with why (also while others are still sending). */}
      {state.failed.length > 0 ? (
        <div className="rounded-3xl border-4 border-red-600 bg-red-50 p-4" role="alert">
          {!going && state.sent > 0 ? <p className="text-2xl font-black text-green-800">{`✓ ${state.sent}`}</p> : null}
          <p className="text-2xl font-black text-red-800">{s.notSent(state.failed.length)}</p>
          <ul className="mt-2 space-y-2">
            {reasons(state.failed).map(([why, count]) => (
              <li key={why} className="text-lg font-semibold text-red-900">
                {count > 1 ? `${count} × ` : ""}
                {s.photoWhy[why]}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
