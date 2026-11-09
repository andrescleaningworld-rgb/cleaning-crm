"use client";

// Proof of fix, for closing a complaint (staff): the after photo(s) from the
// camera or the gallery, or "No photo needed" with a short reason. The photos
// are uploaded when the close is sent (uploadFixPhotos), to
// POST /api/complaints/<key>/photo; the server checks there is proof
// (lib/pg/complaint-fix.ts).

import { Field, PhotoPicker } from "@/app/ui";

export type FixProof = { files: File[]; noPhoto: boolean; reason: string };
export const EMPTY_FIX_PROOF: FixProof = { files: [], noPhoto: false, reason: "" };

/** "" when the proof is enough, else what to tell the person. */
export function fixProofProblem(proof: FixProof): string {
  if (proof.noPhoto) return proof.reason.trim() ? "" : "Say why no photo is needed.";
  return proof.files.length > 0 ? "" : "Add an after photo, or tap “No photo needed”.";
}

/** Uploads the after photos for this complaint; returns their addresses. Throws a message to show. */
export async function uploadFixPhotos(complaintKey: string, files: File[]): Promise<string[]> {
  const urls: string[] = [];
  for (const file of files) {
    const form = new FormData();
    form.append("file", file);
    const response = await fetch(`/api/complaints/${encodeURIComponent(complaintKey)}/photo`, { method: "POST", body: form });
    const data = (await response.json().catch(() => ({}))) as { success?: boolean; url?: string; error?: string };
    if (!response.ok || !data.url) throw new Error(data.error || "A photo did not upload. Try again.");
    urls.push(data.url);
  }
  return urls;
}

export function FixProofFields({ value, onChange }: { value: FixProof; onChange: (next: FixProof) => void }) {
  return (
    <div className="ui-stack">
      {!value.noPhoto ? <PhotoPicker label="After photo (the fixed problem)" files={value.files} onChange={(files) => onChange({ ...value, files })} max={6} /> : null}
      <button
        type="button"
        aria-pressed={value.noPhoto}
        className={`ui-pick ${value.noPhoto ? "ui-pick-on" : ""}`.trim()}
        onClick={() => onChange({ ...value, noPhoto: !value.noPhoto })}
      >
        <span className="min-w-0 flex-1 ui-strong">No photo needed</span>
        <span className="ui-pick-mark" aria-hidden="true">
          ✓
        </span>
      </button>
      {value.noPhoto ? <Field label="Why no photo?" value={value.reason} onChange={(event) => onChange({ ...value, reason: event.target.value })} placeholder="e.g. it was a missed trash pickup" /> : null}
    </div>
  );
}
