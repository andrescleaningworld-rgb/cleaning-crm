"use client";

import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { identifyManager } from "@/app/components/OneSignalInit";

type Identity = {
  staffId: string;
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
  async function completeLogin(staffId: string | undefined) {
    setAdminLocalStorageFlags();
    if (staffId) {
      await identifyManager(staffId);
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
        body: JSON.stringify({ staffId: selected.staffId, password: password.trim() }),
      });

      const data = (await response.json()) as { success?: boolean; needsSetup?: boolean; error?: string };

      if (data.needsSetup) {
        setMode("admin-setup");
        return;
      }
      if (!response.ok || !data.success) {
        throw new Error(data.error || "Login failed.");
      }

      await completeLogin(selected.staffId);
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
          staffId: selected.staffId,
          newPassword: newPassword.trim(),
        }),
      });

      const data = (await response.json()) as { success?: boolean; error?: string };
      if (!response.ok || !data.success) {
        throw new Error(data.error || "Could not set up password.");
      }

      await completeLogin(selected.staffId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not set up password.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="ui-screen">
      <div className="ui-card w-full">
        <div className="mb-6 text-center">
          <p className="ui-strong">
            Cleaning World
          </p>

          <h1 className="ui-screen-title">
            Operations & Quality App
          </h1>

          <p className="ui-muted">
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
              className="ui-card ui-stack"
            >
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-700 text-xl font-black text-white">
                A
              </div>

              <h2 className="ui-card-title">
                Admin Login
              </h2>

              <p className="ui-muted">
                For Cleaning World office/admin access, dashboard, accounts,
                complaints, visits, reports, supply orders, and management tools.
              </p>

              <div className="mt-5 rounded-xl bg-blue-700 px-4 py-3 text-center font-bold text-white">
                Continue as Admin
              </div>
            </button>

            <Link
              href="/subcontractor-portal"
              className="ui-card ui-stack"
            >
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-700 text-xl font-black text-white">
                S
              </div>

              <h2 className="ui-card-title">
                Subcontractor Login
              </h2>

              <p className="ui-muted">
                For subcontractors to view assigned accounts, submit supply
                orders, and manage their Cleaning World portal access.
              </p>

              <div className="mt-5 rounded-xl bg-emerald-700 px-4 py-3 text-center font-bold text-white">
                Continue as Subcontractor
              </div>
            </Link>

            <Link
              href="/customer-portal/login"
              className="ui-card ui-stack"
            >
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-purple-700 text-xl font-black text-white">
                C
              </div>

              <h2 className="ui-card-title">
                Customer Portal
              </h2>

              <p className="ui-muted">
                For Cleaning World customers to view service details, request
                specialty services, report complaints, or request changes.
              </p>

              <div className="mt-5 rounded-xl bg-purple-700 px-4 py-3 text-center font-bold text-white">
                Enter Customer Portal
              </div>
            </Link>
          </div>
        ) : mode === "admin-picker" ? (
          <div className="mx-auto w-full max-w-md">
            <div className="ui-card">
              <h2 className="ui-card-title">Admin Login</h2>
              <p className="ui-muted">
                Select your name to log in.
              </p>
            </div>

            <div className="space-y-2">
              {identities.length === 0 ? (
                <p className="ui-muted">Loading managers...</p>
              ) : (
                identities.map((identity) => (
                  <button
                    key={identity.staffId}
                    type="button"
                    onClick={() => handlePickIdentity(identity)}
                    className="ui-btn ui-btn-second w-full"
                  >
                    {identity.name}
                    {identity.needsSetup ? (
                      <span className="ui-strong">
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
              className="ui-btn ui-btn-second w-full"
            >
              Back to Login Options
            </button>
          </div>
        ) : mode === "admin-password" && selected ? (
          <div className="mx-auto w-full max-w-md">
            <div className="ui-card">
              <h2 className="ui-card-title">Hi, {selected.name}</h2>
              <p className="ui-muted">
                Enter your password to access the Cleaning World admin dashboard.
              </p>
            </div>

            <form onSubmit={handlePasswordSubmit} className="space-y-4">
              <div>
                <label htmlFor="password" className="ui-label">
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
                    className="ui-input w-full"
                    placeholder="Enter your password"
                  />

                  <button
                    type="button"
                    onClick={() => setShowPassword((current) => !current)}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    aria-pressed={showPassword}
                    className="ui-btn ui-btn-quiet"
                  >
                    {showPassword ? <EyeOffIcon /> : <EyeIcon />}
                  </button>
                </div>
              </div>

              {error ? (
                <div className="ui-field-error">
                  {error}
                </div>
              ) : null}

              <button
                type="submit"
                disabled={loading}
                className="ui-btn ui-btn-second w-full"
              >
                {loading ? "Logging in..." : "Login to Admin Dashboard"}
              </button>

              <button
                type="button"
                onClick={() => setMode("admin-picker")}
                className="ui-btn ui-btn-second w-full"
              >
                Not you? Choose a different name
              </button>
            </form>
          </div>
        ) : mode === "admin-setup" && selected ? (
          <div className="mx-auto w-full max-w-md">
            <div className="ui-card">
              <h2 className="ui-card-title">Hi, {selected.name}</h2>
              <p className="ui-muted">
                First time logging in — create your password.
              </p>
            </div>

            <form onSubmit={handleSetupSubmit} className="space-y-4">
              <div>
                <label htmlFor="new-password" className="ui-label">
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
                  className="ui-input w-full"
                  placeholder="At least 8 characters"
                />
              </div>

              <div>
                <label htmlFor="confirm-password" className="ui-label">
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
                  className="ui-input w-full"
                  placeholder="Re-enter password"
                />
              </div>

              {error ? (
                <div className="ui-field-error">
                  {error}
                </div>
              ) : null}

              <button
                type="submit"
                disabled={loading}
                className="ui-btn ui-btn-second w-full"
              >
                {loading ? "Setting up..." : "Create Password & Log In"}
              </button>

              <button
                type="button"
                onClick={() => setMode("admin-picker")}
                className="ui-btn ui-btn-second w-full"
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
        <main className="ui-screen">
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
