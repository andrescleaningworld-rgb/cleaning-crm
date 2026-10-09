"use client";

import { BigButton, ErrorBox, Field, Screen, SelectField, TextAreaField } from "@/app/ui";
import { useState } from "react";
import { useRouter } from "next/navigation";

const SERVICES = [
  "Deep Clean",
  "Window Cleaning",
  "Carpet Cleaning",
  "Move In / Move Out Clean",
  "Post-Construction Clean",
  "Special Event Clean",
  "Floor Waxing / Stripping",
  "Pressure Washing",
  "Other",
];

export function ServiceRequestForm({
  accountId,
  accountName,
}: {
  accountId: string;
  accountName: string;
}) {
  const router = useRouter();
  const [serviceRequested, setServiceRequested] = useState("");
  const [details, setDetails] = useState("");
  const [preferredDate, setPreferredDate] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!serviceRequested) { setError("Please select a service type."); return; }
    setSubmitting(true);
    setError("");
    try {
      const res = await fetch("/api/portal/service-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ serviceRequested, details, preferredDate }),
      });
      const data = (await res.json()) as { success?: boolean; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Submission failed.");
      router.push("/portal/dashboard?submitted=service-request");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Screen title="Service Request" subtitle={`Submitting for: ${accountName}`} backHref="/portal/dashboard">
      <form onSubmit={handleSubmit} className="ui-stack" noValidate>
        <SelectField label="Service Requested" value={serviceRequested} onChange={(e) => setServiceRequested(e.target.value)}>
          <option value="">Select a service...</option>
          {SERVICES.map((s) => <option key={s}>{s}</option>)}
        </SelectField>
        <TextAreaField
          label="Details / Special Instructions"
          optional
          value={details}
          onChange={(e) => setDetails(e.target.value)}
          rows={4}
          placeholder="Describe what you need, specific areas, or any special instructions..."
        />
        <Field label="Preferred Date" optional type="date" value={preferredDate} onChange={(e) => setPreferredDate(e.target.value)} />

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
