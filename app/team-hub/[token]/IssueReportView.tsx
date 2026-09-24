"use client";

// Phase 4: full "Report a problem" screen — big category icon buttons,
// optional note, up to 5 photos (resized client-side via lib/imageResize.ts
// before upload), one big "Send." Reached two ways: the "issues" module
// tile on Today, and the always-visible button at the bottom of
// ChecklistView — both just call onBack when done, landing back on Today
// either way (not back to the checklist specifically — simplest, and
// consistent with every other module screen's Back behavior).
//
// "Links the problem to the current run" (Part 2): handled entirely
// server-side in reportTeamHubIssue() (lib/teamHubDb.ts), which looks up
// the crew's own currently-open checklist run and stores it on
// hub_issues.run_id — a separate, whole-run column from run_item_id (a
// per-item FK this button was never going to set; the simplicity pass
// already removed per-item Problem status). Nothing in this file needs to
// know about it — the linkage is automatic whenever a run happens to be
// open at report time, regardless of which of the two entry points
// (Today's "issues" tile, or the checklist screen's button below) sent it.
import WorkerAndTime from "./WorkerAndTime";
import { useState } from "react";
import type { TeamHubLang } from "../teamHubStrings";
import { teamHubStrings, TEAM_HUB_STRINGS } from "../teamHubStrings";
import { resizeImageForUpload } from "@/lib/imageResize";

type Category = keyof (typeof TEAM_HUB_STRINGS)["en"]["issues"]["categories"];
const CATEGORIES: { key: Category; icon: string }[] = [
  { key: "restroom", icon: "🚻" },
  { key: "trash", icon: "🗑️" },
  { key: "damage", icon: "🔨" },
  { key: "leak", icon: "💧" },
  { key: "access", icon: "🔑" },
  { key: "supplies", icon: "📦" },
  { key: "safety", icon: "⚠️" },
  { key: "other", icon: "❓" },
];

const MAX_PHOTOS = 5;

type PendingPhoto = { id: string; blob: Blob; previewUrl: string };

// apiBase: see SuppliesView — lets Crew Link reuse this screen.
export default function IssueReportView({
  token,
  lang,
  onBack,
  workerName,
  apiBase,
  reporterName,
}: {
  token: string;
  lang: TeamHubLang;
  onBack: () => void;
  // Team Hub: the signed-in worker, shown with the date/time on the form.
  workerName?: string;
  apiBase?: string;
  // Crew Link only: the name the person typed (Team Hub knows its worker).
  reporterName?: string;
}) {
  const s = teamHubStrings(lang).issues;
  const common = teamHubStrings(lang).common;

  const [category, setCategory] = useState<Category | null>(null);
  const [note, setNote] = useState("");
  const [photos, setPhotos] = useState<PendingPhoto[]>([]);
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  async function addPhotos(fileList: FileList | null) {
    if (!fileList) return;
    setError("");
    const files = Array.from(fileList);
    const room = MAX_PHOTOS - photos.length;
    if (files.length > room) {
      setError(s.tooManyPhotos);
    }
    for (const file of files.slice(0, room)) {
      if (file.size > 8 * 1024 * 1024) {
        setError(s.photoTooBig);
        continue;
      }
      const { blob } = await resizeImageForUpload(file);
      setPhotos((prev) => [...prev, { id: crypto.randomUUID(), blob, previewUrl: URL.createObjectURL(blob) }]);
    }
  }

  function removePhoto(id: string) {
    setPhotos((prev) => {
      const photo = prev.find((p) => p.id === id);
      if (photo) URL.revokeObjectURL(photo.previewUrl);
      return prev.filter((p) => p.id !== id);
    });
  }

  // "Other" needs a note so the office knows what it is.
  const noteMissing = category === "other" && !note.trim();

  async function send() {
    if (!category || noteMissing) return;
    setSending(true);
    setError("");
    try {
      const formData = new FormData();
      formData.set("category", category);
      formData.set("note", note);
      if (reporterName) formData.set("reporterName", reporterName);
      photos.forEach((p, i) => formData.append("photos", p.blob, `photo-${i}.jpg`));

      const res = await fetch(`${apiBase ?? `/api/team-hub/${encodeURIComponent(token)}`}/issues`, { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setError(data.error || common.somethingWrong);
        return;
      }
      navigator.vibrate?.([15, 60, 15]);
      setSent(true);
      setTimeout(onBack, 1400);
    } catch {
      setError(common.noSignal);
    } finally {
      setSending(false);
    }
  }

  if (sent) {
    return (
      <div className="mt-6 rounded-2xl bg-green-50 border-2 border-green-200 p-8 text-center">
        <p className="text-2xl">✓</p>
        <p className="mt-2 text-lg font-bold text-green-800">{s.sent}</p>
      </div>
    );
  }

  return (
    <div className="mt-3 space-y-3">
      <button type="button" onClick={onBack} className="text-base font-semibold text-blue-700">
        ← {common.back}
      </button>

      <WorkerAndTime workerName={workerName} lang={lang} />

      <h2 className="text-xl font-bold text-slate-900">{s.whatsWrong}</h2>

      {error && <div className="rounded-xl bg-amber-100 px-4 py-3 text-base font-semibold text-amber-900">{error}</div>}

      <div className="grid grid-cols-2 gap-3">
        {CATEGORIES.map(({ key, icon }) => (
          <button
            key={key}
            type="button"
            onClick={() => {
              navigator.vibrate?.(10);
              setCategory(key);
            }}
            className={`flex min-h-[80px] flex-col items-center justify-center gap-1 rounded-2xl text-lg font-bold ${
              category === key ? "bg-blue-700 text-white" : "bg-white text-slate-800 shadow-sm"
            }`}
          >
            <span className="text-3xl">{icon}</span>
            {s.categories[key]}
          </button>
        ))}
      </div>

      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder={category === "other" ? s.noteRequired : s.notePlaceholder}
        rows={3}
        className={`w-full rounded-xl border bg-white p-3 text-lg ${noteMissing ? "border-amber-400" : "border-gray-200"}`}
      />

      <div className="flex flex-wrap gap-2">
        {photos.map((photo) => (
          <div key={photo.id} className="relative h-20 w-20 overflow-hidden rounded-xl">
            {/* eslint-disable-next-line @next/next/no-img-element -- local
                object URLs for freshly-picked photos, not worth next/image's
                remote-loader setup for a throwaway preview. */}
            <img src={photo.previewUrl} alt="" className="h-full w-full object-cover" />
            <button
              type="button"
              onClick={() => removePhoto(photo.id)}
              className="absolute right-0.5 top-0.5 flex h-6 w-6 items-center justify-center rounded-full bg-black/60 text-xs font-bold text-white"
            >
              ✕
            </button>
          </div>
        ))}
        {photos.length < MAX_PHOTOS && (
          <label className="flex h-20 w-20 cursor-pointer flex-col items-center justify-center gap-1 rounded-xl bg-white text-xs font-semibold text-slate-600 shadow-sm">
            <span className="text-2xl">📷</span>
            {s.addPhoto}
            <input type="file" accept="image/*" capture="environment" multiple className="hidden" onChange={(e) => addPhotos(e.target.files)} />
          </label>
        )}
      </div>

      <button
        type="button"
        onClick={send}
        disabled={sending || !category || noteMissing}
        className="min-h-[72px] w-full rounded-2xl bg-blue-700 text-xl font-bold text-white disabled:opacity-40"
      >
        {sending ? s.sending : s.send}
      </button>
    </div>
  );
}
