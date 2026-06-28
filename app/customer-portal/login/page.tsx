"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

function normalizePhone(raw: string): string {
  return raw.replace(/\D/g, "");
}

export default function CustomerLoginPage() {
  const router = useRouter();
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const digits = normalizePhone(phone);
    if (digits.length < 10) {
      setError("Please enter a valid 10-digit phone number.");
      return;
    }

    try {
      setLoading(true);
      setError("");

      const res = await fetch("/api/customer-portal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "getAccount",
          customerId: digits,
          phone: digits,
        }),
      });

      const data = await res.json();
      const account =
        data.account ||
        (Array.isArray(data.accounts) && data.accounts[0]) ||
        null;

      if (!account) {
        setError(
          "We couldn't find an account with that phone number. Please double-check the number or contact Cleaning World directly."
        );
        return;
      }

      const acc = account as Record<string, unknown>;
      const accountName = String(acc.accountName || acc.name || "Your Account");

      localStorage.setItem("cwCustomerId", digits);
      localStorage.setItem("cwCustomerName", accountName);
      localStorage.setItem("cwRole", "customer");

      router.push("/customer-portal");
    } catch {
      setError("Something went wrong. Please try again or contact us directly.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-[70vh] items-center justify-center px-4 py-8">
      <div className="w-full max-w-md">
        <div className="rounded-3xl border border-purple-100 bg-white p-8 shadow-sm">
          <div className="text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-purple-700">
              <span className="text-xl font-black text-white">CW</span>
            </div>
            <p className="text-xs font-black uppercase tracking-[0.2em] text-purple-700">
              Cleaning World
            </p>
            <h1 className="mt-2 text-2xl font-black tracking-tight text-slate-950">
              Customer Portal
            </h1>
            <p className="mt-2 text-sm leading-6 text-slate-500">
              Enter the phone number on your Cleaning World account to access
              your portal.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="mt-8 space-y-4">
            <div>
              <label
                htmlFor="phone"
                className="mb-2 block text-sm font-semibold text-slate-700"
              >
                Phone Number
              </label>
              <input
                id="phone"
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                required
                autoFocus
                autoComplete="tel"
                className="min-h-[48px] w-full rounded-xl border border-slate-300 px-4 py-3 text-base outline-none focus:border-purple-600 focus:ring-2 focus:ring-purple-100"
                placeholder="(555) 555-5555"
              />
            </div>

            {error && (
              <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-800">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="min-h-[48px] w-full rounded-xl bg-purple-700 px-4 py-3 text-sm font-bold text-white hover:bg-purple-800 disabled:opacity-60"
            >
              {loading ? "Looking up your account..." : "Access My Account"}
            </button>
          </form>

          <p className="mt-6 text-center text-xs leading-5 text-slate-400">
            Having trouble? Contact Cleaning World and we&apos;ll help you right
            away.
          </p>
        </div>
      </div>
    </div>
  );
}
