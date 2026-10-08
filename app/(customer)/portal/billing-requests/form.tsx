"use client";

import { BigButton, ErrorBox, Screen, SelectField, TextAreaField } from "@/app/ui";
import { useState } from "react";
import { useRouter } from "next/navigation";

const REQUEST_TYPES = [
  "Invoice Copy",
  "Payment Question",
  "Update Billing Information",
  "Billing Dispute",
  "Payment Confirmation",
  "Other",
];

export function BillingRequestForm({
  accountId,
  accountName,
}: {
  accountId: string;
  accountName: string;
}) {
  const router = useRouter();
  const [requestType, setRequestType] = useState("");
  const [details, setDetails] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!requestType) { setError("Please select a request type."); return; }
    setSubmitting(true);
    setError("");
    try {
      const res = await fetch("/api/portal/billing-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestType, details }),
      });
      const data = (await res.json()) as { success?: boolean; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Submission failed.");
      router.push("/portal/dashboard?submitted=billing");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Screen title="Billing Request" subtitle={`Submitting for: ${accountName}`} backHref="/portal/dashboard">
      <form onSubmit={handleSubmit} className="ui-stack" noValidate>
        <SelectField label="Request Type" value={requestType} onChange={(e) => setRequestType(e.target.value)}>
          <option value="">Select request type...</option>
          {REQUEST_TYPES.map((t) => <option key={t}>{t}</option>)}
        </SelectField>
        <TextAreaField
          label="Details"
          optional
          value={details}
          onChange={(e) => setDetails(e.target.value)}
          rows={4}
          placeholder="Provide any additional details about your billing request..."
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
