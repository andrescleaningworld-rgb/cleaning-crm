"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

type PhotoEntry = { file: File; preview: string };

const ISSUE_TYPES = [
  "Missed Cleaning",
  "Quality Issue",
  "Staff Conduct",
  "Damaged Property",
  "Communication Issue",
  "Other",
];

export function ComplaintsForm({
  accountId,
  accountName,
}: {
  accountId: string;
  accountName: string;
}) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [issueType, setIssueType] = useState("");
  const [description, setDescription] = useState("");
  const [incidentDate, setIncidentDate] = useState("");
  const [photos, setPhotos] = useState<PhotoEntry[]>([]);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  function handlePhotoSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;
    const entries = files.map((f) => ({ file: f, preview: URL.createObjectURL(f) }));
    setPhotos((prev) => [...prev, ...entries]);
    e.target.value = "";
  }

  function removePhoto(index: number) {
    setPhotos((prev) => {
      URL.revokeObjectURL(prev[index].preview);
      return prev.filter((_, i) => i !== index);
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!issueType || !description) {
      setError("Please fill in the issue type and description.");
      return;
    }

    setSubmitting(true);
    setError("");

    try {
      // Upload photos first
      const photoUrls: string[] = [];
      if (photos.length > 0) {
        setUploading(true);
        for (const entry of photos) {
          const fd = new FormData();
          fd.append("file", entry.file);
          const res = await fetch("/api/portal/upload", { method: "POST", body: fd });
          const data = (await res.json()) as { success?: boolean; url?: string; error?: string };
          if (!res.ok) throw new Error(data.error ?? "Photo upload failed.");
          photoUrls.push(data.url!);
        }
        setUploading(false);
      }

      const res = await fetch("/api/portal/complaints", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ issueType, description, incidentDate, photos: photoUrls }),
      });
      const data = (await res.json()) as { success?: boolean; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Submission failed.");

      router.push("/portal/dashboard?submitted=complaint");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setUploading(false);
    } finally {
      setSubmitting(false);
    }
  }

  const busy = submitting || uploading;

  return (
    <main
      className="min-h-screen px-4 py-8"
      style={{ background: "linear-gradient(160deg, #003b7a 0%, #005bbb 60%, #eef7ff 100%)" }}
    >
      <div className="mx-auto w-full max-w-lg space-y-4">
        {/* Header */}
        <div className="flex items-center gap-3">
          <Link href="/portal/dashboard" className="text-sm font-semibold text-blue-200 hover:text-white">
            ← Dashboard
          </Link>
        </div>
        <h1 className="text-2xl font-bold text-white">Report an Issue</h1>
        <p className="text-sm text-blue-200">
          Submitting for: <span className="font-semibold text-white">{accountName}</span>
        </p>

        {/* Form card */}
        <div className="rounded-3xl bg-white px-6 py-8 shadow-xl">
          <form onSubmit={handleSubmit} className="space-y-5" noValidate>

            {/* Issue Type */}
            <div>
              <label className="mb-1.5 block text-sm font-semibold text-slate-700">
                Issue Type <span className="text-red-500">*</span>
              </label>
              <select
                value={issueType}
                onChange={(e) => setIssueType(e.target.value)}
                required
                className="min-h-[52px] w-full rounded-xl border border-slate-300 px-4 py-3 text-base text-slate-900 outline-none focus:border-[#003b7a] focus:ring-2 focus:ring-[#003b7a]/20"
              >
                <option value="">Select issue type...</option>
                {ISSUE_TYPES.map((t) => <option key={t}>{t}</option>)}
              </select>
            </div>

            {/* Description */}
            <div>
              <label className="mb-1.5 block text-sm font-semibold text-slate-700">
                Description <span className="text-red-500">*</span>
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                required
                rows={4}
                placeholder="Please describe the issue in detail..."
                className="w-full rounded-xl border border-slate-300 px-4 py-3 text-base text-slate-900 outline-none placeholder:text-slate-400 focus:border-[#003b7a] focus:ring-2 focus:ring-[#003b7a]/20"
              />
            </div>

            {/* Date of Incident */}
            <div>
              <label className="mb-1.5 block text-sm font-semibold text-slate-700">
                Date of Incident
              </label>
              <input
                type="date"
                value={incidentDate}
                onChange={(e) => setIncidentDate(e.target.value)}
                className="min-h-[52px] w-full rounded-xl border border-slate-300 px-4 py-3 text-base text-slate-900 outline-none focus:border-[#003b7a] focus:ring-2 focus:ring-[#003b7a]/20"
              />
            </div>

            {/* Photos */}
            <div>
              <label className="mb-1.5 block text-sm font-semibold text-slate-700">
                Photos <span className="text-xs font-normal text-slate-500">(optional, max 10 MB each)</span>
              </label>

              {photos.length > 0 && (
                <div className="mb-3 grid grid-cols-3 gap-2">
                  {photos.map((p, i) => (
                    <div key={i} className="relative">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={p.preview}
                        alt={`Photo ${i + 1}`}
                        className="h-24 w-full rounded-xl object-cover"
                      />
                      <button
                        type="button"
                        onClick={() => removePhoto(i)}
                        className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-600 text-xs text-white"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                multiple
                className="hidden"
                onChange={handlePhotoSelect}
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="min-h-[48px] w-full rounded-xl border-2 border-dashed border-slate-300 px-4 py-3 text-sm font-semibold text-slate-600 hover:border-[#003b7a] hover:text-[#003b7a]"
              >
                {photos.length > 0 ? `${photos.length} photo${photos.length > 1 ? "s" : ""} selected — tap to add more` : "Tap to add photos"}
              </button>
            </div>

            {error && (
              <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={busy}
              className="min-h-[52px] w-full rounded-xl px-4 py-3 text-base font-bold text-white shadow-sm transition active:scale-[0.98] disabled:opacity-60"
              style={{ backgroundColor: "#003b7a" }}
            >
              {uploading ? "Uploading photos…" : submitting ? "Submitting…" : "Submit Report"}
            </button>
          </form>
        </div>

        <p className="pb-4 text-center text-xs text-blue-200">
          Account ID: {accountId}
        </p>
      </div>
    </main>
  );
}
