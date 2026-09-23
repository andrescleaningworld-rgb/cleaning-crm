"use client";

// Crew Link "Problem": tap a big icon for the type, optional photo (opens
// the camera), note (optional — required for "Other"), one big Send. Same
// API as before: POST /api/porter-checklist/[code]/issues (multipart).
// Types and their EN/ES labels are the shared Team Hub list for now.
import { useState } from "react";
import { TEAM_HUB_STRINGS, type TeamHubLang } from "@/app/team-hub/teamHubStrings";
import { resizeImageForUpload } from "@/lib/imageResize";
import type { CrewLinkStrings } from "./strings";
import { ErrorBox, SendBar } from "./ui";

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
const MAX_PHOTO_BYTES = 8 * 1024 * 1024;

type PendingPhoto = { id: string; blob: Blob; previewUrl: string };

export default function CrewProblem({
  apiBase,
  s,
  lang,
  name,
  onSent,
}: {
  apiBase: string;
  s: CrewLinkStrings;
  lang: TeamHubLang;
  name: string;
  onSent: () => void;
}) {
  const labels = TEAM_HUB_STRINGS[lang].issues.categories;
  const [category, setCategory] = useState<Category | null>(null);
  const [note, setNote] = useState("");
  const [photos, setPhotos] = useState<PendingPhoto[]>([]);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  const noteMissing = category === "other" && !note.trim();

  async function addPhotos(fileList: FileList | null) {
    if (!fileList) return;
    setError("");
    const files = Array.from(fileList);
    const room = MAX_PHOTOS - photos.length;
    if (files.length > room) setError(s.tooManyPhotos);
    for (const file of files.slice(0, room)) {
      if (file.size > MAX_PHOTO_BYTES) {
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

  async function send() {
    if (!category || noteMissing) return;
    setSending(true);
    setError("");
    try {
      const formData = new FormData();
      formData.set("category", category);
      formData.set("note", note.trim());
      formData.set("reporterName", name);
      photos.forEach((photo, i) => formData.append("photos", photo.blob, `photo-${i}.jpg`));
      const res = await fetch(`${apiBase}/issues`, { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setError(data.error || s.somethingWrong);
        return;
      }
      navigator.vibrate?.([15, 60, 15]);
      photos.forEach((photo) => URL.revokeObjectURL(photo.previewUrl));
      onSent();
    } catch {
      setError(s.noSignal);
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="space-y-4">
      <h2 className="px-1 text-2xl font-black text-slate-900">{s.whatsWrong}</h2>

      <div className="grid grid-cols-2 gap-3">
        {CATEGORIES.map(({ key, icon }) => (
          <button
            key={key}
            type="button"
            onClick={() => {
              navigator.vibrate?.(10);
              setCategory(key);
            }}
            aria-pressed={category === key}
            className={`flex min-h-[112px] flex-col items-center justify-center gap-2 rounded-2xl border-4 px-2 text-xl font-bold shadow-sm ${
              category === key ? "border-blue-700 bg-blue-700 text-white" : "border-transparent bg-white text-slate-800 active:bg-gray-100"
            }`}
          >
            <span className="text-5xl" aria-hidden="true">
              {icon}
            </span>
            {labels[key]}
          </button>
        ))}
      </div>

      {category ? (
        <>
          <div className="space-y-3 rounded-2xl bg-white p-4 shadow-sm">
            {photos.length < MAX_PHOTOS ? (
              <label className="flex min-h-[64px] cursor-pointer items-center justify-center gap-3 rounded-2xl bg-slate-100 text-xl font-bold text-slate-800 active:bg-slate-200">
                <span className="text-3xl" aria-hidden="true">
                  📷
                </span>
                {s.takePhoto}
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  multiple
                  className="hidden"
                  onChange={(event) => {
                    addPhotos(event.target.files);
                    event.target.value = "";
                  }}
                />
              </label>
            ) : null}
            {photos.length > 0 ? (
              <>
                <p className="text-lg text-slate-600">{s.photoCount(photos.length, MAX_PHOTOS)}</p>
                <div className="flex flex-wrap gap-3">
                  {photos.map((photo) => (
                    <div key={photo.id} className="relative h-24 w-24 overflow-hidden rounded-xl">
                      {/* eslint-disable-next-line @next/next/no-img-element -- local object URL preview of a photo just taken */}
                      <img src={photo.previewUrl} alt="" className="h-full w-full object-cover" />
                      <button
                        type="button"
                        onClick={() => removePhoto(photo.id)}
                        aria-label="Remove photo"
                        className="absolute right-1 top-1 flex h-10 w-10 items-center justify-center rounded-full bg-black/70 text-lg font-bold text-white"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              </>
            ) : null}
          </div>

          <label className="block rounded-2xl bg-white p-4 shadow-sm">
            <span className={`text-lg font-bold ${noteMissing ? "text-amber-700" : "text-slate-700"}`}>
              {category === "other" ? s.noteRequired : s.noteOptional}
            </span>
            <textarea
              value={note}
              onChange={(event) => setNote(event.target.value)}
              rows={3}
              maxLength={2000}
              className={`mt-2 w-full rounded-xl border-2 p-3 text-lg ${noteMissing ? "border-amber-400" : "border-slate-300"}`}
            />
          </label>

          <ErrorBox message={error} />
          <SendBar label={s.send} busyLabel={s.sending} busy={sending} disabled={noteMissing} onClick={send} />
        </>
      ) : null}
    </div>
  );
}
