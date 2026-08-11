"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ONBOARDING_CHECKLIST_SECTIONS,
  buildOnboardingNotesSummary,
  countChecklistProgress,
  createEmptyChecklistItems,
  getOnboardingItemLabel,
  isChecklistComplete,
  type OnboardingChecklistItems,
} from "@/lib/onboardingChecklist";

// How long to wait after the user stops typing in a note field before
// autosaving it — checkbox toggles save immediately (no debounce), but a
// note field firing a write per keystroke would hammer the Sheets API and
// spam the account-updates history with one entry per keystroke.
const NOTE_SAVE_DEBOUNCE_MS = 800;

type ChecklistApiResponse = {
  success?: boolean;
  error?: string;
  checklist?: {
    accountId: string;
    accountName: string;
    items: OnboardingChecklistItems;
    startedAt: string;
    lastUpdatedAt: string;
    completedAt: string;
    autoStableAppliedAt: string;
  };
  justCompleted?: boolean;
};

export type OnboardingChecklistProps = {
  accountId: string;
  accountName: string;
  // Header display only — these come from the account record and are never
  // edited here (editing account fields happens on the Edit Account page).
  manager?: string;
  accountStartDate?: string;
  // Fired exactly once, the moment the last unchecked item becomes checked
  // and the server confirms the auto-Stable side effect hasn't already run
  // for this account. Passes a consolidated, section-grouped summary of
  // every non-empty note ("" if none) — the host page's own single
  // addAccountUpdate call (see applyOnboardingCompletionStable in
  // app/accounts/[id]/page.tsx) appends this alongside the Stable-set
  // message, so the whole checklist's notes reach history in exactly one
  // call/email, not one per note-save. The host page owns applying the
  // Account Health side effect (reusing the same updateAccountFields/
  // addAccountUpdate path the "Change Status" button uses) and showing its
  // own toast/banner, since neither a shared status-update helper nor a
  // shared toast component exists in this codebase — every page currently
  // rolls both itself.
  onAllItemsComplete?: (notesSummary: string) => void;
  // Compact styling for use inside a modal vs. the account detail page's
  // persistent section.
  variant?: "section" | "modal";
};

function formatTimestamp(iso: string): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function OnboardingChecklist({
  accountId,
  accountName,
  manager,
  accountStartDate,
  onAllItemsComplete,
  variant = "section",
}: OnboardingChecklistProps) {
  const [items, setItems] = useState<OnboardingChecklistItems>(createEmptyChecklistItems());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [savingKeys, setSavingKeys] = useState<Set<string>>(new Set());
  const [lastUpdatedAt, setLastUpdatedAt] = useState("");
  const [completedAt, setCompletedAt] = useState("");
  const [autoStableAppliedAt, setAutoStableAppliedAt] = useState("");

  // Local text state for note inputs, keyed by item — kept separate from
  // `items` so typing doesn't need a round-trip to reflect in the textarea,
  // and so the debounce timer can compare "what's on screen now" against
  // "what was last saved" without racing state updates.
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({});
  const noteTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const hasFiredCompleteRef = useRef(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!accountId) return;
      setLoading(true);
      setError("");
      try {
        const response = await fetch(`/api/onboarding-checklist?accountId=${encodeURIComponent(accountId)}`, {
          cache: "no-store",
        });
        const data = (await response.json()) as ChecklistApiResponse;
        if (!response.ok || data.success === false || !data.checklist) {
          throw new Error(data.error ?? "Could not load onboarding checklist.");
        }
        if (cancelled) return;

        setItems(data.checklist.items);
        setLastUpdatedAt(data.checklist.lastUpdatedAt);
        setCompletedAt(data.checklist.completedAt);
        setAutoStableAppliedAt(data.checklist.autoStableAppliedAt);
        hasFiredCompleteRef.current = Boolean(data.checklist.autoStableAppliedAt);

        const drafts: Record<string, string> = {};
        for (const [key, value] of Object.entries(data.checklist.items)) {
          drafts[key] = value.note;
        }
        setNoteDrafts(drafts);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Could not load onboarding checklist.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [accountId]);

  // Snapshot of the timers ref at effect-registration time, captured once —
  // clearing whatever timers exist when this component actually unmounts,
  // not re-running on every render (the ref's contents change constantly as
  // notes are typed, but the cleanup target — "the timer map" — doesn't).
  useEffect(() => {
    const timers = noteTimers.current;
    return () => {
      Object.values(timers).forEach((timer) => clearTimeout(timer));
    };
  }, []);

  const progress = useMemo(() => countChecklistProgress(items), [items]);

  // No per-save history write here on purpose — the account-updates
  // endpoint (the same one the "Change Status" button uses) emails
  // info@/crm@ on every call regardless of the notifyEmail flag, confirmed
  // live during this feature's smoke test. Logging a history entry per
  // checkbox toggle / debounced note-save would mean an email per
  // keystroke-ish action. Instead, history logging fires exactly once, at
  // full completion (see the justCompleted branch below), as one
  // consolidated summary of every note.
  async function saveItem(itemKey: string, checked: boolean, note: string) {
    setSavingKeys((current) => new Set(current).add(itemKey));
    setError("");
    try {
      const response = await fetch("/api/onboarding-checklist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "setItem",
          accountId,
          accountName,
          itemKey,
          checked,
          note,
        }),
      });
      const data = (await response.json()) as ChecklistApiResponse;
      if (!response.ok || data.success === false || !data.checklist) {
        throw new Error(data.error ?? "Could not save checklist item.");
      }

      setItems(data.checklist.items);
      setLastUpdatedAt(data.checklist.lastUpdatedAt);
      setCompletedAt(data.checklist.completedAt);
      setAutoStableAppliedAt(data.checklist.autoStableAppliedAt);

      if (data.justCompleted && !hasFiredCompleteRef.current) {
        hasFiredCompleteRef.current = true;
        onAllItemsComplete?.(buildOnboardingNotesSummary(data.checklist.items));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save checklist item.");
    } finally {
      setSavingKeys((current) => {
        const next = new Set(current);
        next.delete(itemKey);
        return next;
      });
    }
  }

  function handleToggle(itemKey: string) {
    const current = items[itemKey];
    const nextChecked = !(current?.checked ?? false);
    const note = noteDrafts[itemKey] ?? current?.note ?? "";

    // Reflect immediately so the checkbox doesn't feel laggy while the
    // save is in flight.
    setItems((prev) => ({
      ...prev,
      [itemKey]: { checked: nextChecked, note, completedAt: prev[itemKey]?.completedAt ?? null },
    }));

    saveItem(itemKey, nextChecked, note);
  }

  function handleNoteChange(itemKey: string, value: string) {
    setNoteDrafts((prev) => ({ ...prev, [itemKey]: value }));

    if (noteTimers.current[itemKey]) clearTimeout(noteTimers.current[itemKey]);
    noteTimers.current[itemKey] = setTimeout(() => {
      const checked = items[itemKey]?.checked ?? false;
      saveItem(itemKey, checked, value);
    }, NOTE_SAVE_DEBOUNCE_MS);
  }

  const isComplete = isChecklistComplete(items);
  const compact = variant === "modal";

  if (loading) {
    return <p className="text-sm text-slate-500">Loading onboarding checklist…</p>;
  }

  return (
    <div className={compact ? "space-y-5" : "space-y-6"}>
      <div className="grid gap-3 rounded-2xl bg-slate-50 p-4 sm:grid-cols-3">
        <div>
          <p className="text-[11px] font-black uppercase tracking-wide text-slate-400">Account</p>
          <p className="mt-1 text-sm font-bold text-slate-900">{accountName || "Unnamed Account"}</p>
        </div>
        <div>
          <p className="text-[11px] font-black uppercase tracking-wide text-slate-400">Date Started</p>
          <p className="mt-1 text-sm font-bold text-slate-900">{accountStartDate || "N/A"}</p>
        </div>
        <div>
          <p className="text-[11px] font-black uppercase tracking-wide text-slate-400">Assigned Manager</p>
          <p className="mt-1 text-sm font-bold text-slate-900">{manager || "N/A"}</p>
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between text-sm font-semibold text-slate-700">
          <span>
            {progress.done} of {progress.total} complete
          </span>
          {lastUpdatedAt ? (
            <span className="text-xs font-medium text-slate-400">Last saved {formatTimestamp(lastUpdatedAt)}</span>
          ) : null}
        </div>
        <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-200">
          <div
            className="h-full rounded-full bg-blue-600 transition-all"
            style={{ width: `${progress.total > 0 ? (progress.done / progress.total) * 100 : 0}%` }}
          />
        </div>
      </div>

      {isComplete ? (
        <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm font-semibold text-green-800">
          {autoStableAppliedAt
            ? `✓ Onboarding complete — Account Health was automatically set to Stable on ${formatTimestamp(autoStableAppliedAt)}.`
            : "✓ All items complete."}
        </div>
      ) : null}

      {error ? (
        <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
          {error}
        </p>
      ) : null}

      <div className="space-y-6">
        {ONBOARDING_CHECKLIST_SECTIONS.map((section) => (
          <div key={section.key}>
            <h3 className="text-sm font-black uppercase tracking-wide text-slate-500">{section.title}</h3>
            <div className="mt-3 space-y-3">
              {section.items.map((item) => {
                const state = items[item.key] ?? { checked: false, note: "", completedAt: null };
                const saving = savingKeys.has(item.key);
                return (
                  <div key={item.key} className="rounded-xl border border-slate-200 p-3">
                    <label className="flex items-start gap-3">
                      <input
                        type="checkbox"
                        checked={state.checked}
                        onChange={() => handleToggle(item.key)}
                        className="mt-1 h-5 w-5 shrink-0 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                      />
                      <span className="flex-1 text-sm font-semibold text-slate-800">
                        {getOnboardingItemLabel(item.key)}
                        {saving ? <span className="ml-2 text-xs font-normal text-slate-400">Saving…</span> : null}
                      </span>
                    </label>
                    <textarea
                      value={noteDrafts[item.key] ?? ""}
                      onChange={(event) => handleNoteChange(item.key, event.target.value)}
                      placeholder="Optional note…"
                      rows={compact ? 1 : 2}
                      className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                    />
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {completedAt ? (
        <p className="text-xs font-medium text-slate-400">Checklist completed {formatTimestamp(completedAt)}</p>
      ) : null}
    </div>
  );
}
