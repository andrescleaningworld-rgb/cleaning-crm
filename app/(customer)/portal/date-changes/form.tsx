"use client";

import { BigButton, ErrorBox, Field, Screen, TextAreaField } from "@/app/ui";
import { useState } from "react";
import { useRouter } from "next/navigation";

export function DateChangeForm({
  accountId,
  accountName,
}: {
  accountId: string;
  accountName: string;
}) {
  const router = useRouter();
  const [currentDate, setCurrentDate] = useState("");
  const [requestedDate, setRequestedDate] = useState("");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!currentDate || !requestedDate) {
      setError("Both current and requested dates are required.");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      const res = await fetch("/api/portal/date-changes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentDate, requestedDate, reason }),
      });
      const data = (await res.json()) as { success?: boolean; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Submission failed.");
      router.push("/portal/dashboard?submitted=date-change");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Screen title="Request Date Change" subtitle={`Submitting for: ${accountName}`} backHref="/portal/dashboard">
      <form onSubmit={handleSubmit} className="ui-stack" noValidate>
        <Field label="Current Service Date" type="date" value={currentDate} onChange={(e) => setCurrentDate(e.target.value)} />
        <Field label="Requested New Date" type="date" value={requestedDate} onChange={(e) => setRequestedDate(e.target.value)} />
        <TextAreaField
          label="Reason for Change"
          optional
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={3}
          placeholder="e.g. Holiday, building closed, travel..."
        />

        {error ? <ErrorBox title={error} /> : null}

        <p className="ui-muted">Account ID: {accountId}</p>

        <div className="ui-actionbar">
          <BigButton type="submit" busy={submitting} busyLabel={"Submitting…"}>
            Submit Request
          </BigButton>
        </div>
      </form>
    </Screen>
  );
}
