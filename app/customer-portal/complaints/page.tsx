"use client";

import { useState } from "react";
import Link from "next/link";
import { submitCustomerComplaint } from "../../lib/backend";

export default function CustomerComplaintsPage() {
  const [form, setForm] = useState({
    issue: "",
    location: "",
    urgency: "Normal",
  });
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await submitCustomerComplaint({
      issue: form.issue,
      location: form.location,
      urgency: form.urgency,
    });
    setSubmitted(true);
  };

  if (submitted) {
    return (
      <div className="mx-auto max-w-md px-4 py-12 text-center">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-red-100 text-4xl">
          📝
        </div>
        <h1 className="text-2xl font-bold">Thank you for letting us know</h1>
        <p className="mt-2 text-gray-600">
          We&apos;ve received your report. A manager will follow up with you shortly.
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
      
      <h1 className="mt-4 text-3xl font-bold">Report an Issue or Complaint</h1>
      <p className="mt-2 text-gray-600">
        We take your feedback seriously. Please provide details so we can address it quickly.
      </p>

      <form onSubmit={handleSubmit} className="mt-8 space-y-6 rounded-3xl border p-6">
        <div>
          <label className="block text-sm font-semibold">What happened?</label>
          <textarea 
            required
            value={form.issue}
            onChange={(e) => setForm({ ...form, issue: e.target.value })}
            className="mt-1 w-full rounded-xl border p-3 min-h-[120px]"
            placeholder="e.g. Restrooms were not cleaned properly, missed areas in the lobby..."
          />
        </div>

        <div>
          <label className="block text-sm font-semibold">Specific location / area (if known)</label>
          <input 
            type="text" 
            value={form.location}
            onChange={(e) => setForm({ ...form, location: e.target.value })}
            className="mt-1 w-full rounded-xl border p-3"
            placeholder="e.g. Main office restrooms, 2nd floor conference room"
          />
        </div>

        <div>
          <label className="block text-sm font-semibold">How urgent is this?</label>
          <select 
            value={form.urgency} 
            onChange={(e) => setForm({ ...form, urgency: e.target.value })}
            className="mt-1 w-full rounded-xl border p-3"
          >
            <option>Low - Can wait for next service</option>
            <option>Normal - Please address soon</option>
            <option>High - Needs attention before next regular visit</option>
            <option>Urgent - Immediate follow-up requested</option>
          </select>
        </div>

        <button 
          type="submit"
          className="w-full rounded-xl bg-purple-700 py-3 font-bold text-white hover:bg-purple-800"
        >
          Submit Report
        </button>
      </form>
    </main>
  );
}
