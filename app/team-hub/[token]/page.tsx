"use client";

// Simplicity pass rewrite (docs/team-hub-spec.md "GLOBAL RULES"): removes
// the blocking install gate (now a small dismissible hint), redesigns the
// Today screen as big icon+label+status tiles, moves worker-switching to a
// small "Not you?" link, and wires EN/ES via useTeamHubLang. The 90-day
// "remembered" session is a lib/teamHubWorkerSession.ts config change, not
// something this file has to implement — GET .../session already runs on
// every load and just now stays valid for 90 days instead of 8 hours.
import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import ChecklistView from "./ChecklistView";
import RoundsView from "./RoundsView";
import SuppliesView from "./SuppliesView";
import IssueReportView from "./IssueReportView";
import LangToggle from "./LangToggle";
import PinKeypad from "@/app/components/PinKeypad";
import { useTeamHubLang, teamHubStrings, type TeamHubLang } from "../teamHubStrings";

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

const MAX_PIN_LENGTH = 6;

type OpenableModule = "checklist" | "rounds" | "issues" | "supplies";
const OPENABLE_MODULES = new Set<string>(["checklist", "rounds", "issues", "supplies"]);

const INSTALL_HINT_DISMISSED_KEY = "team-hub-install-hint-dismissed";

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
// still useful for the "Add to Home Screen" hint even though it's no
// longer required to use the app.
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
  const [lang, setLang] = useTeamHubLang();
  const s = teamHubStrings(lang);

  const [loading, setLoading] = useState(true);
  const [active, setActive] = useState<boolean | null>(null);
  const [siteLabel, setSiteLabel] = useState("");
  const [crewName, setCrewName] = useState("");
  const [workers, setWorkers] = useState<Worker[]>([]);

  const [session, setSession] = useState<SessionResponse | null>(null);
  const [switching, setSwitching] = useState(false);
  const [openModule, setOpenModule] = useState<OpenableModule | null>(null);

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
    if (token) load();
  }, [token, load]);

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-gray-50 p-6">
        <p className="text-lg text-slate-500">{s.common.loading}</p>
      </main>
    );
  }

  if (!active) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-gray-50 p-6">
        <div className="w-full max-w-sm rounded-2xl bg-white p-6 text-center shadow-sm">
          <h1 className="text-xl font-bold text-slate-900">Team Hub</h1>
          <p className="mt-2 text-lg leading-6 text-slate-600">{s.common.linkNotActive}</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gray-50 pb-10">
      <div className="mx-auto max-w-lg">
        <header className="flex items-center justify-between bg-blue-700 px-4 py-5 text-white">
          <div>
            <h1 className="text-lg font-bold">{siteLabel}</h1>
            <p className="text-sm text-blue-100">{crewName}</p>
          </div>
          <LangToggle lang={lang} onChange={setLang} />
        </header>

        <InstallHint lang={lang} />

        <div className="px-3">
          {session && !switching ? (
            openModule === "checklist" ? (
              <ChecklistView
                token={token}
                lang={lang}
                onBack={() => setOpenModule(null)}
                workerName={session.worker?.firstName}
                onReportProblem={() => setOpenModule("issues")}
              />
            ) : openModule === "rounds" ? (
              <RoundsView token={token} lang={lang} onBack={() => setOpenModule(null)} />
            ) : openModule === "issues" ? (
              <IssueReportView token={token} lang={lang} onBack={() => setOpenModule(null)} workerName={session.worker?.firstName} />
            ) : openModule === "supplies" ? (
              <SuppliesView token={token} lang={lang} onBack={() => setOpenModule(null)} workerName={session.worker?.firstName} />
            ) : (
              <TodayScreen
                token={token}
                lang={lang}
                session={session}
                onSwitchWorker={() => setSwitching(true)}
                onOpenModule={(moduleName) => setOpenModule(moduleName)}
              />
            )
          ) : (
            <LoginScreen
              token={token}
              lang={lang}
              workers={workers}
              onLoggedIn={(sessionData) => {
                setSession(sessionData);
                setSwitching(false);
                setOpenModule(null);
              }}
              onCancel={switching ? () => setSwitching(false) : undefined}
            />
          )}
        </div>
      </div>
    </main>
  );
}

// Non-blocking, dismiss-once hint — replaces the old blocking InstallGate.
// Never shown again on this device once dismissed (or once already
// running standalone).
function InstallHint({ lang }: { lang: TeamHubLang }) {
  const s = teamHubStrings(lang).install;
  const [dismissed, setDismissed] = useState(true);
  const [platform] = useState(detectInstallPlatform);

  useEffect(() => {
    // Deferred read, same reasoning as useTeamHubLang: standalone-mode
    // detection and localStorage are both browser-only.
    if (isRunningStandalone()) return;
    try {
      if (localStorage.getItem(INSTALL_HINT_DISMISSED_KEY) === "1") return;
    } catch {
      // if storage is blocked, just show the hint every time — never block
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDismissed(false);
  }, []);

  function dismiss() {
    setDismissed(true);
    try {
      localStorage.setItem(INSTALL_HINT_DISMISSED_KEY, "1");
    } catch {
      // best-effort only
    }
  }

  if (dismissed) return null;

  const steps = platform === "ios" ? s.iosSteps : platform === "android" ? s.androidSteps : s.otherSteps;

  return (
    <div className="flex items-center justify-between gap-3 bg-blue-50 px-4 py-2.5 text-sm text-blue-900">
      <span>
        📲 {s.hint} — {steps}
      </span>
      <button type="button" onClick={dismiss} className="shrink-0 font-bold text-blue-700">
        {s.gotIt}
      </button>
    </div>
  );
}

function TodayScreen({
  token,
  lang,
  session,
  onSwitchWorker,
  onOpenModule,
}: {
  token: string;
  lang: TeamHubLang;
  session: SessionResponse;
  onSwitchWorker: () => void;
  onOpenModule: (moduleName: OpenableModule) => void;
}) {
  const s = teamHubStrings(lang);
  // Memoized so the two effects below (keyed on `modules`) don't refire on
  // every render — session.modules ?? [] would otherwise be a new array
  // identity each time.
  const modules = useMemo(() => session.modules ?? [], [session.modules]);

  const [checklistStatus, setChecklistStatus] = useState<string | null>(null);
  const [roundsStatus, setRoundsStatus] = useState<string | null>(null);

  useEffect(() => {
    if (!modules.includes("checklist")) return;
    (async () => {
      try {
        const res = await fetch(`/api/team-hub/${encodeURIComponent(token)}/checklist`, { cache: "no-store" });
        const data = await res.json();
        if (!res.ok || !data.success) return;
        const checkable = (data.items ?? []).filter((i: { isNote: boolean }) => !i.isNote);
        if (checkable.length === 0) return;
        if (!data.run) {
          setChecklistStatus(s.today.checklistNotStarted);
          return;
        }
        const doneIds = new Set((data.runItems ?? []).map((ri: { crewItemId: number }) => ri.crewItemId));
        const done = checkable.filter((i: { crewItemId: number }) => doneIds.has(i.crewItemId)).length;
        setChecklistStatus(done >= checkable.length ? s.today.checklistAllDone : s.today.checklistDone(done, checkable.length));
      } catch {
        // Today tile just omits a status line if this fails — non-critical.
      }
    })();
  }, [token, modules, s]);

  useEffect(() => {
    if (!modules.includes("rounds")) return;
    (async () => {
      try {
        const res = await fetch(`/api/team-hub/${encodeURIComponent(token)}/rounds`, { cache: "no-store" });
        const data = await res.json();
        if (!res.ok || !data.success || !Array.isArray(data.items) || data.items.length === 0) return;
        type RoundItem = { name: string; intervalMinutes: number; lastCheck: { checkedAt: string } | null };
        let worst: RoundItem | null = null;
        let worstRatio = -Infinity;
        for (const item of data.items as RoundItem[]) {
          const ago = item.lastCheck ? Math.max(0, Math.round((Date.now() - new Date(item.lastCheck.checkedAt).getTime()) / 60000)) : null;
          const ratio = ago === null ? Infinity : ago / item.intervalMinutes;
          if (ratio > worstRatio) {
            worstRatio = ratio;
            worst = item;
          }
        }
        if (!worst) return;
        if (worstRatio >= 1) {
          setRoundsStatus(s.today.roundCheckNow(worst.name));
        } else if (worst.lastCheck) {
          const ago = Math.max(0, Math.round((Date.now() - new Date(worst.lastCheck.checkedAt).getTime()) / 60000));
          const agoText = ago < 60 ? s.rounds.minAgo(ago) : s.rounds.hoursAgo(Math.round(ago / 60));
          setRoundsStatus(s.today.roundAgo(worst.name, agoText));
        } else {
          setRoundsStatus(s.today.roundsAllChecked);
        }
      } catch {
        // non-critical
      }
    })();
  }, [token, modules, s]);

  const statusByModule: Partial<Record<string, string>> = {
    checklist: checklistStatus ?? "",
    rounds: roundsStatus ?? "",
  };

  const ICONS: Record<string, string> = {
    checklist: "📋",
    rounds: "🕒",
    handoff: "📝",
    requests: "✅",
    supplies: "📦",
    issues: "⚠️",
  };

  return (
    <div className="mt-3 space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-slate-500">{s.common.signedInAs}</p>
          <p className="text-xl font-bold text-slate-900">{session.worker?.firstName}</p>
        </div>
        <button type="button" onClick={onSwitchWorker} className="text-base font-semibold text-blue-700">
          {s.common.notYou}
        </button>
      </div>

      {modules.length === 0 ? (
        <p className="mt-2 text-lg text-slate-500">{s.today.noModules}</p>
      ) : (
        <div className="grid grid-cols-1 gap-3">
          {modules.map((moduleName) => {
            const openable = OPENABLE_MODULES.has(moduleName);
            const label = s.modules[moduleName as keyof typeof s.modules] ?? moduleName;
            const status = statusByModule[moduleName];
            return (
              <button
                key={moduleName}
                type="button"
                disabled={!openable}
                onClick={() => openable && onOpenModule(moduleName as OpenableModule)}
                className={`flex min-h-[88px] w-full items-center gap-4 rounded-2xl px-5 text-left shadow-sm disabled:opacity-60 ${
                  openable ? "bg-white active:bg-slate-50" : "bg-white"
                }`}
              >
                <span className="text-3xl">{ICONS[moduleName] ?? "•"}</span>
                <span className="flex-1">
                  <span className="block text-xl font-bold text-slate-900">{label}</span>
                  <span className="block text-base text-slate-500">{status || s.today.comingSoon}</span>
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function LoginScreen({
  token,
  lang,
  workers,
  onLoggedIn,
  onCancel,
}: {
  token: string;
  lang: TeamHubLang;
  workers: Worker[];
  onLoggedIn: (session: SessionResponse) => void;
  onCancel?: () => void;
}) {
  const s = teamHubStrings(lang);
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
          setError(res.status === 423 ? s.login.lockedOut : s.login.wrongPin);
          setPin("");
          navigator.vibrate?.([15, 40, 15]);
          return;
        }
        navigator.vibrate?.(15);
        onLoggedIn({ ...data, authenticated: true });
      } catch {
        setError(s.common.somethingWrong);
        setPin("");
      } finally {
        setSubmitting(false);
      }
    },
    [selectedWorker, token, onLoggedIn, s]
  );

  function tapDigit(digit: string) {
    if (submitting || pin.length >= MAX_PIN_LENGTH) return;
    const next = pin + digit;
    setPin(next);
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
      <div className="mt-3 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold text-slate-900">{s.login.whoIsSigningIn}</h2>
          {onCancel && (
            <button type="button" onClick={onCancel} className="text-base font-semibold text-blue-700">
              {s.common.back}
            </button>
          )}
        </div>
        {workers.length === 0 ? (
          <p className="mt-3 text-lg text-slate-500">{s.login.noWorkers}</p>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {workers.map((worker) => (
              <button
                key={worker.id}
                type="button"
                onClick={() => selectWorker(worker)}
                className="min-h-[72px] rounded-2xl bg-white text-xl font-bold text-slate-800 shadow-sm active:bg-gray-100"
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
        <h2 className="text-xl font-bold text-slate-900">
          {s.login.enterPin}, {selectedWorker.firstName}
        </h2>
        <button type="button" onClick={() => setSelectedWorker(null)} className="text-base font-semibold text-blue-700">
          {s.common.notYou}
        </button>
      </div>

      {error && (
        <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-base font-semibold text-red-800">
          {error}
        </div>
      )}

      <PinKeypad
        pinLength={pin.length}
        disabled={submitting}
        onDigit={tapDigit}
        onBackspace={backspace}
        onSubmit={() => submitPin(pin)}
      />
    </div>
  );
}
