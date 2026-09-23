"use client";

// Crew Link (docs/crew-link-spec.md) — the Porter Checklist link, now with
// "Order supplies" and "Report a problem" when the account has them on.
// Route, porter codes and the checklist submit are unchanged: a link with
// only the checklist switched on opens straight into the same checklist
// form as before. With more than one module, a home screen shows one big
// button per switched-on module.
import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import Image from "next/image";
import { countTemplateProgress, type ChecklistSectionDef } from "@/lib/checklistTemplate";
import SuppliesView from "@/app/team-hub/[token]/SuppliesView";
import IssueReportView from "@/app/team-hub/[token]/IssueReportView";
import LangToggle from "@/app/team-hub/[token]/LangToggle";
import { useTeamHubLang, type TeamHubLang } from "@/app/team-hub/teamHubStrings";
import { crewLinkStrings } from "./strings";

type Modules = { checklist: boolean; supplyOrders: boolean; problemReports: boolean };

type LoadResponse = {
  success?: boolean;
  error?: string;
  available?: boolean;
  accountName?: string;
  locationName?: string;
  sections?: ChecklistSectionDef[];
  modules?: Modules;
};

type ItemState = { checked: boolean; note: string };
type Screen = "home" | "checklist" | "supplies" | "issues";
type Strings = ReturnType<typeof crewLinkStrings>;

const NAME_STORAGE_KEY = "crew-link-name";

function readStoredName(): string {
  try {
    return localStorage.getItem(NAME_STORAGE_KEY) ?? "";
  } catch {
    return "";
  }
}

function storeName(name: string) {
  try {
    localStorage.setItem(NAME_STORAGE_KEY, name);
  } catch {
    // best-effort only — the name still applies for this visit
  }
}

export default function CrewLinkPage() {
  const params = useParams<{ code: string }>();
  const code = typeof params?.code === "string" ? params.code : "";
  const [lang, setLang] = useTeamHubLang();
  const s = crewLinkStrings(lang);

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [available, setAvailable] = useState(false);
  const [locationName, setLocationName] = useState("");
  const [sections, setSections] = useState<ChecklistSectionDef[]>([]);
  // Older API responses (before Crew Link) had no modules — treat as checklist-only.
  const [modules, setModules] = useState<Modules>({ checklist: true, supplyOrders: false, problemReports: false });
  const [screen, setScreen] = useState<Screen>("home");
  const [name, setName] = useState("");

  useEffect(() => {
    setName(readStoredName());
  }, []);

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
        if (data.modules) setModules(data.modules);
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

  const enabledCount = Number(modules.checklist) + Number(modules.supplyOrders) + Number(modules.problemReports);
  const checklistOnly = modules.checklist && enabledCount === 1;

  function updateName(next: string) {
    setName(next);
    storeName(next.trim());
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
        <p className="text-sm font-semibold text-slate-500">{s.loading}</p>
      </div>
    );
  }

  if (loadError || !available) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
        <div className="max-w-sm rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm">
          <h1 className="text-lg font-black text-slate-950">{s.unavailableTitle}</h1>
          <p className="mt-2 text-sm text-slate-500">{loadError || s.unavailableBody}</p>
        </div>
      </div>
    );
  }

  if (checklistOnly || screen === "checklist") {
    return (
      <ChecklistForm
        code={code}
        s={s}
        lang={lang}
        onLangChange={setLang}
        locationName={locationName}
        sections={sections}
        initialName={name}
        onNameChange={updateName}
        onBackHome={checklistOnly ? null : () => setScreen("home")}
      />
    );
  }

  const apiBase = `/api/porter-checklist/${encodeURIComponent(code)}`;

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-6">
      <div className="mx-auto max-w-xl">
        <CrewLinkHeader s={s} lang={lang} onLangChange={setLang} locationName={locationName} />

        {screen === "supplies" ? (
          <SuppliesView token="" apiBase={apiBase} reporterName={name.trim()} lang={lang} onBack={() => setScreen("home")} />
        ) : screen === "issues" ? (
          <IssueReportView token="" apiBase={apiBase} reporterName={name.trim()} lang={lang} onBack={() => setScreen("home")} />
        ) : (
          <div className="mt-4 space-y-4">
            <label className="block rounded-2xl bg-white p-4 shadow-sm">
              <span className="text-base font-bold text-slate-700">{s.yourName}</span>
              <input
                value={name}
                onChange={(event) => updateName(event.target.value)}
                autoComplete="name"
                className="mt-2 min-h-[56px] w-full rounded-xl border border-slate-300 px-4 text-xl font-semibold outline-none focus:border-blue-500"
              />
            </label>
            {!name.trim() && <p className="text-base font-semibold text-amber-700">{s.typeNameFirst}</p>}

            <div className="grid gap-3">
              {modules.checklist && (
                <HomeButton icon="✅" label={s.checklist} disabled={false} onClick={() => setScreen("checklist")} />
              )}
              {modules.supplyOrders && (
                <HomeButton icon="📦" label={s.orderSupplies} disabled={!name.trim()} onClick={() => setScreen("supplies")} />
              )}
              {modules.problemReports && (
                <HomeButton icon="⚠️" label={s.reportProblem} disabled={!name.trim()} onClick={() => setScreen("issues")} />
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function CrewLinkHeader({
  s,
  lang,
  onLangChange,
  locationName,
}: {
  s: Strings;
  lang: TeamHubLang;
  onLangChange: (lang: TeamHubLang) => void;
  locationName: string;
}) {
  return (
    <div className="rounded-2xl bg-blue-700 p-4 text-white shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Image src="/logo-CW-single-phone-optimized.png" alt="Cleaning World" width={28} height={28} className="h-7 w-7 rounded bg-white object-contain" />
          <p className="text-xs font-black uppercase tracking-[0.2em] text-blue-100">{s.appName}</p>
        </div>
        <LangToggle lang={lang} onChange={onLangChange} />
      </div>
      <h1 className="mt-1 text-2xl font-black">{locationName || s.defaultTitle}</h1>
    </div>
  );
}

function HomeButton({ icon, label, disabled, onClick }: { icon: string; label: string; disabled: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex min-h-[96px] items-center gap-4 rounded-2xl bg-white px-5 text-left text-2xl font-bold text-slate-900 shadow-sm active:bg-gray-100 disabled:opacity-40"
    >
      <span className="text-4xl">{icon}</span>
      {label}
    </button>
  );
}

// The original Porter Checklist form — same fields, same submit body, same
// API. Only the labels are now EN/ES, the name is prefilled from the device,
// and (when the link has other modules) there's a way back to the home screen.
function ChecklistForm({
  code,
  s,
  lang,
  onLangChange,
  locationName,
  sections,
  initialName,
  onNameChange,
  onBackHome,
}: {
  code: string;
  s: Strings;
  lang: TeamHubLang;
  onLangChange: (lang: TeamHubLang) => void;
  locationName: string;
  sections: ChecklistSectionDef[];
  initialName: string;
  onNameChange: (name: string) => void;
  onBackHome: (() => void) | null;
}) {
  const [itemStates, setItemStates] = useState<Record<string, ItemState>>(() => {
    const initial: Record<string, ItemState> = {};
    for (const section of sections) {
      for (const item of section.items) {
        initial[item.key] = { checked: false, note: "" };
      }
    }
    return initial;
  });
  const [porterName, setPorterName] = useState(initialName);
  const [weekOf, setWeekOf] = useState("");
  const [timeIn, setTimeIn] = useState("");
  const [timeOut, setTimeOut] = useState("");
  const [generalNotes, setGeneralNotes] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    // The stored name loads after first render; fill it in if the field is still empty.
    if (initialName) setPorterName((current) => current || initialName);
  }, [initialName]);

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
      setSubmitError(s.pleaseEnterName);
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
      onNameChange(porterName.trim());
      setSubmitted(true);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Could not submit this checklist.");
    } finally {
      setSubmitting(false);
    }
  }

  if (submitted) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
        <div className="max-w-sm rounded-2xl border border-green-200 bg-green-50 p-6 text-center shadow-sm">
          <h1 className="text-lg font-black text-green-900">{s.submittedTitle}</h1>
          <p className="mt-2 text-sm text-green-800">{s.submittedBody(porterName || "porter", locationName)}</p>
          {onBackHome && (
            <button type="button" onClick={onBackHome} className="mt-4 rounded-xl bg-blue-700 px-5 py-3 text-base font-bold text-white">
              {s.backHome}
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-6 sm:py-10">
      <form onSubmit={handleSubmit} className="mx-auto max-w-xl space-y-5">
        {onBackHome && (
          <button type="button" onClick={onBackHome} className="text-base font-semibold text-blue-700">
            ← {s.back}
          </button>
        )}
        <div className="rounded-2xl bg-white p-4 shadow-sm sm:p-6">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Image src="/logo-CW-single-phone-optimized.png" alt="Cleaning World" width={28} height={28} className="h-7 w-7 object-contain" />
              <p className="text-xs font-black uppercase tracking-[0.2em] text-blue-700">{s.appName}</p>
            </div>
            <div className="rounded-full bg-blue-700">
              <LangToggle lang={lang} onChange={onLangChange} />
            </div>
          </div>
          <h1 className="mt-1 text-2xl font-black text-slate-950">{locationName || s.defaultTitle}</h1>

          <div className="mt-4">
            <div className="flex items-center justify-between text-sm font-semibold text-slate-700">
              <span>{s.progress(progress.done, progress.total)}</span>
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
              <span className="text-xs font-black uppercase tracking-wide text-slate-400">{s.name}</span>
              <input
                required
                value={porterName}
                onChange={(event) => setPorterName(event.target.value)}
                className="mt-1 min-h-[44px] w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold outline-none focus:border-blue-500"
              />
            </label>
            <label className="block">
              <span className="text-xs font-black uppercase tracking-wide text-slate-400">{s.weekOf}</span>
              <input
                type="date"
                value={weekOf}
                onChange={(event) => setWeekOf(event.target.value)}
                className="mt-1 min-h-[44px] w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold outline-none focus:border-blue-500"
              />
            </label>
            <label className="block">
              <span className="text-xs font-black uppercase tracking-wide text-slate-400">{s.timeIn}</span>
              <input
                type="time"
                value={timeIn}
                onChange={(event) => setTimeIn(event.target.value)}
                className="mt-1 min-h-[44px] w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold outline-none focus:border-blue-500"
              />
            </label>
            <label className="block">
              <span className="text-xs font-black uppercase tracking-wide text-slate-400">{s.timeOut}</span>
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
                    placeholder={s.optionalNote}
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
            <span className="text-xs font-black uppercase tracking-wide text-slate-400">{s.generalNotes}</span>
            <textarea
              value={generalNotes}
              onChange={(event) => setGeneralNotes(event.target.value)}
              rows={3}
              placeholder={s.generalNotesPlaceholder}
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
          {submitting ? s.submitting : s.submit}
        </button>
      </form>
    </div>
  );
}
