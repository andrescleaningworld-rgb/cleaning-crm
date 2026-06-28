"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { submitCustomerComplaint, getCustomerRequests } from "../../lib/backend";

export default function CustomerComplaintsPage() {
  const router = useRouter();
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
      <div className="mx-auto max-w-md px-4 py-12 text-center">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-4xl">
          ✅
        </div>
        <h1 className="text-2xl font-black text-slate-950">
          Thank you for letting us know
        </h1>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          Your report has been received. A Cleaning World manager will follow up
          with you shortly.
        </p>
        <Link
          href="/customer-portal"
          className="mt-6 inline-block rounded-xl bg-purple-700 px-6 py-3 text-sm font-bold text-white hover:bg-purple-800"
        >
          Back to My Account
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-2 py-4 sm:py-6">
      <Link
        href="/customer-portal"
        className="text-sm font-semibold text-purple-700 hover:underline"
      >
        ← Back to My Account
      </Link>

      <h1 className="mt-4 text-2xl font-black tracking-tight text-slate-950 sm:text-3xl">
        Report an Issue
      </h1>
      <p className="mt-2 text-sm leading-6 text-slate-500">
        We take every concern seriously. Describe what happened and we&apos;ll
        follow up as quickly as possible.
      </p>

      {openComplaints.length > 0 && (
        <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4">
          <p className="text-sm font-bold text-amber-900">
            You have {openComplaints.length} open{" "}
            {openComplaints.length === 1 ? "issue" : "issues"}:
          </p>
          <ul className="mt-2 space-y-1">
            {openComplaints.map((c, i) => (
              <li key={i} className="text-xs text-amber-800">
                · {String(c.issue || "Issue").slice(0, 60)} —{" "}
                <span className="font-semibold">{c.status || "Open"}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <form
        onSubmit={handleSubmit}
        className="mt-6 space-y-5 rounded-3xl border border-slate-100 bg-white p-6 shadow-sm"
      >
        <div>
          <label className="block text-sm font-black text-slate-700">
            What happened? *
          </label>
          <textarea
            required
            value={form.issue}
            onChange={(e) => setForm({ ...form, issue: e.target.value })}
            className="mt-2 min-h-[120px] w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-100"
            placeholder="e.g. Restrooms were not cleaned, missed areas in the lobby..."
          />
        </div>

        <div>
          <label className="block text-sm font-black text-slate-700">
            Specific area or location
          </label>
          <input
            type="text"
            value={form.location}
            onChange={(e) => setForm({ ...form, location: e.target.value })}
            className="mt-2 min-h-[48px] w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-100"
            placeholder="e.g. 2nd floor restrooms, main lobby"
          />
        </div>

        <div>
          <label className="block text-sm font-black text-slate-700">
            How urgent is this?
          </label>
          <select
            value={form.urgency}
            onChange={(e) => setForm({ ...form, urgency: e.target.value })}
            className="mt-2 min-h-[48px] w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-purple-500"
          >
            <option value="Low">Low — can wait for next service</option>
            <option value="Normal">Normal — please address soon</option>
            <option value="High">High — needs attention before next visit</option>
            <option value="Urgent">Urgent — immediate follow-up requested</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-black text-slate-700">
            Attach a photo (optional)
          </label>
          <input
            type="file"
            accept="image/*"
            onChange={(e) =>
              setForm({ ...form, photo: e.target.files?.[0] || null })
            }
            className="mt-2 w-full text-sm text-slate-600"
          />
          {form.photo && (
            <p className="mt-1 text-xs text-slate-500">
              Selected: {form.photo.name}
            </p>
          )}
        </div>

        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-800">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="min-h-[48px] w-full rounded-xl bg-purple-700 py-3 text-sm font-bold text-white hover:bg-purple-800 disabled:opacity-60"
        >
          {submitting ? "Submitting..." : "Submit Report"}
        </button>
      </form>
    </div>
  );
}
