"use client";

// Crew Link (docs/crew-link-spec.md) — the one public link a crew opens on
// their phone. Built to be as simple as possible: the name is asked once
// (remembered on that phone), then a home screen with up to three huge
// buttons (Checklist / Supplies / Problem — only the ones switched on). A
// link with just one of them skips the home screen. Every Send ends on a
// full-screen green "Sent!" with one "Back to start" button. Crews only ever
// see the building name — nothing else about the account.
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import type { ChecklistSectionDef, ChecklistTabDef } from "@/lib/checklistTemplate";
import { useTeamHubLang } from "@/app/team-hub/teamHubStrings";
import { crewLinkStrings } from "./strings";
import { BackButton, CenteredMessage, CrewHeader, SentScreen } from "./ui";
import CrewChecklist, { type TabProgress } from "./CrewChecklist";
import CrewSupplies from "./CrewSupplies";
import CrewProblem from "./CrewProblem";

type Modules = { checklist: boolean; supplyOrders: boolean; problemReports: boolean };

type LoadResponse = {
  success?: boolean;
  error?: string;
  available?: boolean;
  locationName?: string;
  sections?: ChecklistSectionDef[];
  tabs?: ChecklistTabDef[];
  modules?: Modules;
};

type Feature = "checklist" | "supplies" | "problem";
type Screen = "home" | Feature;

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
    if (name) localStorage.setItem(NAME_STORAGE_KEY, name);
    else localStorage.removeItem(NAME_STORAGE_KEY);
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
  const [tabs, setTabs] = useState<ChecklistTabDef[]>([]);
  // Older API responses (before Crew Link) had no modules — treat as checklist-only.
  const [modules, setModules] = useState<Modules>({ checklist: true, supplyOrders: false, problemReports: false });

  const [name, setName] = useState<string | null>(null); // null = not read from the phone yet
  const [nameDraft, setNameDraft] = useState("");
  const [screen, setScreen] = useState<Screen>("home");
  const [sent, setSent] = useState(false);

  // Checklist progress per tab lives here so switching tabs, or going home
  // and back, never loses checks that haven't been sent yet.
  const [activeTabId, setActiveTabId] = useState<number | null>(null);
  const [progressByTab, setProgressByTab] = useState<Record<number, TabProgress>>({});

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
        const response = await fetch(`/api/porter-checklist?code=${encodeURIComponent(code)}`, { cache: "no-store" });
        const data = (await response.json()) as LoadResponse;
        if (!response.ok || data.success === false) {
          throw new Error(data.error ?? "Could not load this link.");
        }
        if (cancelled) return;
        setAvailable(Boolean(data.available));
        setLocationName(data.locationName ?? "");
        // Older API responses (before tabs) had only `sections` — one tab.
        setTabs(data.tabs ?? [{ id: 0, name: "", sections: data.sections ?? [] }]);
        if (data.modules) setModules(data.modules);
      } catch (err) {
        if (!cancelled) setLoadError(err instanceof Error ? err.message : "Could not load this link.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [code]);

  const features: Feature[] = [
    ...(modules.checklist ? (["checklist"] as const) : []),
    ...(modules.supplyOrders ? (["supplies"] as const) : []),
    ...(modules.problemReports ? (["problem"] as const) : []),
  ];
  const onlyFeature = features.length === 1 ? features[0] : null;
  const rootScreen: Screen = onlyFeature ?? "home";
  const currentScreen: Screen = onlyFeature ?? screen;

  if (loading || name === null) return <CenteredMessage title={s.loading} />;
  if (loadError || !available || features.length === 0) {
    return <CenteredMessage title={s.unavailableTitle} body={loadError || s.unavailableBody} />;
  }

  function goToStart() {
    setSent(false);
    setScreen(rootScreen);
    window.scrollTo({ top: 0 });
  }

  function open(feature: Feature) {
    setScreen(feature);
    window.scrollTo({ top: 0 });
  }

  function saveName() {
    const trimmed = nameDraft.trim().slice(0, 80);
    if (!trimmed) return;
    storeName(trimmed);
    setName(trimmed);
    setNameDraft("");
  }

  function changeName() {
    storeName("");
    setName("");
    setNameDraft("");
  }

  const header = (
    <CrewHeader s={s} lang={lang} onLangChange={setLang} locationName={locationName}>
      {name ? (
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
          <p className="text-xl font-semibold">{s.hi(name)}</p>
          <button type="button" onClick={changeName} className="min-h-[44px] text-lg font-semibold text-blue-100 underline">
            {s.notYou}
          </button>
        </div>
      ) : null}
    </CrewHeader>
  );

  // Step 1, only once per phone: the name.
  if (!name) {
    return (
      <main className="min-h-screen bg-slate-100 px-4 py-4">
        <div className="mx-auto max-w-xl space-y-4">
          {header}
          <label className="block rounded-3xl bg-white p-5 shadow-sm">
            <span className="text-2xl font-black text-slate-900">{s.whatsYourName}</span>
            <input
              value={nameDraft}
              onChange={(event) => setNameDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") saveName();
              }}
              autoComplete="name"
              autoFocus
              maxLength={80}
              className="mt-3 min-h-[64px] w-full rounded-2xl border-2 border-slate-300 px-4 text-2xl font-semibold outline-none focus:border-blue-600"
            />
          </label>
          <button
            type="button"
            onClick={saveName}
            disabled={!nameDraft.trim()}
            className="min-h-[72px] w-full rounded-3xl bg-green-600 text-2xl font-black text-white shadow-lg active:bg-green-700 disabled:bg-slate-300 disabled:text-slate-500 disabled:shadow-none"
          >
            {s.next} →
          </button>
        </div>
      </main>
    );
  }

  const checklistTabId = activeTabId ?? tabs[0]?.id ?? 0;

  return (
    <main className="min-h-screen bg-slate-100 px-4 py-4">
      <div className="mx-auto max-w-xl space-y-4">
        {header}

        {currentScreen !== rootScreen ? <BackButton label={s.back} onClick={goToStart} /> : null}

        {currentScreen === "home" ? (
          <div className="grid gap-4">
            {features.map((feature) => (
              <button
                key={feature}
                type="button"
                onClick={() => open(feature)}
                className="flex min-h-[120px] items-center gap-5 rounded-3xl bg-white px-6 text-left text-3xl font-black text-slate-900 shadow-sm active:bg-gray-100"
              >
                <span className="text-6xl" aria-hidden="true">
                  {feature === "checklist" ? "✅" : feature === "supplies" ? "📦" : "⚠️"}
                </span>
                {feature === "checklist" ? s.checklist : feature === "supplies" ? s.supplies : s.problem}
              </button>
            ))}
          </div>
        ) : null}

        {currentScreen === "checklist" ? (
          <CrewChecklist
            code={code}
            s={s}
            name={name}
            tabs={tabs}
            activeTabId={checklistTabId}
            onSelectTab={(tabId) => {
              setActiveTabId(tabId);
              window.scrollTo({ top: 0 });
            }}
            progressByTab={progressByTab}
            onProgressChange={(tabId, next) => setProgressByTab((prev) => ({ ...prev, [tabId]: next }))}
            onSent={(tabId) => {
              setProgressByTab((prev) => {
                const next = { ...prev };
                delete next[tabId];
                return next;
              });
              setSent(true);
            }}
          />
        ) : null}

        {currentScreen === "supplies" ? (
          <CrewSupplies
            key={sent ? "sent" : "open"}
            apiBase={`/api/porter-checklist/${encodeURIComponent(code)}`}
            s={s}
            name={name}
            onSent={() => setSent(true)}
          />
        ) : null}

        {currentScreen === "problem" ? (
          <CrewProblem
            key={sent ? "sent" : "open"}
            apiBase={`/api/porter-checklist/${encodeURIComponent(code)}`}
            s={s}
            lang={lang}
            name={name}
            onSent={() => setSent(true)}
          />
        ) : null}
      </div>

      {sent ? <SentScreen s={s} onDone={goToStart} /> : null}
    </main>
  );
}
