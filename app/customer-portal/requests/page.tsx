"use client";

import { useState } from "react";
import Link from "next/link";
import { submitCustomerRequest } from "../../lib/backend";

export default function CustomerRequestsPage() {
  const [form, setForm] = useState({
    type: "Specialty Service",
    details: "",
    preferredDate: "",
  });
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await submitCustomerRequest({
      type: form.type,
      details: form.details,
      preferredDate: form.preferredDate,
    });
    setSubmitted(true);
  };

  if (submitted) {
    return (
      <div className="mx-auto max-w-md px-4 py-12 text-center">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-purple-100 text-4xl">
          ✅
        </div>
        <h1 className="text-2xl font-bold">Request Received</h1>
        <p className="mt-2 text-gray-600">
          Thank you. Your request has been sent to the Cleaning World team. 
          We&apos;ll contact you within 1 business day.
        </p>
        <Link href="/customer-portal" className="mt-6 inline-block rounded-xl bg-purple-700 px-6 py-3 text-white">
          Back to My Account
        </Link>
      </div>
    );
  }

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <Link href="/customer-portal" className="text-sm text-purple-600">← Back to Portal</Link>
      
      <h1 className="mt-4 text-3xl font-bold">Submit a Request</h1>
      <p className="mt-2 text-gray-600">
        Use this form to request specialty services, date changes, frequency adjustments, or other service modifications.
      </p>

      <form onSubmit={handleSubmit} className="mt-8 space-y-6 rounded-3xl border p-6">
        <div>
          <label className="block text-sm font-semibold">Request Type</label>
          <select 
            value={form.type} 
            onChange={(e) => setForm({ ...form, type: e.target.value })}
            className="mt-1 w-full rounded-xl border p-3"
          >
            <option>Specialty Service (e.g. floor care, deep clean)</option>
            <option>Change Service Date</option>
            <option>Change Service Frequency</option>
            <option>Temporary Pause / Resume Service</option>
            <option>Other Request</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-semibold">Details</label>
          <textarea 
            required
            value={form.details}
            onChange={(e) => setForm({ ...form, details: e.target.value })}
            className="mt-1 w-full rounded-xl border p-3 min-h-[120px]"
            placeholder="Please describe what you need..."
          />
        </div>

        <div>
          <label className="block text-sm font-semibold">Preferred Date (if applicable)</label>
          <input 
            type="date" 
            value={form.preferredDate}
            onChange={(e) => setForm({ ...form, preferredDate: e.target.value })}
            className="mt-1 w-full rounded-xl border p-3"
          />
        </div>

        <button 
          type="submit"
          className="w-full rounded-xl bg-purple-700 py-3 font-bold text-white hover:bg-purple-800"
        >
          Submit Request
        </button>
      </form>

      <p className="mt-4 text-center text-xs text-gray-500">
        This is currently a simulation. Real submissions will be saved and routed to the team once we move to the new backend.
      </p>
    </main>
  );
}
