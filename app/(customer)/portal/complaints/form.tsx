"use client";

import { BigButton, ErrorBox, Field, PhotoPicker, Screen, SelectField, TextAreaField } from "@/app/ui";
import { useState } from "react";
import { useRouter } from "next/navigation";

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
  const [issueType, setIssueType] = useState("");
  const [description, setDescription] = useState("");
  const [incidentDate, setIncidentDate] = useState("");
  const [photos, setPhotos] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

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
        for (const file of photos) {
          const fd = new FormData();
          fd.append("file", file);
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
    <Screen title="Report an Issue" subtitle={`Submitting for: ${accountName}`} backHref="/portal/dashboard">
      <form onSubmit={handleSubmit} className="ui-stack" noValidate>
        <SelectField label="Issue Type" value={issueType} onChange={(e) => setIssueType(e.target.value)}>
          <option value="">Select issue type...</option>
          {ISSUE_TYPES.map((t) => <option key={t}>{t}</option>)}
        </SelectField>
        <TextAreaField
          label="Description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={4}
          placeholder="Please describe the issue in detail..."
        />
        <Field label="Date of Incident" optional type="date" value={incidentDate} onChange={(e) => setIncidentDate(e.target.value)} />
        <PhotoPicker label="Photos (optional, max 10 MB each)" files={photos} onChange={setPhotos} max={20} />

        {error ? <ErrorBox title={error} /> : null}

        <p className="ui-muted">Account ID: {accountId}</p>

        <div className="ui-actionbar">
          <BigButton type="submit" busy={busy} busyLabel={uploading ? "Uploading photos…" : "Submitting…"}>
            Submit Report
          </BigButton>
        </div>
      </form>
    </Screen>
  );
}
