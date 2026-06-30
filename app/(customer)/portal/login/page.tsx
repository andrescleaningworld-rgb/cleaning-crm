"use client";

import Image from "next/image";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function PortalLoginPage() {
  const router = useRouter();
  const [phone, setPhone] = useState("");
  const [portalCode, setPortalCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/portal/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: phone.trim(), portalCode: portalCode.trim() }),
      });

      const data = (await res.json()) as { success?: boolean; accountName?: string; error?: string };

      if (!res.ok || !data.success) {
        setError(data.error ?? "Invalid portal code");
        return;
      }

      router.push("/portal/dashboard");
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-4 py-10"
      style={{ background: "linear-gradient(160deg, #003b7a 0%, #005bbb 60%, #eef7ff 100%)" }}
    >
      <div className="w-full max-w-sm">

        {/* Logo */}
        <div className="mb-8 flex flex-col items-center gap-3">
          <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-white shadow-md">
            <Image
              src="/logo-CW-single-phone-optimized.png"
              alt="Cleaning World"
              width={64}
              height={64}
              className="rounded-xl object-contain"
              priority
            />
          </div>
          <div className="text-center">
            <p className="text-xs font-bold uppercase tracking-widest text-blue-200">
              Cleaning World
            </p>
            <h1 className="mt-1 text-2xl font-bold text-white">
              Customer Portal
            </h1>
            <p className="mt-1 text-sm text-blue-200">
              Sign in with your phone number and portal code
            </p>
          </div>
        </div>

        {/* Card */}
        <div className="rounded-3xl bg-white px-6 py-8 shadow-xl">
          <form onSubmit={handleSubmit} className="space-y-5" noValidate>
            <div>
              <label
                htmlFor="phone"
                className="mb-1.5 block text-sm font-semibold text-slate-700"
              >
                Phone Number
              </label>
              <input
                id="phone"
                type="tel"
                autoComplete="tel"
                required
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="e.g. (201) 555-1234"
                className="min-h-[52px] w-full rounded-xl border border-slate-300 px-4 py-3 text-base text-slate-900 outline-none placeholder:text-slate-400 focus:border-[#003b7a] focus:ring-2 focus:ring-[#003b7a]/20"
              />
            </div>

            <div>
              <label
                htmlFor="portalCode"
                className="mb-1.5 block text-sm font-semibold text-slate-700"
              >
                Portal Code
              </label>
              <input
                id="portalCode"
                type="text"
                autoComplete="off"
                autoCapitalize="characters"
                required
                value={portalCode}
                onChange={(e) => setPortalCode(e.target.value)}
                placeholder="e.g. CW-AB123"
                className="min-h-[52px] w-full rounded-xl border border-slate-300 px-4 py-3 text-base text-slate-900 outline-none placeholder:text-slate-400 focus:border-[#003b7a] focus:ring-2 focus:ring-[#003b7a]/20"
              />
              <p className="mt-1.5 text-xs text-slate-500">
                Your portal code was provided by Cleaning World.
              </p>
            </div>

            {error ? (
              <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
                {error}
              </div>
            ) : null}

            <button
              type="submit"
              disabled={loading}
              className="min-h-[52px] w-full rounded-xl px-4 py-3 text-base font-bold text-white shadow-sm transition active:scale-[0.98] disabled:opacity-60"
              style={{ backgroundColor: loading ? "#005bbb" : "#003b7a" }}
            >
              {loading ? "Signing in…" : "Sign In"}
            </button>
          </form>
        </div>

        <p className="mt-6 text-center text-xs text-blue-200">
          Need help? Contact your Cleaning World service representative.
        </p>
      </div>
    </main>
  );
}
