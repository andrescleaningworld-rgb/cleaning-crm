"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import Image from "next/image";
import { countTemplateProgress, type ChecklistSectionDef } from "@/lib/checklistTemplate";

type LoadResponse = {
  success?: boolean;
  error?: string;
  available?: boolean;
  accountName?: string;
  locationName?: string;
  sections?: ChecklistSectionDef[];
};

type ItemState = { checked: boolean; note: string };

export default function PorterChecklistPage() {
  const params = useParams<{ code: string }>();
  const code = typeof params?.code === "string" ? params.code : "";

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [available, setAvailable] = useState(false);
  const [locationName, setLocationName] = useState("");
  const [sections, setSections] = useState<ChecklistSectionDef[]>([]);

  const [itemStates, setItemStates] = useState<Record<string, ItemState>>({});
  const [porterName, setPorterName] = useState("");
  const [weekOf, setWeekOf] = useState("");
  const [timeIn, setTimeIn] = useState("");
  const [timeOut, setTimeOut] = useState("");
  const [generalNotes, setGeneralNotes] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!code) return;
      setLoading(true);
      setLoadError("");
      try {
        const response = await fetch(`/api/porter-checklist?code=${encodeURIComponent(code)}`, {
          cache: "no-store",
        });
        const data = (await response.json()) as LoadResponse;
        if (!response.ok || data.success === false) {
          throw new Error(data.error ?? "Could not load this checklist.");
        }
        if (cancelled) return;

        setAvailable(Boolean(data.available));
        setLocationName(data.locationName ?? "");
        setSections(data.sections ?? []);

        const initial: Record<string, ItemState> = {};
        for (const section of data.sections ?? []) {
          for (const item of section.items) {
            initial[item.key] = { checked: false, note: "" };
          }
        }
        setItemStates(initial);
      } catch (err) {
        if (!cancelled) setLoadError(err instanceof Error ? err.message : "Could not load this checklist.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [code]);

  const progress = useMemo(
    () => countTemplateProgress(sections, new Set(Object.keys(itemStates).filter((k) => itemStates[k]?.checked))),
    [sections, itemStates]
  );

  function toggleItem(key: string) {
    setItemStates((prev) => ({ ...prev, [key]: { checked: !prev[key]?.checked, note: prev[key]?.note ?? "" } }));
  }

  function setItemNote(key: string, note: string) {
    setItemStates((prev) => ({ ...prev, [key]: { checked: prev[key]?.checked ?? false, note } }));
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!porterName.trim()) {
      setSubmitError("Please enter your name.");
      return;
    }

    setSubmitting(true);
    setSubmitError("");
    try {
      const submissionSections = sections.map((section) => ({
        key: section.key,
        title: section.title,
        items: section.items.map((item) => ({
          key: item.key,
          label: item.label,
          subNote: item.subNote,
          checked: itemStates[item.key]?.checked ?? false,
          note: itemStates[item.key]?.note ?? "",
        })),
      }));

      const response = await fetch("/api/porter-checklist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "submit",
          code,
          porterName: porterName.trim(),
          weekOf,
          timeIn,
          timeOut,
          generalNotes,
          sections: submissionSections,
        }),
      });
      const data = (await response.json()) as { success?: boolean; error?: string };
      if (!response.ok || data.success === false) {
        throw new Error(data.error ?? "Could not submit this checklist.");
      }
      setSubmitted(true);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Could not submit this checklist.");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
        <p className="text-sm font-semibold text-slate-500">Loading checklist…</p>
      </div>
    );
  }

  if (loadError || !available) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
        <div className="max-w-sm rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm">
          <h1 className="text-lg font-black text-slate-950">Checklist Unavailable</h1>
          <p className="mt-2 text-sm text-slate-500">
            {loadError || "This checklist link is not currently active. Contact your manager for an updated link."}
          </p>
        </div>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
        <div className="max-w-sm rounded-2xl border border-green-200 bg-green-50 p-6 text-center shadow-sm">
          <h1 className="text-lg font-black text-green-900">Checklist Submitted</h1>
          <p className="mt-2 text-sm text-green-800">
            Thanks, {porterName || "porter"} — your checklist for {locationName} has been recorded.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-6 sm:py-10">
      <form onSubmit={handleSubmit} className="mx-auto max-w-xl space-y-5">
        <div className="rounded-2xl bg-white p-4 shadow-sm sm:p-6">
          <div className="flex items-center gap-2">
            <Image src="/logo-CW-single-phone-optimized.png" alt="Cleaning World" width={28} height={28} className="h-7 w-7 object-contain" />
            <p className="text-xs font-black uppercase tracking-[0.2em] text-blue-700">Cleaning World</p>
          </div>
          <h1 className="mt-1 text-2xl font-black text-slate-950">{locationName || "Cleaning Checklist"}</h1>

          <div className="mt-4">
            <div className="flex items-center justify-between text-sm font-semibold text-slate-700">
              <span>{progress.done} of {progress.total} complete</span>
            </div>
            <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-200">
              <div
                className="h-full rounded-full bg-blue-600 transition-all"
                style={{ width: `${progress.total > 0 ? (progress.done / progress.total) * 100 : 0}%` }}
              />
            </div>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="text-xs font-black uppercase tracking-wide text-slate-400">Porter Name</span>
              <input
                required
                value={porterName}
                onChange={(event) => setPorterName(event.target.value)}
                className="mt-1 min-h-[44px] w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold outline-none focus:border-blue-500"
              />
            </label>
            <label className="block">
              <span className="text-xs font-black uppercase tracking-wide text-slate-400">Week Of</span>
              <input
                type="date"
                value={weekOf}
                onChange={(event) => setWeekOf(event.target.value)}
                className="mt-1 min-h-[44px] w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold outline-none focus:border-blue-500"
              />
            </label>
            <label className="block">
              <span className="text-xs font-black uppercase tracking-wide text-slate-400">Time In</span>
              <input
                type="time"
                value={timeIn}
                onChange={(event) => setTimeIn(event.target.value)}
                className="mt-1 min-h-[44px] w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold outline-none focus:border-blue-500"
              />
            </label>
            <label className="block">
              <span className="text-xs font-black uppercase tracking-wide text-slate-400">Time Out</span>
              <input
                type="time"
                value={timeOut}
                onChange={(event) => setTimeOut(event.target.value)}
                className="mt-1 min-h-[44px] w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold outline-none focus:border-blue-500"
              />
            </label>
          </div>
        </div>

        {sections.map((section) => (
          <div key={section.key} className="rounded-2xl bg-white p-4 shadow-sm sm:p-6">
            <h2 className="text-sm font-black uppercase tracking-wide text-slate-500">{section.title}</h2>
            <div className="mt-3 space-y-3">
              {section.items.map((item) => (
                <div key={item.key} className="rounded-xl border border-slate-200 p-3">
                  <label className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      checked={itemStates[item.key]?.checked ?? false}
                      onChange={() => toggleItem(item.key)}
                      className="mt-1 h-5 w-5 shrink-0 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                    />
                    <span className="flex-1 text-sm font-semibold text-slate-800">
                      {item.label}
                      {item.subNote ? <span className="mt-0.5 block text-xs font-normal text-slate-400">{item.subNote}</span> : null}
                    </span>
                  </label>
                  <textarea
                    value={itemStates[item.key]?.note ?? ""}
                    onChange={(event) => setItemNote(item.key, event.target.value)}
                    placeholder="Optional note…"
                    rows={1}
                    className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                  />
                </div>
              ))}
            </div>
          </div>
        ))}

        <div className="rounded-2xl bg-white p-4 shadow-sm sm:p-6">
          <label className="block">
            <span className="text-xs font-black uppercase tracking-wide text-slate-400">General Notes</span>
            <textarea
              value={generalNotes}
              onChange={(event) => setGeneralNotes(event.target.value)}
              rows={3}
              placeholder="Anything else to report…"
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-500"
            />
          </label>
        </div>

        {submitError ? (
          <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
            {submitError}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-2xl bg-blue-600 px-5 py-4 text-center text-base font-black text-white shadow-sm hover:bg-blue-500 disabled:opacity-60"
        >
          {submitting ? "Submitting…" : "Submit Checklist"}
        </button>
      </form>
    </div>
  );
}
