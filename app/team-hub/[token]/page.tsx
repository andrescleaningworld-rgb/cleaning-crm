"use client";

// Real public /team-hub/[token] rendering path (Phase 1). Covers: the PWA
// install gate, token validity, the worker PIN login screen, and a
// post-login "Today" landing screen listing this crew's enabled modules.
// The modules themselves (checklist tap-to-complete, rounds, etc.) are
// Phase 2+ scope — this page only proves install + login + session
// persistence end-to-end, matching the Phase 1 line in
// docs/team-hub-spec.md §9 ("the real public /team-hub/[token] rendering
// path", not the module content behind it).
import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";

type Worker = { id: number; firstName: string };

type LinkGetResponse = {
  success?: boolean;
  active?: boolean;
  siteLabel?: string;
  crewName?: string;
  workers?: Worker[];
};

type SessionResponse = {
  success?: boolean;
  authenticated?: boolean;
  worker?: Worker;
  crewName?: string;
  siteLabel?: string;
  modules?: string[];
  error?: string;
  lockedUntil?: string;
};

const MODULE_LABELS: Record<string, string> = {
  checklist: "Checklist",
  rounds: "Rounds",
  handoff: "Handoff",
  requests: "Requests",
  supplies: "Supplies",
  issues: "Issues",
};

const MAX_PIN_LENGTH = 6;

// Both branches iOS Safari and Chrome-on-Android expose for "are we running
// as the installed PWA, not a regular browser tab" — neither alone is
// reliable across both platforms, so this checks both.
function isRunningStandalone(): boolean {
  if (typeof window === "undefined") return false;
  const mediaStandalone = window.matchMedia?.("(display-mode: standalone)").matches ?? false;
  const iosStandalone = (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
  return mediaStandalone || iosStandalone;
}

function detectInstallPlatform(): "ios" | "android" | "other" {
  if (typeof navigator === "undefined") return "other";
  const ua = navigator.userAgent || "";
  if (/iphone|ipad|ipod/i.test(ua)) return "ios";
  if (/android/i.test(ua)) return "android";
  return "other";
}

// Injects (or updates) the <link rel="manifest"> for this specific token —
// can't be a static Metadata field in app/team-hub/layout.tsx because the
// manifest's start_url has to be THIS worker's own crew link (see
// app/team-hub/manifest.webmanifest/route.ts's file comment).
function useTeamHubManifestLink(token: string) {
  useEffect(() => {
    if (!token) return;
    const href = `/team-hub/manifest.webmanifest?token=${encodeURIComponent(token)}`;
    let link = document.querySelector<HTMLLinkElement>('link[rel="manifest"][data-team-hub]');
    if (!link) {
      link = document.createElement("link");
      link.rel = "manifest";
      link.setAttribute("data-team-hub", "true");
      document.head.appendChild(link);
    }
    link.href = href;
  }, [token]);
}

export default function TeamHubPage() {
  const params = useParams();
  const token = Array.isArray(params.token) ? params.token[0] : (params.token ?? "");

  useTeamHubManifestLink(token);

  // undefined = not yet determined (avoids a standalone/non-standalone
  // flash before the client-only check runs); this gate applies BEFORE the
  // login form is ever shown, per the approved spec — a crew logs in only
  // from the installed app, never a plain browser tab.
  const [standalone, setStandalone] = useState<boolean | undefined>(undefined);

  useEffect(() => {
    setStandalone(isRunningStandalone());
  }, []);

  const [loading, setLoading] = useState(true);
  const [active, setActive] = useState<boolean | null>(null);
  const [siteLabel, setSiteLabel] = useState("");
  const [crewName, setCrewName] = useState("");
  const [workers, setWorkers] = useState<Worker[]>([]);

  const [session, setSession] = useState<SessionResponse | null>(null);
  const [switching, setSwitching] = useState(false);

  const load = useCallback(async () => {
    try {
      const linkRes = await fetch(`/api/team-hub/${encodeURIComponent(token)}`, { cache: "no-store" });
      const linkData: LinkGetResponse = await linkRes.json();
      if (!linkData.active) {
        setActive(false);
        return;
      }
      setActive(true);
      setSiteLabel(linkData.siteLabel ?? "");
      setCrewName(linkData.crewName ?? "");
      setWorkers(linkData.workers ?? []);

      // Session is only meaningful once installed — see the standalone gate
      // below — but fetching it here (once we know we ARE standalone,
      // below) rather than skipping it entirely keeps this one load()
      // function simple for both first load and post-login refresh.
      const sessionRes = await fetch(`/api/team-hub/${encodeURIComponent(token)}/session`, { cache: "no-store" });
      const sessionData: SessionResponse = await sessionRes.json();
      setSession(sessionData.authenticated ? sessionData : null);
    } catch {
      setActive(false);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    // Wait for the standalone check to resolve before loading — an install-
    // gated view has no use for link/session data on first paint, and this
    // avoids an extra fetch for a tab that's about to see install
    // instructions only.
    if (token && standalone) load();
  }, [token, standalone, load]);

  async function handleLogout() {
    await fetch(`/api/team-hub/${encodeURIComponent(token)}/session`, { method: "DELETE" });
    setSession(null);
  }

  if (standalone === undefined) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-gray-50 p-6">
        <p className="text-base text-slate-500">Loading…</p>
      </main>
    );
  }

  if (!standalone) {
    return <InstallGate />;
  }

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-gray-50 p-6">
        <p className="text-base text-slate-500">Loading…</p>
      </main>
    );
  }

  if (!active) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-gray-50 p-6">
        <div className="w-full max-w-sm rounded-2xl bg-white p-6 text-center shadow-sm">
          <h1 className="text-xl font-bold text-slate-900">Link not active</h1>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            This link is no longer active. Please contact your office for a new one.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gray-50 pb-10">
      <div className="mx-auto max-w-lg">
        <header className="bg-blue-700 px-4 py-5 text-white">
          <h1 className="text-lg font-bold">{siteLabel}</h1>
          <p className="text-sm text-blue-100">{crewName}</p>
        </header>

        <div className="px-3">
          {session && !switching ? (
            <TodayScreen session={session} onLogout={handleLogout} onSwitchWorker={() => setSwitching(true)} />
          ) : (
            <LoginScreen
              token={token}
              workers={workers}
              onLoggedIn={(s) => {
                setSession(s);
                setSwitching(false);
              }}
              onCancel={switching ? () => setSwitching(false) : undefined}
            />
          )}
        </div>
      </div>
    </main>
  );
}

function InstallGate() {
  const [platform] = useState(detectInstallPlatform);

  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-50 p-6">
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-sm">
        <h1 className="text-center text-xl font-bold text-slate-900">Add Team Hub to your Home Screen</h1>
        <p className="mt-2 text-center text-sm leading-6 text-slate-600">
          Team Hub only works after it&apos;s added to your phone. Follow the steps below, then open it from your
          Home Screen.
        </p>

        {platform === "ios" && (
          <ol className="mt-5 list-decimal space-y-3 pl-5 text-sm text-slate-700">
            <li>
              Tap the <strong>Share</strong> icon (square with an arrow pointing up) in Safari&apos;s toolbar.
            </li>
            <li>
              Scroll down and tap <strong>Add to Home Screen</strong>.
            </li>
            <li>
              Tap <strong>Add</strong> in the top right.
            </li>
            <li>Open Team Hub from the new icon on your Home Screen.</li>
          </ol>
        )}

        {platform === "android" && (
          <ol className="mt-5 list-decimal space-y-3 pl-5 text-sm text-slate-700">
            <li>
              Tap the <strong>⋮</strong> menu in the top right of Chrome.
            </li>
            <li>
              Tap <strong>Add to Home screen</strong> (or <strong>Install app</strong>).
            </li>
            <li>
              Tap <strong>Add</strong> / <strong>Install</strong>.
            </li>
            <li>Open Team Hub from the new icon on your Home Screen.</li>
          </ol>
        )}

        {platform === "other" && (
          <p className="mt-5 text-sm leading-6 text-slate-700">
            Open this link on your phone (in Safari on iPhone, or Chrome on Android) to add Team Hub to your Home
            Screen.
          </p>
        )}
      </div>
    </main>
  );
}

function TodayScreen({
  session,
  onLogout,
  onSwitchWorker,
}: {
  session: SessionResponse;
  onLogout: () => void;
  onSwitchWorker: () => void;
}) {
  const modules = session.modules ?? [];
  return (
    <div className="mt-3 space-y-3">
      <div className="rounded-2xl bg-white p-4 shadow-sm">
        <p className="text-sm text-slate-500">Signed in as</p>
        <p className="text-lg font-bold text-slate-900">{session.worker?.firstName}</p>
      </div>

      <div className="rounded-2xl bg-white p-4 shadow-sm">
        <h2 className="text-sm font-bold text-slate-900">Today</h2>
        {modules.length === 0 ? (
          <p className="mt-2 text-sm text-slate-500">No modules are turned on for this crew yet.</p>
        ) : (
          <ul className="mt-3 divide-y divide-gray-100">
            {modules.map((moduleName) => (
              <li key={moduleName} className="flex items-center justify-between py-3">
                <span className="text-sm font-semibold text-slate-800">{MODULE_LABELS[moduleName] ?? moduleName}</span>
                <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-500">Coming soon</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <button
        type="button"
        onClick={onSwitchWorker}
        className="min-h-[52px] w-full rounded-xl bg-blue-700 text-sm font-bold text-white"
      >
        Switch worker
      </button>
      <button
        type="button"
        onClick={onLogout}
        className="min-h-[52px] w-full rounded-xl border border-slate-300 bg-white text-sm font-bold text-slate-700"
      >
        Sign out
      </button>
    </div>
  );
}

function LoginScreen({
  token,
  workers,
  onLoggedIn,
  onCancel,
}: {
  token: string;
  workers: Worker[];
  onLoggedIn: (session: SessionResponse) => void;
  onCancel?: () => void;
}) {
  const [selectedWorker, setSelectedWorker] = useState<Worker | null>(null);
  const [pin, setPin] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  function selectWorker(worker: Worker) {
    setSelectedWorker(worker);
    setPin("");
    setError("");
  }

  const submitPin = useCallback(
    async (enteredPin: string) => {
      if (!selectedWorker) return;
      setSubmitting(true);
      setError("");
      try {
        const res = await fetch(`/api/team-hub/${encodeURIComponent(token)}/session`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ workerId: selectedWorker.id, pin: enteredPin }),
        });
        const data: SessionResponse = await res.json();
        if (!res.ok || !data.success) {
          setError(data.error || "Something went wrong. Please try again.");
          setPin("");
          return;
        }
        onLoggedIn({ ...data, authenticated: true });
      } catch {
        setError("Something went wrong. Please try again.");
        setPin("");
      } finally {
        setSubmitting(false);
      }
    },
    [selectedWorker, token, onLoggedIn]
  );

  function tapDigit(digit: string) {
    if (submitting || pin.length >= MAX_PIN_LENGTH) return;
    const next = pin + digit;
    setPin(next);
    // 4-digit PINs are the common case — auto-submit there; a 5-6 digit PIN
    // still needs the Enter key since we can't tell it's "done" early.
    if (next.length === 4) {
      submitPin(next);
    }
  }

  function backspace() {
    if (submitting) return;
    setPin((current) => current.slice(0, -1));
    setError("");
  }

  if (!selectedWorker) {
    return (
      <div className="mt-3 rounded-2xl bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold text-slate-900">Who&apos;s signing in?</h2>
          {onCancel && (
            <button type="button" onClick={onCancel} className="text-xs font-semibold text-blue-700">
              Cancel
            </button>
          )}
        </div>
        {workers.length === 0 ? (
          <p className="mt-3 text-sm text-slate-500">No workers set up for this crew yet. Contact your office.</p>
        ) : (
          <div className="mt-3 grid grid-cols-2 gap-2">
            {workers.map((worker) => (
              <button
                key={worker.id}
                type="button"
                onClick={() => selectWorker(worker)}
                className="min-h-[56px] rounded-xl bg-gray-100 text-base font-semibold text-slate-800 active:bg-gray-200"
              >
                {worker.firstName}
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="mt-3 rounded-2xl bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold text-slate-900">Enter your PIN, {selectedWorker.firstName}</h2>
        <button type="button" onClick={() => setSelectedWorker(null)} className="text-xs font-semibold text-blue-700">
          Not you?
        </button>
      </div>

      {error && (
        <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</div>
      )}

      <div className="mt-4 flex justify-center gap-3">
        {Array.from({ length: Math.max(4, pin.length) }).map((_, i) => (
          <span
            key={i}
            className={`h-4 w-4 rounded-full ${i < pin.length ? "bg-blue-700" : "bg-gray-200"}`}
          />
        ))}
      </div>

      <div className="mt-5 grid grid-cols-3 gap-2">
        {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((digit) => (
          <button
            key={digit}
            type="button"
            onClick={() => tapDigit(digit)}
            disabled={submitting}
            className="min-h-[56px] rounded-xl bg-gray-100 text-xl font-bold text-slate-800 active:bg-gray-200 disabled:opacity-60"
          >
            {digit}
          </button>
        ))}
        <button
          type="button"
          onClick={() => (pin.length >= 4 ? submitPin(pin) : undefined)}
          disabled={submitting || pin.length < 4}
          className="min-h-[56px] rounded-xl bg-blue-700 text-sm font-bold text-white disabled:opacity-40"
        >
          Enter
        </button>
        <button
          type="button"
          onClick={() => tapDigit("0")}
          disabled={submitting}
          className="min-h-[56px] rounded-xl bg-gray-100 text-xl font-bold text-slate-800 active:bg-gray-200 disabled:opacity-60"
        >
          0
        </button>
        <button
          type="button"
          onClick={backspace}
          disabled={submitting}
          className="min-h-[56px] rounded-xl bg-gray-100 text-sm font-bold text-slate-800 active:bg-gray-200 disabled:opacity-60"
        >
          ⌫
        </button>
      </div>
    </div>
  );
}
