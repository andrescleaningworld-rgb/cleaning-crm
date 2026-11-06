"use client";

// The Onboarding Checklist: THE setup wizard for an account (there is no
// other). One question per screen, big words and big green buttons, like the
// Equipment Check page. Every answer saves by itself; "Skip for now" on every
// screen; close it and it opens again where you left off (this device). The
// last screen lists what is still missing, each line a tap back to it.
// Rules, screens and "Ready to start": lib/setupWizard.ts. Server:
// app/api/setup-wizard (and /api/accounts for the account's own fields).
//
//   variant "modal"    the wizard itself (OnboardingWizardModal: full screen)
//   variant "section"  the account page's short card: "X of Y done", what is
//                      missing, and the button that opens the wizard

import { useCallback, useEffect, useRef, useState } from "react";
import SubPayFields from "./sub-pay-fields";
import ReadyBadge from "./ready-badge";
import ScheduleEditor from "./schedule-editor";
import { pickGroup, saveSchedule, useAccountSchedule, type StoredScheduleRow } from "./account-schedule";
import { afterFrequencyChange, perCleaningText } from "@/lib/frequency";
import { describeCleaningTime } from "@/lib/cleaningTime";
import { emptyPlan, planIsEmpty, planProblems, rowsToPlan, type SchedulePlan } from "@/lib/schedule-plan";
import { accountFieldsFromPlan, oldScheduleInfo } from "@/lib/plan-account-fields";
import { photoProblemText, preparePhoto, readUploadReply } from "@/lib/imageResize";
import {
  ANYTHING_ELSE_SHOT,
  SETUP_SCREENS,
  SUPPLY_CHOICES,
  isReadyToStart,
  readyBlockers,
  screenDone,
  setupProgress,
  type SetupScreenKey,
  type SetupWizardData,
  type SupplyMode,
  type SurveyPhoto,
  type TapStep,
} from "@/lib/setupWizard";

export type OnboardingChecklistProps = {
  accountId: string;
  accountName: string;
  variant?: "section" | "modal";
  /** variant "section": opens the wizard. */
  onOpenWizard?: () => void;
  /** After any answer is saved, so the page (tracker, pin, banner) reads again. */
  onChanged?: () => void;
  /** variant "section": goes up when the wizard closed, so the card reads again. */
  refreshKey?: number;
};

/* ---------- saving ---------- */

async function wizardPost(body: Record<string, unknown>): Promise<void> {
  const response = await fetch("/api/setup-wizard", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = (await response.json().catch(() => ({}))) as { success?: boolean; error?: string };
  if (!response.ok || data.success !== true) throw new Error(data.error || "That did not save. Try again.");
}

/** The account's own fields, the same way Edit Account saves them. */
async function saveAccountFields(accountId: string, fields: Record<string, string>): Promise<void> {
  const response = await fetch("/api/accounts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "updateAccountFieldsDirect", accountId, fields }),
  });
  const data = (await response.json().catch(() => ({}))) as { success?: boolean; error?: string };
  if (!response.ok || data.success === false) throw new Error(data.error || "That did not save. Try again.");
}

async function loadWizard(accountId: string): Promise<SetupWizardData> {
  const response = await fetch(`/api/setup-wizard?accountId=${encodeURIComponent(accountId)}`, { cache: "no-store" });
  const data = (await response.json().catch(() => ({}))) as { success?: boolean; error?: string; wizard?: SetupWizardData };
  if (!response.ok || !data.success || !data.wizard) throw new Error(data.error || "The setup did not load.");
  return data.wizard;
}

const amount = (value: string) => Number(String(value ?? "").replace(/[$,\s]/g, "")) || 0;

/** Where this device left off, per account. Best effort: private windows have no storage. */
const placeKey = (accountId: string) => `setup-wizard:${accountId}`;
function readPlace(accountId: string): string {
  try {
    return window.localStorage.getItem(placeKey(accountId)) ?? "";
  } catch {
    return "";
  }
}
function writePlace(accountId: string, value: string) {
  try {
    window.localStorage.setItem(placeKey(accountId), value);
  } catch {
    // No storage: it opens on the first open question next time.
  }
}

/* ---------- the parts every screen uses ---------- */

const BIG_GREEN = "min-h-[72px] w-full rounded-2xl bg-green-600 px-4 text-2xl font-bold text-white shadow-sm active:bg-green-700 disabled:opacity-50";
const BIG_WHITE = "min-h-[72px] w-full rounded-2xl border-2 border-slate-300 bg-white px-4 text-2xl font-bold text-slate-800 active:bg-slate-100 disabled:opacity-50";
const BIG_BOX = "w-full rounded-2xl border-2 border-slate-300 bg-white px-4 py-4 text-2xl text-slate-900 outline-none focus:border-green-600";
const LABEL = "text-lg font-bold text-slate-600";

function Choice({ on, children, onClick, disabled }: { on: boolean; children: React.ReactNode; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      disabled={disabled}
      onClick={onClick}
      className={`min-h-[72px] w-full rounded-2xl border-2 px-4 text-left text-2xl font-bold disabled:opacity-50 ${on ? "border-green-700 bg-green-600 text-white" : "border-slate-300 bg-white text-slate-800 active:bg-slate-100"}`}
    >
      {on ? "✓ " : ""}
      {children}
    </button>
  );
}

/** Saves a typed value by itself a moment after typing stops (and when the screen changes). */
function useAutosave(save: (value: string) => Promise<void>, delay = 900) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = useRef<string | null>(null);
  const saveRef = useRef(save);
  useEffect(() => {
    saveRef.current = save;
  });
  const flush = useCallback(async () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    const value = pending.current;
    pending.current = null;
    if (value !== null) await saveRef.current(value);
  }, []);
  const schedule = useCallback(
    (value: string) => {
      pending.current = value;
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => void flush(), delay);
    },
    [delay, flush]
  );
  // Leaving the screen saves what was typed.
  useEffect(() => () => void flush(), [flush]);
  return { schedule, flush };
}

/* ---------- the card on the account page ---------- */

function SetupCard({ accountId, onOpenWizard, refreshKey = 0 }: { accountId: string; onOpenWizard?: () => void; refreshKey?: number }) {
  const [wizard, setWizard] = useState<SetupWizardData | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    loadWizard(accountId)
      .then((data) => {
        if (!alive) return;
        setWizard(data);
        setError("");
      })
      .catch((err) => {
        if (alive) setError(err instanceof Error ? err.message : "The setup did not load.");
      });
    return () => {
      alive = false;
    };
  }, [accountId, refreshKey]);

  if (error) return <p className="ui-muted">{error}</p>;
  if (!wizard) return <p className="ui-muted">Loading setup…</p>;
  const progress = setupProgress(wizard.facts);
  const missing = SETUP_SCREENS.filter((screen) => progress.missingRequired.includes(screen.key)).map((screen) => screen.short);
  return (
    <div className="ui-stack">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-black text-slate-950">Setup</h2>
        {isReadyToStart(wizard.facts) ? <ReadyBadge size="panel" /> : null}
      </div>
      <p className="text-lg font-bold text-slate-800">
        {progress.done} of {progress.total} done{progress.done === progress.total ? " ✓" : ""}
      </p>
      {missing.length > 0 ? <p className="ui-muted">Still missing: {missing.join(", ")}</p> : null}
      {onOpenWizard ? (
        <button type="button" className={BIG_GREEN} onClick={onOpenWizard}>
          {progress.missingRequired.length > 0 ? "Finish setup" : "Open setup"}
        </button>
      ) : null}
    </div>
  );
}

/**
 * The one button that opens the wizard, on the pin's open panel and the
 * account's New account setup card: "Setup · 7 of 12 done", with the gold
 * badge above it when the account is ready to start.
 */
export function SetupButton({ accountId, onOpen, refreshKey = 0 }: { accountId: string; onOpen: () => void; refreshKey?: number }) {
  const [wizard, setWizard] = useState<SetupWizardData | null>(null);
  useEffect(() => {
    let alive = true;
    loadWizard(accountId)
      .then((data) => {
        if (alive) setWizard(data);
      })
      .catch(() => {
        if (alive) setWizard(null);
      });
    return () => {
      alive = false;
    };
  }, [accountId, refreshKey]);
  const progress = wizard ? setupProgress(wizard.facts) : null;
  return (
    <div className="ui-stack">
      {wizard && isReadyToStart(wizard.facts) ? <ReadyBadge size="panel" /> : null}
      <button type="button" className={BIG_GREEN} onClick={onOpen}>
        {progress ? `Setup · ${progress.done} of ${progress.total} done${progress.done === progress.total ? " ✓" : ""}` : "Setup"}
      </button>
    </div>
  );
}

/** The account page banner's gold "Ready to start": only while it is true. */
export function SetupReadyBadge({ accountId, refreshKey = 0 }: { accountId: string; refreshKey?: number }) {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let alive = true;
    loadWizard(accountId)
      .then((data) => {
        if (alive) setReady(isReadyToStart(data.facts));
      })
      .catch(() => {
        if (alive) setReady(false);
      });
    return () => {
      alive = false;
    };
  }, [accountId, refreshKey]);
  return ready ? (
    <div style={{ marginBottom: 8 }}>
      <ReadyBadge size="banner" />
    </div>
  ) : null;
}

/* ---------- the wizard ---------- */

export default function OnboardingChecklist({ accountId, accountName, variant = "section", onOpenWizard, onChanged, refreshKey }: OnboardingChecklistProps) {
  if (variant === "section") return <SetupCard accountId={accountId} onOpenWizard={onOpenWizard} refreshKey={refreshKey} />;
  return <Wizard accountId={accountId} accountName={accountName} onChanged={onChanged} />;
}

type Place = SetupScreenKey | "end";

function Wizard({ accountId, accountName, onChanged }: { accountId: string; accountName: string; onChanged?: () => void }) {
  const [wizard, setWizard] = useState<SetupWizardData | null>(null);
  const [loadError, setLoadError] = useState("");
  const [place, setPlace] = useState<Place | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState("");
  const onChangedRef = useRef(onChanged);
  useEffect(() => {
    onChangedRef.current = onChanged;
  });

  const screens = SETUP_SCREENS;

  const reload = useCallback(async () => {
    const data = await loadWizard(accountId);
    setWizard(data);
    return data;
  }, [accountId]);

  useEffect(() => {
    let alive = true;
    loadWizard(accountId)
      .then((data) => {
        if (!alive) return;
        setWizard(data);
        // Where this device left off; else the first question still open.
        const left = readPlace(accountId);
        const known = SETUP_SCREENS.some((screen) => screen.key === left) || left === "end";
        const firstOpen = SETUP_SCREENS.find((screen) => !screenDone(screen.key, data.facts))?.key;
        setPlace(known ? (left as Place) : firstOpen ?? "end");
      })
      .catch((err) => {
        if (alive) setLoadError(err instanceof Error ? err.message : "The setup did not load.");
      });
    return () => {
      alive = false;
    };
  }, [accountId]);

  useEffect(() => {
    if (place) writePlace(accountId, place);
  }, [accountId, place]);

  /** Runs one save, then reads the account again so every count is right. */
  const run = useCallback(
    async (work: () => Promise<void>): Promise<boolean> => {
      setBusy(true);
      setError("");
      try {
        await work();
        await reload();
        setSaved("Saved ✓");
        onChangedRef.current?.();
        return true;
      } catch (err) {
        setError(err instanceof Error ? err.message : "That did not save. Try again.");
        return false;
      } finally {
        setBusy(false);
      }
    },
    [reload]
  );

  useEffect(() => {
    if (!saved) return;
    const timer = setTimeout(() => setSaved(""), 1600);
    return () => clearTimeout(timer);
  }, [saved]);

  if (loadError) return <p className="rounded-2xl bg-red-50 p-4 text-xl font-bold text-red-800">{loadError}</p>;
  if (!wizard || !place) return <p className="text-xl text-slate-500">Loading…</p>;

  const index = place === "end" ? screens.length : Math.max(0, screens.findIndex((screen) => screen.key === place));
  const go = (next: number) => {
    setError("");
    setPlace(next >= screens.length ? "end" : screens[Math.max(0, next)].key);
  };
  const next = () => go(index + 1);
  const name = accountName || wizard.accountName;
  const shared: ScreenProps = { wizard, accountId, accountName: name, busy, run, next };

  return (
    <div className="space-y-5">
      {/* "3 of 13" and the bar. */}
      <div>
        <div className="flex items-center justify-between text-lg font-bold text-slate-600">
          <span>{place === "end" ? "Last step" : `${index + 1} of ${screens.length}`}</span>
          <span className="text-green-700" aria-live="polite">
            {busy ? "Saving…" : saved}
          </span>
        </div>
        <div className="mt-2 h-3 w-full overflow-hidden rounded-full bg-slate-200">
          <div className="h-full rounded-full bg-green-600 transition-all" style={{ width: `${Math.round((index / screens.length) * 100)}%` }} />
        </div>
      </div>

      {place === "end" ? (
        <EndScreen wizard={wizard} screens={screens} onJump={(key) => setPlace(key)} />
      ) : (
        <>
          <h1 className="text-3xl font-bold text-slate-900">{screens[index].title}</h1>
          <ScreenBody screen={screens[index].key} {...shared} />
        </>
      )}

      {error ? <p className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-lg font-bold text-red-800">{error}</p> : null}

      {place === "end" ? (
        <button type="button" className={BIG_WHITE} onClick={() => go(0)}>
          Back to the start
        </button>
      ) : (
        <div className="flex gap-3">
          <button type="button" className={`${BIG_WHITE} basis-1/3`} disabled={busy || index === 0} onClick={() => go(index - 1)}>
            ← Back
          </button>
          <button type="button" className={`${BIG_WHITE} basis-2/3 text-xl`} disabled={busy} onClick={next}>
            Skip for now
          </button>
        </div>
      )}
    </div>
  );
}

type ScreenProps = {
  wizard: SetupWizardData;
  accountId: string;
  accountName: string;
  busy: boolean;
  run: (work: () => Promise<void>) => Promise<boolean>;
  next: () => void;
};

function ScreenBody(props: ScreenProps & { screen: SetupScreenKey }) {
  // A new screen starts from what is saved (key = the screen).
  switch (props.screen) {
    case "call":
    case "survey":
    case "walkthrough":
      return <TapScreen key={props.screen} step={props.screen} {...props} />;
    case "photos":
      return <PhotosScreen {...props} />;
    case "schedule":
      return <ScheduleScreen {...props} />;
    case "pay":
      return <PayScreen {...props} />;
    case "scope":
      return <ScopeScreen {...props} />;
    case "access":
      return <AccessScreen {...props} />;
    case "contact":
      return <ContactScreen {...props} />;
    case "supplies":
      return <SuppliesScreen {...props} />;
    case "startDate":
      return <StartDateScreen {...props} />;
  }
}

/* ---------- 1, 2, 12: Yes / Not yet ---------- */

const TAP_WORDS: Record<TapStep, { yes: string; hint: string }> = {
  call: { yes: "Yes, I called", hint: "Call the customer and book the site survey." },
  survey: { yes: "Yes, it's done", hint: "Walk the site with the customer." },
  walkthrough: { yes: "Yes, it's done", hint: "Walk the crew through the account." },
};

function TapScreen({ step, wizard, accountId, accountName, busy, run, next }: ScreenProps & { step: TapStep }) {
  const done = screenDone(step, wizard.facts);
  const tap = async (value: boolean) => {
    if (value === done) return next();
    if (await run(() => wizardPost({ action: "tap", accountId, accountName, step, done: value }))) next();
  };
  return (
    <div className="space-y-3">
      <p className="text-xl text-slate-600">{TAP_WORDS[step].hint}</p>
      {done ? <p className="text-xl font-bold text-green-700">✓ Done</p> : null}
      <button type="button" className={BIG_GREEN} disabled={busy} onClick={() => void tap(true)}>
        {TAP_WORDS[step].yes}
      </button>
      <button type="button" className={BIG_WHITE} disabled={busy} onClick={() => void tap(false)}>
        Not yet
      </button>
    </div>
  );
}

/* ---------- 3: the shot list ---------- */

function CameraIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-10 w-10" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 8h3l2-3h6l2 3h3v11H4z" />
      <circle cx="12" cy="13" r="3.5" />
    </svg>
  );
}

function PhotosScreen({ wizard, accountId, accountName, busy, run, next }: ScreenProps) {
  const [uploading, setUploading] = useState("");
  const [problem, setProblem] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const shotFor = useRef("");

  if (!wizard.photosReady) {
    return (
      <div className="space-y-3">
        <p className="text-xl text-slate-600">Photos can be saved here once the database update for them (migration 063) is in.</p>
        <button type="button" className={BIG_GREEN} onClick={next}>
          Next
        </button>
      </div>
    );
  }

  const pick = (label: string) => {
    shotFor.current = label;
    if (input.current) {
      input.current.multiple = label === ANYTHING_ELSE_SHOT;
      input.current.value = "";
      input.current.click();
    }
  };

  const upload = async (files: File[]) => {
    const label = shotFor.current;
    setProblem("");
    let added = 0;
    // Every photo that did not save, with why (not just the last one).
    const failed: string[] = [];
    for (const [i, file] of files.entries()) {
      setUploading(files.length > 1 ? `Saving photo ${i + 1} of ${files.length}…` : "Saving the photo…");
      const which = files.length > 1 ? `Photo ${i + 1}: ` : "";
      try {
        // Small in the browser: the photo (1600px) and its copy for screens (400px). Never the full-size original.
        const prepared = await preparePhoto(file, file.name, { fullSide: 1600, thumbSide: 400, quality: 0.8 });
        if (!prepared.ok) {
          failed.push(`${which}${photoProblemText(prepared.problem)}`);
          continue;
        }
        const { full, thumb } = prepared;
        const form = new FormData();
        form.append("accountId", accountId);
        form.append("accountName", accountName);
        form.append("label", label);
        form.append("full", new File([full], "photo.jpg", { type: "image/jpeg" }));
        if (thumb) form.append("thumb", new File([thumb], "thumb.jpg", { type: "image/jpeg" }));
        const reply = await readUploadReply(await fetch("/api/setup-wizard", { method: "POST", body: form }));
        if (!reply.ok) {
          failed.push(`${which}${reply.error}`);
          continue;
        }
        added++;
      } catch {
        failed.push(`${which}No connection. Check the signal and take it again.`);
      }
    }
    setUploading("");
    if (failed.length) setProblem([failed.length === files.length ? "Not saved:" : `${failed.length} of ${files.length} not saved:`, ...failed].join("\n"));
    if (added > 0) await run(async () => undefined);
  };

  const remove = (photo: SurveyPhoto) => void run(() => wizardPost({ action: "deletePhoto", accountId, photoId: photo.id }));
  const photosOf = (label: string) =>
    wizard.photos.filter((photo) => (label === ANYTHING_ELSE_SHOT ? !wizard.shots.slice(0, -1).includes(photo.label) : photo.label === label));
  const working = busy || uploading !== "";

  return (
    <div className="space-y-4">
      <p className="text-xl text-slate-600">Tap a picture to take it. All of them are optional.</p>
      <input
        ref={input}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(event) => {
          const files = Array.from(event.target.files ?? []);
          if (files.length) void upload(files);
        }}
      />
      <div className="grid grid-cols-2 gap-3">
        {wizard.shots.map((label) => {
          const taken = photosOf(label);
          const extra = label === ANYTHING_ELSE_SHOT;
          return (
            <div key={label} className={`rounded-2xl border-2 p-2 ${taken.length ? "border-green-600 bg-green-50" : "border-slate-300 bg-white"}`}>
              {taken.length === 0 || extra ? (
                <button type="button" disabled={working} onClick={() => pick(label)} className="flex min-h-[110px] w-full flex-col items-center justify-center gap-1 rounded-xl text-center text-lg font-bold text-slate-800 active:bg-slate-100 disabled:opacity-50">
                  <CameraIcon />
                  {extra && taken.length ? "Add more" : label}
                </button>
              ) : null}
              {taken.length ? (
                <div className="space-y-2">
                  {!extra ? <p className="text-center text-lg font-bold text-green-800">✓ {label}</p> : <p className="text-center text-lg font-bold text-green-800">✓ {label} ({taken.length})</p>}
                  {taken.map((photo) => (
                    <div key={photo.id} className="relative">
                      {/* The small copy here; the full photo opens on a tap. */}
                      <a href={photo.url} target="_blank" rel="noopener noreferrer" aria-label={`Open ${photo.label} full size`}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={photo.thumbUrl} alt={photo.label} loading="lazy" className="aspect-square w-full rounded-xl object-cover" />
                      </a>
                      <button type="button" disabled={working} onClick={() => remove(photo)} className="absolute right-1 top-1 rounded-full bg-white/95 px-3 py-1 text-base font-bold text-red-700 shadow disabled:opacity-50">
                        ✕ Delete
                      </button>
                    </div>
                  ))}
                  {!extra ? (
                    <button type="button" disabled={working} onClick={() => pick(label)} className="w-full rounded-xl py-2 text-base font-bold text-slate-600 underline disabled:opacity-50">
                      Take it again
                    </button>
                  ) : null}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
      {uploading ? <p className="text-xl font-bold text-slate-700">{uploading}</p> : null}
      {problem ? (
        <p className="whitespace-pre-line rounded-2xl bg-red-50 px-4 py-3 text-lg font-bold text-red-800" role="alert">
          {problem}
        </p>
      ) : null}
      <button type="button" className={BIG_GREEN} disabled={working} onClick={next}>
        Next
      </button>
    </div>
  );
}

/* ---------- 4: the Cleaning schedule (how often, days, time) ---------- */

// The same picker as Add / Edit Account, saved the same way (the account's
// Frequency / days / time follow it). Old fields show in grey as a hint only.
function ScheduleScreen(props: ScreenProps) {
  const schedule = useAccountSchedule(props.accountId);
  if (schedule.state === "loading") return <p className="text-xl text-slate-500">Loading…</p>;
  if (schedule.state === "failed") return <p className="rounded-2xl bg-red-50 p-4 text-xl font-bold text-red-800">The schedule did not load. Skip for now and try again later.</p>;
  const current = pickGroup(schedule.groups, schedule.accountSub.email);
  return <ScheduleForm key={current?.key ?? "new"} {...props} current={current} subEmail={schedule.accountSub.email} reloadSchedule={schedule.reload} />;
}

function ScheduleForm({
  wizard,
  accountId,
  accountName,
  busy,
  run,
  next,
  current,
  subEmail,
  reloadSchedule,
}: ScreenProps & { current: ReturnType<typeof pickGroup<StoredScheduleRow>>; subEmail: string; reloadSchedule: () => void }) {
  const [plan, setPlan] = useState<SchedulePlan>(() => (current ? rowsToPlan(current.rows) : emptyPlan()));
  const [tried, setTried] = useState(false);
  const oldInfo = current ? "" : oldScheduleInfo(wizard.facts, describeCleaningTime);
  const save = async () => {
    setTried(true);
    if (planIsEmpty(plan) || planProblems(plan).length > 0) return;
    const ok = await run(async () => {
      // No cleaning before the Start Date: a later Start Date is where it begins.
      const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
      const start = /^\d{4}-\d{2}-\d{2}$/.test(wizard.facts.startDate) && wizard.facts.startDate > today ? wizard.facts.startDate : "";
      const result = await saveSchedule({
        accountId,
        accountName,
        subId: current?.subId || subEmail,
        plan,
        closeScheduleIds: (current?.rows ?? []).map((row) => row.scheduleId),
        startDate: start,
      });
      if (!result.ok) throw new Error(result.error);
      // A new Frequency keeps the monthly pay and works the price per cleaning out again.
      const frequency = accountFieldsFromPlan(plan)?.frequency ?? "";
      if (frequency && frequency !== wizard.facts.frequency && amount(wizard.facts.subPay) > 0) {
        const after = afterFrequencyChange(frequency, wizard.facts.subPay, wizard.values.subPricePerCleaning);
        if (after.per) await saveAccountFields(accountId, { subPricePerCleaning: after.per });
      }
    });
    if (ok) {
      reloadSchedule();
      next();
    }
  };
  return (
    <div className="space-y-3">
      {oldInfo ? <p className="text-lg text-slate-500">{oldInfo}</p> : null}
      <ScheduleEditor value={plan} onChange={setPlan} showProblems={tried} disabled={busy} />
      {tried && planIsEmpty(plan) ? <p className="text-lg font-bold text-red-800">Pick how often and the days first.</p> : null}
      <button type="button" className={BIG_GREEN} disabled={busy} onClick={() => void save()}>
        Save schedule
      </button>
    </div>
  );
}

/* ---------- 7: sub pay (starts at 70%; "CW gets $X / We keep $Y") ---------- */

function PayScreen({ wizard, accountId, busy, run, next }: ScreenProps) {
  const frequency = wizard.facts.frequency;
  const [pay, setPay] = useState(amount(wizard.facts.subPay) > 0 ? wizard.facts.subPay : "");
  const [per, setPer] = useState(wizard.values.subPricePerCleaning || perCleaningText(wizard.facts.subPay, frequency));
  const typed = useRef(false);
  const revenue = amount(wizard.values.monthlyRevenue);
  const save = async (nextPay: string, nextPer: string) => {
    const value = amount(nextPay);
    if (value <= 0) return;
    const fields: Record<string, string> = {
      // Same as Edit Account: the gross margin follows the sub pay.
      monthlySubcontractorPay: String(value),
      grossMargin: String(revenue - value),
      grossMarginPercent: revenue ? (((revenue - value) / revenue) * 100).toFixed(1) : "0.0",
    };
    if (nextPer.trim()) fields.subPricePerCleaning = nextPer.trim();
    await run(() => saveAccountFields(accountId, fields));
  };
  const autosave = useAutosave(async (value) => {
    const [nextPay, nextPer] = JSON.parse(value) as [string, string];
    await save(nextPay, nextPer);
  });
  return (
    <div className="space-y-3 text-lg">
      {/* Capture: knows a number was typed before the boxes hand it over. */}
      <div className="ui-stack" onInputCapture={() => (typed.current = true)}>
      <SubPayFields
        revenue={wizard.values.monthlyRevenue}
        frequency={frequency}
        onFrequency={() => undefined}
        pay={pay}
        per={per}
        frequencyAbove
        disabled={busy}
        onPay={({ pay: nextPay, per: nextPer }) => {
          setPay(nextPay);
          setPer(nextPer);
          // The 70% start is only a suggestion: it saves when Next is tapped, a typed number saves by itself.
          if (typed.current) autosave.schedule(JSON.stringify([nextPay, nextPer]));
        }}
      />
      </div>
      <button
        type="button"
        className={BIG_GREEN}
        disabled={busy || amount(pay) <= 0}
        onClick={() =>
          void (async () => {
            await autosave.flush();
            if (amount(pay) > 0 && (pay !== wizard.facts.subPay || per !== wizard.values.subPricePerCleaning)) await save(pay, per);
            next();
          })()
        }
      >
        {amount(pay) > 0 ? `Next: $${amount(pay).toLocaleString("en-US")} a month` : "Type the sub pay"}
      </button>
    </div>
  );
}

/* ---------- 8: what do they clean ---------- */

function ScopeScreen({ wizard, accountId, busy, run, next }: ScreenProps) {
  const [scope, setScope] = useState(wizard.facts.scopeOfWork);
  const autosave = useAutosave(async (value) => {
    if (value.trim() !== wizard.facts.scopeOfWork) await run(() => saveAccountFields(accountId, { scopeOfWork: value.trim() }));
  });
  return (
    <div className="space-y-3">
      <textarea
        className={BIG_BOX}
        rows={5}
        value={scope}
        placeholder="Offices, 2 bathrooms, kitchen, trash, vacuum"
        onChange={(event) => {
          setScope(event.target.value);
          autosave.schedule(event.target.value);
        }}
      />
      <button type="button" className={BIG_GREEN} disabled={busy} onClick={() => void autosave.flush().then(next)}>
        Next
      </button>
    </div>
  );
}

/* ---------- 9: key, alarm, access ---------- */

const NO_ACCESS_NEEDED = "No key or alarm needed.";

function AccessScreen({ wizard, accountId, busy, run, next }: ScreenProps) {
  const [text, setText] = useState(wizard.facts.access);
  const hasKey = wizard.values.hasKey;
  const autosave = useAutosave(async (value) => {
    if (value.trim() !== wizard.facts.access) await run(() => saveAccountFields(accountId, { keyAlarmAccessInfo: value.trim() }));
  });
  return (
    <div className="space-y-3">
      <p className={LABEL}>Do we have a key?</p>
      <div className="grid grid-cols-2 gap-3">
        {["Yes", "No"].map((answer) => (
          <Choice key={answer} on={hasKey === answer} disabled={busy} onClick={() => void run(() => saveAccountFields(accountId, { hasKey: answer }))}>
            {answer}
          </Choice>
        ))}
      </div>
      <label className="block space-y-1">
        <span className={LABEL}>Key, alarm code, how to get in</span>
        <textarea
          className={BIG_BOX}
          rows={3}
          value={text}
          placeholder="Lockbox by back door, code 1234. Alarm 5678."
          onChange={(event) => {
            setText(event.target.value);
            autosave.schedule(event.target.value);
          }}
        />
      </label>
      {!text.trim() ? (
        <button
          type="button"
          className={BIG_WHITE}
          disabled={busy}
          onClick={() => {
            setText(NO_ACCESS_NEEDED);
            void run(() => saveAccountFields(accountId, { keyAlarmAccessInfo: NO_ACCESS_NEEDED })).then((ok) => ok && next());
          }}
        >
          No key or alarm
        </button>
      ) : null}
      <button type="button" className={BIG_GREEN} disabled={busy} onClick={() => void autosave.flush().then(next)}>
        Next
      </button>
    </div>
  );
}

/* ---------- 10: who do we call ---------- */

function ContactScreen({ wizard, accountId, accountName, busy, run, next }: ScreenProps) {
  const [person, setPerson] = useState({ contactName: wizard.values.contactName, phone: wizard.facts.phone, email: wizard.values.email });
  const [billing, setBilling] = useState({ name: wizard.values.billingName, email: wizard.values.billingEmail });
  const [billingOpen, setBillingOpen] = useState(Boolean(wizard.values.billingName || wizard.values.billingEmail));
  const contact = useAutosave(async (value) => {
    const typed = JSON.parse(value) as typeof person;
    const fields: Record<string, string> = {};
    if (typed.contactName.trim() !== wizard.values.contactName) fields.contactName = typed.contactName.trim();
    if (typed.phone.trim() !== wizard.facts.phone) fields.phone = typed.phone.trim();
    if (typed.email.trim() !== wizard.values.email) fields.email = typed.email.trim();
    if (Object.keys(fields).length) await run(() => saveAccountFields(accountId, fields));
  });
  const bill = useAutosave(async (value) => {
    const typed = JSON.parse(value) as typeof billing;
    if (typed.name.trim() === wizard.values.billingName && typed.email.trim() === wizard.values.billingEmail) return;
    await run(() => wizardPost({ action: "billing", accountId, accountName, name: typed.name, email: typed.email }));
  });
  const box = (key: keyof typeof person, label: string, mode: "text" | "tel" | "email") => (
    <label className="block space-y-1">
      <span className={LABEL}>{label}</span>
      <input
        className={BIG_BOX}
        inputMode={mode}
        type={mode === "email" ? "email" : mode === "tel" ? "tel" : "text"}
        value={person[key]}
        onChange={(event) => {
          const updated = { ...person, [key]: event.target.value };
          setPerson(updated);
          contact.schedule(JSON.stringify(updated));
        }}
      />
    </label>
  );
  return (
    <div className="space-y-3">
      {box("contactName", "Name", "text")}
      {box("phone", "Phone", "tel")}
      {box("email", "Email", "email")}
      {billingOpen ? (
        <div className="space-y-3 rounded-2xl bg-slate-50 p-3">
          <p className={LABEL}>Billing contact (if different)</p>
          {(["name", "email"] as const).map((key) => (
            <label key={key} className="block space-y-1">
              <span className={LABEL}>{key === "name" ? "Billing name" : "Billing email"}</span>
              <input
                className={BIG_BOX}
                type={key === "email" ? "email" : "text"}
                inputMode={key === "email" ? "email" : "text"}
                value={billing[key]}
                onChange={(event) => {
                  const updated = { ...billing, [key]: event.target.value };
                  setBilling(updated);
                  bill.schedule(JSON.stringify(updated));
                }}
              />
            </label>
          ))}
        </div>
      ) : (
        <button type="button" className="w-full py-2 text-left text-lg font-bold text-slate-600 underline" onClick={() => setBillingOpen(true)}>
          + Billing contact (if different)
        </button>
      )}
      <button type="button" className={BIG_GREEN} disabled={busy} onClick={() => void Promise.all([contact.flush(), bill.flush()]).then(next)}>
        Next
      </button>
    </div>
  );
}

/* ---------- 11: supplies ---------- */

function SuppliesScreen({ wizard, accountId, accountName, busy, run, next }: ScreenProps) {
  const [note, setNote] = useState(wizard.values.specialEquipment);
  const equipment = useAutosave(async (value) => {
    if (value.trim() !== wizard.values.specialEquipment) await run(() => wizardPost({ action: "equipment", accountId, accountName, note: value }));
  });
  const choose = (mode: SupplyMode) => void run(() => wizardPost({ action: "supplies", accountId, accountName, mode }));
  return (
    <div className="space-y-3">
      {SUPPLY_CHOICES.map((choice) => (
        <Choice key={choice.mode} on={wizard.facts.supplyMode === choice.mode} disabled={busy} onClick={() => choose(choice.mode)}>
          {choice.label}
        </Choice>
      ))}
      <label className="block space-y-1 pt-2">
        <span className={LABEL}>Special equipment? (optional)</span>
        <input
          className={BIG_BOX}
          value={note}
          placeholder="Floor machine, ladder"
          onChange={(event) => {
            setNote(event.target.value);
            equipment.schedule(event.target.value);
          }}
        />
      </label>
      <button type="button" className={BIG_GREEN} disabled={busy} onClick={() => void equipment.flush().then(next)}>
        Next
      </button>
    </div>
  );
}

/* ---------- 13: start date ---------- */

function StartDateScreen({ wizard, accountId, busy, run, next }: ScreenProps) {
  const saved = /^\d{4}-\d{2}-\d{2}$/.test(wizard.facts.startDate) ? wizard.facts.startDate : "";
  const [day, setDay] = useState(saved);
  const save = () =>
    run(async () => {
      if (day !== saved) await saveAccountFields(accountId, { startDate: day });
      // The new-account step 7 and the follow-up day, from any step.
      await wizardPost({ action: "startDate", accountId, startDate: day });
    });
  return (
    <div className="space-y-3">
      <input className={BIG_BOX} type="date" value={day} onChange={(event) => setDay(event.target.value)} aria-label="Start date" />
      <button type="button" className={BIG_GREEN} disabled={busy || !/^\d{4}-\d{2}-\d{2}$/.test(day)} onClick={() => void save().then((ok) => ok && next())}>
        {saved && day === saved ? "Next" : "Save start date"}
      </button>
    </div>
  );
}

/* ---------- the last screen: what is still missing ---------- */

function EndScreen({ wizard, screens, onJump }: { wizard: SetupWizardData; screens: typeof SETUP_SCREENS; onJump: (key: SetupScreenKey) => void }) {
  const progress = setupProgress(wizard.facts);
  const ready = isReadyToStart(wizard.facts);
  const missing = screens.filter((screen) => !screenDone(screen.key, wizard.facts));
  const onPin = readyBlockers(wizard.facts);
  return (
    <div className="space-y-4">
      {ready ? <ReadyBadge size="banner" /> : null}
      <h1 className="text-3xl font-bold text-slate-900">{missing.length === 0 ? "All done ✓" : "Still missing"}</h1>
      <p className="text-xl text-slate-600">
        {progress.done} of {progress.total} done.{missing.length ? " Tap one to fill it in." : ""}
      </p>
      <div className="space-y-3">
        {missing.map((screen) => (
          <button key={screen.key} type="button" onClick={() => onJump(screen.key)} className="flex min-h-[64px] w-full items-center justify-between rounded-2xl border-2 border-slate-300 bg-white px-4 text-left text-2xl font-bold text-slate-800 active:bg-slate-100">
            <span>{screen.short}</span>
            <span className="text-lg font-bold text-slate-500">{screen.required ? "Needed →" : "Optional →"}</span>
          </button>
        ))}
      </div>
      {onPin.length > 0 ? <p className="text-lg text-slate-600">Also needed to start: {onPin.join(", ")}.</p> : null}
    </div>
  );
}
