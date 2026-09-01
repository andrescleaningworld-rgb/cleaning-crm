"use client";

import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { identifyManager, getStoredManagerId } from "@/app/components/OneSignalInit";

type Manager = {
  managerId?: string;
  name?: string;
  status?: string;
};

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const nextPath = searchParams.get("next") || "/";
  const [mode, setMode] = useState<"choice" | "admin" | "manager-pick">("choice");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Managers roster, loaded once on mount so it's ready by the time an admin
  // login succeeds — feeds the one-time "Which manager are you?" picker below
  // that replaces the old To-Do page "Notify me" dropdown. Mirrors app/to-do/
  // page.tsx's loadManagers(): missing/blank status treated as Active.
  const [managers, setManagers] = useState<string[]>([]);
  const [managerIdByName, setManagerIdByName] = useState<Record<string, string>>({});
  const [selectedManagerName, setSelectedManagerName] = useState("");
  const [savingManager, setSavingManager] = useState(false);

  useEffect(() => {
    fetch("/api/admin/managers", { cache: "no-store" })
      .then((response) => response.json())
      .then((data: Manager[] | { managers?: Manager[]; data?: Manager[] }) => {
        const rows: Manager[] = Array.isArray(data) ? data : data.managers || data.data || [];
        const activeRows = rows.filter((row) => !row.status || row.status === "Active");

        const activeNames = Array.from(
          new Set(activeRows.map((row) => (row.name || "").trim()).filter(Boolean))
        ).sort();

        const idByName: Record<string, string> = {};
        for (const row of activeRows) {
          const name = (row.name || "").trim();
          const id = (row.managerId || "").trim();
          if (name && id) idByName[name] = id;
        }

        setManagers(activeNames);
        setManagerIdByName(idByName);
      })
      .catch((err) => {
        console.error("Failed to load managers:", err);
      });
  }, []);

  // Persists the device's manager identity independently of the admin
  // session — identifyManager writes to localStorage (see OneSignalInit.tsx),
  // which /api/logout never touches, so this survives normal session
  // expiry/re-login instead of recreating the old "forgot to set it" problem.
  async function handleContinueAsManager() {
    const managerId = managerIdByName[selectedManagerName];
    if (managerId) {
      setSavingManager(true);
      try {
        await identifyManager(managerId);
      } finally {
        setSavingManager(false);
      }
    }
    router.push(nextPath);
    router.refresh();
  }

  function handleSkipManagerPick() {
    router.push(nextPath);
    router.refresh();
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    try {
      setLoading(true);
      setError("");

      const response = await fetch("/api/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ password }),
      });

      const data = (await response.json()) as {
        success?: boolean;
        message?: string;
      };

      if (!response.ok || !data.success) {
        throw new Error(data.message || "Login failed.");
      }

      // Role is primarily read via "cwRole" (used by CWHeader, help, sub portal).
      // Extra legacy keys kept for compatibility with any older code/tabs.
      localStorage.setItem("cwRole", "admin");
      localStorage.setItem("cwUserRole", "admin");
      localStorage.setItem("userRole", "admin");
      localStorage.setItem("cwAdminLoggedIn", "true");
      localStorage.setItem("isAdminLoggedIn", "true");

      // Ask which manager this device belongs to only the first time — once
      // set, getStoredManagerId() keeps returning it on every future login
      // (see the comment on handleContinueAsManager) so this step is skipped
      // for a device that's already identified.
      if (!getStoredManagerId()) {
        setMode("manager-pick");
        return;
      }

      router.push(nextPath);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed.");
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
            Choose the correct login below. Admins use the internal password.
            Subcontractors and customers use their respective portals.
          </p>
        </div>

        {mode === "choice" ? (
          <div className="grid gap-4 md:grid-cols-2">
            <button
              type="button"
              onClick={() => {
                setMode("admin");
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
        ) : mode === "admin" ? (
          <div className="mx-auto w-full max-w-md">
            <div className="mb-5 rounded-2xl border border-blue-100 bg-blue-50 p-5 text-center">
              <h2 className="text-2xl font-bold text-slate-950">
                Admin Login
              </h2>

              <p className="mt-2 text-sm leading-6 text-slate-600">
                Enter the internal password to access the Cleaning World admin
                dashboard.
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <input
                type="text"
                name="username"
                autoComplete="username"
                value="Cleaning World Admin"
                readOnly
                className="hidden"
              />

              <div>
                <label
                  htmlFor="password"
                  className="mb-2 block text-sm font-semibold text-slate-700"
                >
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
                    placeholder="Enter admin password"
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
                onClick={() => {
                  setMode("choice");
                  setPassword("");
                  setError("");
                }}
                className="min-h-[48px] w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-bold text-slate-800 hover:bg-slate-50"
              >
                Back to Login Options
              </button>
            </form>

            <p className="mt-5 text-center text-xs leading-5 text-slate-500">
              Subcontractors should use the subcontractor portal instead of the
              admin password login.
            </p>
          </div>
        ) : (
          <div className="mx-auto w-full max-w-md">
            <div className="mb-5 rounded-2xl border border-blue-100 bg-blue-50 p-5 text-center">
              <h2 className="text-2xl font-bold text-slate-950">
                Which manager are you?
              </h2>

              <p className="mt-2 text-sm leading-6 text-slate-600">
                This device will automatically get push notifications for
                to-dos assigned to that manager. Asked once per device — not
                a per-visit login.
              </p>
            </div>

            <div className="space-y-4">
              <div>
                <label
                  htmlFor="manager-pick-select"
                  className="mb-2 block text-sm font-semibold text-slate-700"
                >
                  Manager
                </label>
                <select
                  id="manager-pick-select"
                  value={selectedManagerName}
                  onChange={(event) => setSelectedManagerName(event.target.value)}
                  className="min-h-[48px] w-full rounded-xl border border-slate-300 px-4 py-3 text-base outline-none focus:border-blue-600"
                >
                  <option value="">Select a manager...</option>
                  {managers.map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </select>
              </div>

              <button
                type="button"
                onClick={handleContinueAsManager}
                disabled={!selectedManagerName || savingManager}
                className="min-h-[48px] w-full rounded-xl bg-blue-700 px-4 py-3 text-sm font-bold text-white hover:bg-blue-800 disabled:opacity-60"
              >
                {savingManager ? "Saving..." : "Continue"}
              </button>

              <button
                type="button"
                onClick={handleSkipManagerPick}
                className="min-h-[48px] w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-bold text-slate-800 hover:bg-slate-50"
              >
                Skip for now (shared/kiosk device)
              </button>
            </div>

            <p className="mt-5 text-center text-xs leading-5 text-slate-500">
              You can set this later from the same login screen by logging out
              and back in on this device.
            </p>
          </div>
        )}
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