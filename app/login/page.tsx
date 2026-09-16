"use client";

import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { identifyManager } from "@/app/components/OneSignalInit";

type Identity = {
  sheetManagerId: string;
  name: string;
  needsSetup: boolean;
};

function setAdminLocalStorageFlags() {
  // Role is primarily read via "cwRole" (used by CWHeader, help, sub portal).
  // Extra legacy keys kept for compatibility with any older code/tabs. Owner
  // vs manager distinction lives server-side in the session (see
  // /api/session-role), not here — both get the "admin" nav bucket.
  localStorage.setItem("cwRole", "admin");
  localStorage.setItem("cwUserRole", "admin");
  localStorage.setItem("userRole", "admin");
  localStorage.setItem("cwAdminLoggedIn", "true");
  localStorage.setItem("isAdminLoggedIn", "true");
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const nextPath = searchParams.get("next") || "/";
  const [mode, setMode] = useState<"choice" | "admin-picker" | "admin-password" | "admin-setup">("choice");
  const [identities, setIdentities] = useState<Identity[]>([]);
  const [selected, setSelected] = useState<Identity | null>(null);
  const [password, setPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/login/identities", { cache: "no-store" })
      .then((response) => response.json())
      .then((data: { success?: boolean; identities?: Identity[] }) => {
        setIdentities((data.identities ?? []).sort((a, b) => a.name.localeCompare(b.name)));
      })
      .catch((err) => {
        console.error("Failed to load managers:", err);
      });
  }, []);

  // Auto-tags this device for push notification routing right after a
  // successful login, using the identity that just authenticated — replaces
  // the old separate post-login "which manager are you" picker, since login
  // now already establishes exactly who this is. identifyManager never
  // throws (see OneSignalInit.tsx).
  async function completeLogin(sheetManagerId: string | undefined) {
    setAdminLocalStorageFlags();
    if (sheetManagerId) {
      await identifyManager(sheetManagerId);
    }
    router.push(nextPath);
    router.refresh();
  }

  function handlePickIdentity(identity: Identity) {
    setSelected(identity);
    setPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setError("");
    setMode(identity.needsSetup ? "admin-setup" : "admin-password");
  }

  async function handlePasswordSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) return;

    try {
      setLoading(true);
      setError("");

      const response = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sheetManagerId: selected.sheetManagerId, password: password.trim() }),
      });

      const data = (await response.json()) as { success?: boolean; needsSetup?: boolean; error?: string };

      if (data.needsSetup) {
        setMode("admin-setup");
        return;
      }
      if (!response.ok || !data.success) {
        throw new Error(data.error || "Login failed.");
      }

      await completeLogin(selected.sheetManagerId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed.");
    } finally {
      setLoading(false);
    }
  }

  async function handleSetupSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) return;

    if (newPassword.trim().length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (newPassword.trim() !== confirmPassword.trim()) {
      setError("Passwords don't match.");
      return;
    }

    try {
      setLoading(true);
      setError("");

      const response = await fetch("/api/login/setup-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sheetManagerId: selected.sheetManagerId,
          role: "manager",
          newPassword: newPassword.trim(),
        }),
      });

      const data = (await response.json()) as { success?: boolean; error?: string };
      if (!response.ok || !data.success) {
        throw new Error(data.error || "Could not set up password.");
      }

      await completeLogin(selected.sheetManagerId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not set up password.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 px-4 py-8 text-slate-900">
      <div className="w-full max-w-3xl rounded-3xl bg-white p-6 shadow-sm md:p-8">
        <div className="mb-6 text-center">
          <p className="text-sm font-bold uppercase tracking-widest text-blue-700">
            Cleaning World
          </p>

          <h1 className="mt-2 text-3xl font-bold">
            Operations & Quality App
          </h1>

          <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-slate-600">
            Choose the correct login below. Admins log in with their own name
            and password. Subcontractors and customers use their respective
            portals.
          </p>
        </div>

        {mode === "choice" ? (
          <div className="grid gap-4 md:grid-cols-2">
            <button
              type="button"
              onClick={() => {
                setMode("admin-picker");
                setError("");
              }}
              className="rounded-2xl border border-blue-200 bg-blue-50 p-6 text-left shadow-sm transition hover:border-blue-500 hover:bg-blue-100"
            >
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-700 text-xl font-black text-white">
                A
              </div>

              <h2 className="text-xl font-bold text-slate-950">
                Admin Login
              </h2>

              <p className="mt-2 text-sm leading-6 text-slate-600">
                For Cleaning World office/admin access, dashboard, accounts,
                complaints, visits, reports, supply orders, and management tools.
              </p>

              <div className="mt-5 rounded-xl bg-blue-700 px-4 py-3 text-center text-sm font-bold text-white">
                Continue as Admin
              </div>
            </button>

            <Link
              href="/subcontractor-portal"
              className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6 text-left shadow-sm transition hover:border-emerald-500 hover:bg-emerald-100"
            >
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-700 text-xl font-black text-white">
                S
              </div>

              <h2 className="text-xl font-bold text-slate-950">
                Subcontractor Login
              </h2>

              <p className="mt-2 text-sm leading-6 text-slate-600">
                For subcontractors to view assigned accounts, submit supply
                orders, and manage their Cleaning World portal access.
              </p>

              <div className="mt-5 rounded-xl bg-emerald-700 px-4 py-3 text-center text-sm font-bold text-white">
                Continue as Subcontractor
              </div>
            </Link>

            <Link
              href="/customer-portal/login"
              className="rounded-2xl border border-purple-200 bg-purple-50 p-6 text-left shadow-sm transition hover:border-purple-500 hover:bg-purple-100"
            >
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-purple-700 text-xl font-black text-white">
                C
              </div>

              <h2 className="text-xl font-bold text-slate-950">
                Customer Portal
              </h2>

              <p className="mt-2 text-sm leading-6 text-slate-600">
                For Cleaning World customers to view service details, request
                specialty services, report complaints, or request changes.
              </p>

              <div className="mt-5 rounded-xl bg-purple-700 px-4 py-3 text-center text-sm font-bold text-white">
                Enter Customer Portal
              </div>
            </Link>
          </div>
        ) : mode === "admin-picker" ? (
          <div className="mx-auto w-full max-w-md">
            <div className="mb-5 rounded-2xl border border-blue-100 bg-blue-50 p-5 text-center">
              <h2 className="text-2xl font-bold text-slate-950">Admin Login</h2>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                Select your name to log in.
              </p>
            </div>

            <div className="space-y-2">
              {identities.length === 0 ? (
                <p className="text-center text-sm text-slate-500">Loading managers...</p>
              ) : (
                identities.map((identity) => (
                  <button
                    key={identity.sheetManagerId}
                    type="button"
                    onClick={() => handlePickIdentity(identity)}
                    className="flex min-h-[48px] w-full items-center justify-between rounded-xl border border-slate-300 bg-white px-4 py-3 text-left text-sm font-semibold text-slate-800 hover:border-blue-500 hover:bg-blue-50"
                  >
                    {identity.name}
                    {identity.needsSetup ? (
                      <span className="text-xs font-bold uppercase tracking-wide text-blue-600">
                        Set up password
                      </span>
                    ) : null}
                  </button>
                ))
              )}
            </div>

            <button
              type="button"
              onClick={() => setMode("choice")}
              className="mt-4 min-h-[48px] w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-bold text-slate-800 hover:bg-slate-50"
            >
              Back to Login Options
            </button>
          </div>
        ) : mode === "admin-password" && selected ? (
          <div className="mx-auto w-full max-w-md">
            <div className="mb-5 rounded-2xl border border-blue-100 bg-blue-50 p-5 text-center">
              <h2 className="text-2xl font-bold text-slate-950">Hi, {selected.name}</h2>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                Enter your password to access the Cleaning World admin dashboard.
              </p>
            </div>

            <form onSubmit={handlePasswordSubmit} className="space-y-4">
              <div>
                <label htmlFor="password" className="mb-2 block text-sm font-semibold text-slate-700">
                  Password
                </label>

                <div className="relative">
                  <input
                    id="password"
                    name="password"
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    autoComplete="current-password"
                    required
                    className="min-h-[48px] w-full rounded-xl border border-slate-300 px-4 py-3 pr-12 text-base outline-none focus:border-blue-600"
                    placeholder="Enter your password"
                  />

                  <button
                    type="button"
                    onClick={() => setShowPassword((current) => !current)}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    aria-pressed={showPassword}
                    className="absolute inset-y-0 right-0 flex items-center px-3 text-slate-500 hover:text-slate-700"
                  >
                    {showPassword ? <EyeOffIcon /> : <EyeIcon />}
                  </button>
                </div>
              </div>

              {error ? (
                <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-800">
                  {error}
                </div>
              ) : null}

              <button
                type="submit"
                disabled={loading}
                className="min-h-[48px] w-full rounded-xl bg-blue-700 px-4 py-3 text-sm font-bold text-white hover:bg-blue-800 disabled:opacity-60"
              >
                {loading ? "Logging in..." : "Login to Admin Dashboard"}
              </button>

              <button
                type="button"
                onClick={() => setMode("admin-picker")}
                className="min-h-[48px] w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-bold text-slate-800 hover:bg-slate-50"
              >
                Not you? Choose a different name
              </button>
            </form>
          </div>
        ) : mode === "admin-setup" && selected ? (
          <div className="mx-auto w-full max-w-md">
            <div className="mb-5 rounded-2xl border border-blue-100 bg-blue-50 p-5 text-center">
              <h2 className="text-2xl font-bold text-slate-950">Hi, {selected.name}</h2>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                First time logging in — create your password.
              </p>
            </div>

            <form onSubmit={handleSetupSubmit} className="space-y-4">
              <div>
                <label htmlFor="new-password" className="mb-2 block text-sm font-semibold text-slate-700">
                  New password
                </label>
                <input
                  id="new-password"
                  type="password"
                  value={newPassword}
                  onChange={(event) => setNewPassword(event.target.value)}
                  autoComplete="new-password"
                  required
                  minLength={8}
                  className="min-h-[48px] w-full rounded-xl border border-slate-300 px-4 py-3 text-base outline-none focus:border-blue-600"
                  placeholder="At least 8 characters"
                />
              </div>

              <div>
                <label htmlFor="confirm-password" className="mb-2 block text-sm font-semibold text-slate-700">
                  Confirm password
                </label>
                <input
                  id="confirm-password"
                  type="password"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  autoComplete="new-password"
                  required
                  minLength={8}
                  className="min-h-[48px] w-full rounded-xl border border-slate-300 px-4 py-3 text-base outline-none focus:border-blue-600"
                  placeholder="Re-enter password"
                />
              </div>

              {error ? (
                <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-800">
                  {error}
                </div>
              ) : null}

              <button
                type="submit"
                disabled={loading}
                className="min-h-[48px] w-full rounded-xl bg-blue-700 px-4 py-3 text-sm font-bold text-white hover:bg-blue-800 disabled:opacity-60"
              >
                {loading ? "Setting up..." : "Create Password & Log In"}
              </button>

              <button
                type="button"
                onClick={() => setMode("admin-picker")}
                className="min-h-[48px] w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-bold text-slate-800 hover:bg-slate-50"
              >
                Not you? Choose a different name
              </button>
            </form>
          </div>
        ) : null}
      </div>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-screen items-center justify-center bg-slate-100 px-4 text-slate-700">
          Loading login...
        </main>
      }
    >
      <LoginForm />
    </Suspense>
  );
}

function EyeIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-5 w-5"
      aria-hidden="true"
    >
      <path d="M1.5 12s4-7.5 10.5-7.5S22.5 12 22.5 12s-4 7.5-10.5 7.5S1.5 12 1.5 12Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-5 w-5"
      aria-hidden="true"
    >
      <path d="M3 3l18 18" />
      <path d="M10.58 10.58a3 3 0 0 0 4.24 4.24" />
      <path d="M9.88 4.68A10.9 10.9 0 0 1 12 4.5c6.5 0 10.5 7.5 10.5 7.5a17.3 17.3 0 0 1-3.4 4.42M6.6 6.6C3.9 8.3 1.5 12 1.5 12s4 7.5 10.5 7.5a10.9 10.9 0 0 0 4.02-.76" />
    </svg>
  );
}
