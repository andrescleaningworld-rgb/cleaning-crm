"use client";

import Link from "next/link";
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
    <main
      className="min-h-screen px-4 py-8"
      style={{ background: "linear-gradient(160deg, #003b7a 0%, #005bbb 60%, #eef7ff 100%)" }}
    >
      <div className="mx-auto w-full max-w-lg space-y-4">
        <div className="flex items-center gap-3">
          <Link href="/portal/dashboard" className="text-sm font-semibold text-blue-200 hover:text-white">
            ← Dashboard
          </Link>
        </div>
        <h1 className="text-2xl font-bold text-white">Request Date Change</h1>
        <p className="text-sm text-blue-200">
          Submitting for: <span className="font-semibold text-white">{accountName}</span>
        </p>

        <div className="rounded-3xl bg-white px-6 py-8 shadow-xl">
          <form onSubmit={handleSubmit} className="space-y-5" noValidate>

            <div>
              <label className="mb-1.5 block text-sm font-semibold text-slate-700">
                Current Service Date <span className="text-red-500">*</span>
              </label>
              <input
                type="date"
                value={currentDate}
                onChange={(e) => setCurrentDate(e.target.value)}
                required
                className="min-h-[52px] w-full rounded-xl border border-slate-300 px-4 py-3 text-base text-slate-900 outline-none focus:border-[#003b7a] focus:ring-2 focus:ring-[#003b7a]/20"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-semibold text-slate-700">
                Requested New Date <span className="text-red-500">*</span>
              </label>
              <input
                type="date"
                value={requestedDate}
                onChange={(e) => setRequestedDate(e.target.value)}
                required
                className="min-h-[52px] w-full rounded-xl border border-slate-300 px-4 py-3 text-base text-slate-900 outline-none focus:border-[#003b7a] focus:ring-2 focus:ring-[#003b7a]/20"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-semibold text-slate-700">
                Reason for Change
              </label>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={3}
                placeholder="e.g. Holiday, building closed, travel..."
                className="w-full rounded-xl border border-slate-300 px-4 py-3 text-base text-slate-900 outline-none placeholder:text-slate-400 focus:border-[#003b7a] focus:ring-2 focus:ring-[#003b7a]/20"
              />
            </div>

            {error && (
              <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="min-h-[52px] w-full rounded-xl px-4 py-3 text-base font-bold text-white shadow-sm transition active:scale-[0.98] disabled:opacity-60"
              style={{ backgroundColor: "#003b7a" }}
            >
              {submitting ? "Submitting…" : "Submit Request"}
            </button>
          </form>
        </div>
        <p className="pb-4 text-center text-xs text-blue-200">Account ID: {accountId}</p>
      </div>
    </main>
  );
}
