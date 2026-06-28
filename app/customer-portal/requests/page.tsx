"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { submitCustomerRequest, getCustomerRequests } from "../../lib/backend";

const REQUEST_TYPES = [
  "Specialty Service (e.g. floor care, deep clean)",
  "Change Service Date",
  "Change Service Frequency",
  "Temporary Pause / Resume Service",
  "Other Request",
];

export default function CustomerRequestsPage() {
  const router = useRouter();
  const [customerId, setCustomerId] = useState("");
  const [form, setForm] = useState({
    type: REQUEST_TYPES[0],
    details: "",
    preferredDate: "",
  });
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [pendingRequests, setPendingRequests] = useState<
    { type?: string; details?: string; status?: string }[]
  >([]);

  useEffect(() => {
    const storedId = localStorage.getItem("cwCustomerId");
    if (!storedId) {
      router.replace("/customer-portal/login");
      return;
    }
    setCustomerId(storedId);

    async function loadPending() {
      try {
        const reqs = await getCustomerRequests(storedId!);
        setPendingRequests(
          (reqs as { type?: string; issue?: string; details?: string; status?: string }[])
            .filter(
              (r) =>
                !r.type?.toLowerCase().includes("complaint") &&
                !r.issue &&
                (r.status || "Pending") !== "Completed"
            )
            .slice(0, 3)
        );
      } catch {
        // Non-critical — skip
      }
    }
    loadPending();
  }, [router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!customerId) return;

    try {
      setSubmitting(true);
      setError("");
      await submitCustomerRequest({
        type: form.type,
        details: form.details,
        preferredDate: form.preferredDate,
        customerId,
      });
      setSubmitted(true);
    } catch {
      setError("Something went wrong submitting your request. Please try again.");
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
        <h1 className="text-2xl font-black text-slate-950">Request Received</h1>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          Your request has been sent to the Cleaning World team. We&apos;ll
          contact you within 1 business day.
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
        Submit a Request
      </h1>
      <p className="mt-2 text-sm leading-6 text-slate-500">
        Need a specialty service, a schedule change, or something else? Let us
        know and the team will get back to you within 1 business day.
      </p>

      {pendingRequests.length > 0 && (
        <div className="mt-4 rounded-2xl border border-blue-200 bg-blue-50 p-4">
          <p className="text-sm font-bold text-blue-900">
            You have {pendingRequests.length} pending{" "}
            {pendingRequests.length === 1 ? "request" : "requests"}:
          </p>
          <ul className="mt-2 space-y-1">
            {pendingRequests.map((r, i) => (
              <li key={i} className="text-xs text-blue-800">
                · {r.type || "Request"} —{" "}
                <span className="font-semibold">{r.status || "Pending"}</span>
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
            Request Type
          </label>
          <select
            value={form.type}
            onChange={(e) => setForm({ ...form, type: e.target.value })}
            className="mt-2 min-h-[48px] w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-purple-500"
          >
            {REQUEST_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-black text-slate-700">
            Details *
          </label>
          <textarea
            required
            value={form.details}
            onChange={(e) => setForm({ ...form, details: e.target.value })}
            className="mt-2 min-h-[120px] w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-100"
            placeholder="Please describe what you need..."
          />
        </div>

        <div>
          <label className="block text-sm font-black text-slate-700">
            Preferred Date (if applicable)
          </label>
          <input
            type="date"
            value={form.preferredDate}
            onChange={(e) =>
              setForm({ ...form, preferredDate: e.target.value })
            }
            className="mt-2 min-h-[48px] w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-purple-500"
          />
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
          {submitting ? "Submitting..." : "Submit Request"}
        </button>
      </form>
    </div>
  );
}
