"use client";

// Owner login — deliberately not linked from anywhere in the UI (not the
// manager picker, not the choice screen). Reach it by URL only. A single
// password, no name picker, since there's one owner account.
import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

function setAdminLocalStorageFlags() {
  localStorage.setItem("cwRole", "admin");
  localStorage.setItem("cwUserRole", "admin");
  localStorage.setItem("userRole", "admin");
  localStorage.setItem("cwAdminLoggedIn", "true");
  localStorage.setItem("isAdminLoggedIn", "true");
}

function OwnerLoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextPath = searchParams.get("next") || "/";

  const [mode, setMode] = useState<"password" | "setup">("password");
  const [password, setPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handlePasswordSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      setLoading(true);
      setError("");

      const response = await fetch("/api/login/owner", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: password.trim() }),
      });
      const data = (await response.json()) as { success?: boolean; needsSetup?: boolean; error?: string };

      if (data.needsSetup) {
        setMode("setup");
        return;
      }
      if (!response.ok || !data.success) {
        throw new Error(data.error || "Login failed.");
      }

      setAdminLocalStorageFlags();
      router.push(nextPath);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed.");
    } finally {
      setLoading(false);
    }
  }

  async function handleSetupSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

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
        body: JSON.stringify({ role: "owner", newPassword: newPassword.trim() }),
      });
      const data = (await response.json()) as { success?: boolean; error?: string };
      if (!response.ok || !data.success) {
        throw new Error(data.error || "Could not set up password.");
      }

      setAdminLocalStorageFlags();
      router.push(nextPath);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not set up password.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 px-4 py-8 text-slate-900">
      <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-sm md:p-8">
        <div className="mb-6 text-center">
          <p className="text-sm font-bold uppercase tracking-widest text-blue-700">Cleaning World</p>
          <h1 className="mt-2 text-2xl font-bold">Owner Login</h1>
        </div>

        {mode === "password" ? (
          <form onSubmit={handlePasswordSubmit} className="space-y-4">
            <div>
              <label htmlFor="owner-password" className="mb-2 block text-sm font-semibold text-slate-700">
                Password
              </label>
              <input
                id="owner-password"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="current-password"
                required
                className="min-h-[48px] w-full rounded-xl border border-slate-300 px-4 py-3 text-base outline-none focus:border-blue-600"
                placeholder="Enter your password"
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
              {loading ? "Logging in..." : "Login"}
            </button>
          </form>
        ) : (
          <form onSubmit={handleSetupSubmit} className="space-y-4">
            <p className="text-sm leading-6 text-slate-600">First time logging in — create your password.</p>

            <div>
              <label htmlFor="owner-new-password" className="mb-2 block text-sm font-semibold text-slate-700">
                New password
              </label>
              <input
                id="owner-new-password"
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
              <label htmlFor="owner-confirm-password" className="mb-2 block text-sm font-semibold text-slate-700">
                Confirm password
              </label>
              <input
                id="owner-confirm-password"
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
          </form>
        )}
      </div>
    </main>
  );
}

export default function OwnerLoginPage() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-screen items-center justify-center bg-slate-100 px-4 text-slate-700">
          Loading...
        </main>
      }
    >
      <OwnerLoginForm />
    </Suspense>
  );
}
