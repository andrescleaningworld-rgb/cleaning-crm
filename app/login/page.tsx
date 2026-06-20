"use client";

import Link from "next/link";
import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const nextPath = searchParams.get("next") || "/";
  const [mode, setMode] = useState<"choice" | "admin">("choice");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

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
            Subcontractors use the subcontractor portal.
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
          </div>
        ) : (
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
              <div>
                <label
                  htmlFor="password"
                  className="mb-2 block text-sm font-semibold text-slate-700"
                >
                  Password
                </label>

                <input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  autoComplete="current-password"
                  required
                  className="min-h-[48px] w-full rounded-xl border border-slate-300 px-4 py-3 text-base outline-none focus:border-blue-600"
                  placeholder="Enter admin password"
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