"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { submitCustomerComplaint, getCustomerRequests } from "../../lib/backend";

export default function CustomerComplaintsPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [customerId, setCustomerId] = useState("");
  const [form, setForm] = useState({
    issue: "",
    location: "",
    urgency: "Normal",
    photo: null as File | null,
  });
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [openComplaints, setOpenComplaints] = useState<
    { issue?: string; status?: string; date?: string }[]
  >([]);

  useEffect(() => {
    const storedId = localStorage.getItem("cwCustomerId");
    if (!storedId) {
      router.replace("/customer-portal/login");
      return;
    }
    setCustomerId(storedId);

    async function loadOpen() {
      try {
        const reqs = await getCustomerRequests(storedId!);
        setOpenComplaints(
          (reqs as { type?: string; issue?: string; status?: string; date?: string }[])
            .filter(
              (r) =>
                (r.type?.toLowerCase().includes("complaint") || Boolean(r.issue)) &&
                (r.status || "Open") !== "Resolved" &&
                (r.status || "Open") !== "Closed"
            )
            .slice(0, 3)
        );
      } catch {
        // Non-critical — skip
      }
    }
    loadOpen();
  }, [router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!customerId) return;

    try {
      setSubmitting(true);
      setError("");
      await submitCustomerComplaint({
        issue: form.issue,
        location: form.location,
        urgency: form.urgency,
        customerId,
        photoName: form.photo?.name,
      });
      setSubmitted(true);
    } catch {
      setError("Something went wrong submitting your report. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (!customerId) return null;

  if (submitted) {
    return (
      <div className="ui-screen">
        <div className="ui-portal-mark">
          ✅
        </div>
        <h1 className="ui-screen-title">
          Thank you for letting us know
        </h1>
        <p className="ui-muted">
          Your report has been received. A Cleaning World manager will follow up
          with you shortly.
        </p>
        <Link
          href="/customer-portal"
          className="ui-btn ui-btn-second"
        >
          Back to My Account
        </Link>
      </div>
    );
  }

  return (
    <div className="ui-screen">
      <Link
        href="/customer-portal"
        className="ui-link"
      >
        ← Back to My Account
      </Link>

      <h1 className="ui-screen-title">
        Report an Issue
      </h1>
      <p className="ui-muted">
        We take every concern seriously. Describe what happened and we&apos;ll
        follow up as quickly as possible.
      </p>

      {openComplaints.length > 0 && (
        <div className="ui-stat">
          <p className="ui-strong">
            You have {openComplaints.length} open{" "}
            {openComplaints.length === 1 ? "issue" : "issues"}:
          </p>
          <ul className="ui-stack">
            {openComplaints.map((c, i) => (
              <li key={i}>
                · {String(c.issue || "Issue").slice(0, 60)} —{" "}
                <span className="ui-strong">{c.status || "Open"}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <form
        onSubmit={handleSubmit}
        className="ui-card ui-stack"
      >
        <div>
          <label className="ui-label">
            What happened? *
          </label>
          <textarea
            required
            value={form.issue}
            onChange={(e) => setForm({ ...form, issue: e.target.value })}
            className="ui-input w-full"
            placeholder="e.g. Restrooms were not cleaned, missed areas in the lobby..."
          />
        </div>

        <div>
          <label className="ui-label">
            Specific area or location
          </label>
          <input
            type="text"
            value={form.location}
            onChange={(e) => setForm({ ...form, location: e.target.value })}
            className="ui-input w-full"
            placeholder="e.g. 2nd floor restrooms, main lobby"
          />
        </div>

        <div>
          <label className="ui-label">
            How urgent is this?
          </label>
          <select
            value={form.urgency}
            onChange={(e) => setForm({ ...form, urgency: e.target.value })}
            className="ui-input w-full"
          >
            <option value="Low">Low — can wait for next service</option>
            <option value="Normal">Normal — please address soon</option>
            <option value="High">High — needs attention before next visit</option>
            <option value="Urgent">Urgent — immediate follow-up requested</option>
          </select>
        </div>

        <div>
          <label className="ui-label">
            Attach a photo (optional)
          </label>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={(e) =>
              setForm({ ...form, photo: e.target.files?.[0] || null })
            }
            className="ui-input hidden"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="ui-btn ui-btn-second w-full"
          >
            {form.photo ? `Selected: ${form.photo.name} — tap to change` : "Tap to attach a photo"}
          </button>
        </div>

        {error && (
          <div className="ui-field-error">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="ui-btn ui-btn-main w-full"
        >
          {submitting ? "Submitting..." : "Submit Report"}
        </button>
      </form>
    </div>
  );
}
