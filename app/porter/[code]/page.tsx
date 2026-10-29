"use client";

// Crew Link (docs/crew-link-spec.md) — the one public link a crew opens on
// their phone. Built to be as simple as possible: a home screen with up to
// three huge buttons (Checklist / Supplies / Problem — only the ones
// switched on), under the giant "Send photos" (CrewPhotos.tsx, always there). A link with just one of them skips the home screen. Every
// form starts with "Your name" (required, prefilled with the last name used
// on this phone) and today's date/time. Every Send ends on a full-screen
// green "Sent!" with one "Back to start" button. Crews only ever see the
// building name — nothing else about the account.
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { isRouteTab, type ChecklistSectionDef, type ChecklistTabDef } from "@/lib/checklistTemplate";
import type { NightNote } from "@/lib/checklistDb";
import type { ContentTranslations } from "@/lib/translationKey";
import { useTeamHubLang } from "@/app/team-hub/teamHubStrings";
import { crewLinkStrings } from "./strings";
import { BackButton, CenteredMessage, CrewHeader, SentScreen } from "./ui";
import CrewChecklist, { type TabProgress } from "./CrewChecklist";
import CrewSupplies from "./CrewSupplies";
import CrewProblem from "./CrewProblem";
import CrewArrived from "./CrewArrived";
import CrewEmpty from "./CrewEmpty";
import CrewPhotos from "./CrewPhotos";
import CrewRoute, { ROUTE_WORDS, sentTodayOnThisPhone } from "./CrewRoute";
import { usePhotoQueue } from "./photo-queue";
import { PreviewNotSentScreen, useCrewLinkPreview } from "./preview";

type Modules = { checklist: boolean; supplyOrders: boolean; problemReports: boolean };

type LoadResponse = {
  success?: boolean;
  error?: string;
  available?: boolean;
  locationName?: string;
  sections?: ChecklistSectionDef[];
  tabs?: ChecklistTabDef[];
  modules?: Modules;
  // ES/PT for tab names, sections and items (English when missing).
  translations?: ContentTranslations;
  /** "Supplies arrived" and "Case empty" are here (migration 038, supply orders on). */
  shelves?: boolean;
  /** "Supplies arrived" alone: supply orders on, or something on its way to this site. */
  arrived?: boolean;
  /** Route tabs: today's note from the day porter. */
  nightNote?: NightNote | null;
};

type Feature = "checklist" | "supplies" | "problem" | "arrived" | "empty";

const FEATURE_ICON: Record<Feature, string> = { checklist: "✅", supplies: "🛒", problem: "⚠️", arrived: "📦", empty: "🗑" };
type Screen = "home" | Feature;

/** A start-screen button's words in one language. */
function featureLabel(strings: ReturnType<typeof crewLinkStrings>, feature: Feature): string {
  return feature === "checklist" ? strings.checklist : feature === "supplies" ? strings.supplies : feature === "problem" ? strings.problem : feature === "arrived" ? strings.arrived : strings.caseEmpty;
}

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
  // Set only on the admin "See what the crew sees" page (./preview.tsx).
  const preview = useCrewLinkPreview();
  const s = crewLinkStrings(lang);

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [available, setAvailable] = useState(false);
  const [locationName, setLocationName] = useState("");
  const [tabs, setTabs] = useState<ChecklistTabDef[]>([]);
  const [translations, setTranslations] = useState<ContentTranslations>({});
  // Older API responses (before Crew Link) had no modules — treat as checklist-only.
  const [modules, setModules] = useState<Modules>({ checklist: true, supplyOrders: false, problemReports: false });
  const [shelves, setShelves] = useState(false);
  const [nightNote, setNightNote] = useState<NightNote | null>(null);
  // The one photo sender for the page: "Send photos" and the route rows' cameras.
  const queue = usePhotoQueue(preview ? "" : code);
  const [arrived, setArrived] = useState(false);

  const [name, setName] = useState<string | null>(null); // null = not read from the phone yet
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
        setShelves(data.shelves === true);
        setArrived(data.arrived === true || data.shelves === true);
        setTranslations(data.translations ?? {});
        setNightNote(data.nightNote ?? null);
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
    ...(arrived ? (["arrived"] as const) : []),
    ...(shelves ? (["empty"] as const) : []),
  ];
  // Route links (every checklist tab is a route tab): the start screen is one
  // giant button per tab, both languages, no language switch, no "Send photos".
  const routeMode = modules.checklist && tabs.length > 0 && tabs.every(isRouteTab);
  const onlyFeature = features.length === 1 && !routeMode ? features[0] : null;
  const rootScreen: Screen = onlyFeature ?? "home";
  const currentScreen: Screen = onlyFeature ?? screen;

  if (loading || name === null) return <CenteredMessage title={s.loading} />;
  if (loadError || !available || features.length === 0) {
    // Server messages are English-only — other languages get the plain line.
    return <CenteredMessage title={s.unavailableTitle} body={lang === "en" && loadError ? loadError : s.unavailableBody} />;
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

  // Remember the name on this phone only once something is actually sent.
  function markSent() {
    if (!preview) storeName((name ?? "").trim().slice(0, 80));
    setSent(true);
  }

  const header = <CrewHeader s={s} lang={lang} onLangChange={setLang} locationName={locationName} hideLang={routeMode} />;

  // Route links ask the name once, first, and the phone remembers it.
  if (routeMode && !name.trim()) {
    return (
      <main className="min-h-screen bg-slate-100 px-4 py-4">
        <div className="mx-auto max-w-xl space-y-4">
          {header}
          <RouteNameScreen
            onDone={(typed) => {
              setName(typed);
              if (!preview) storeName(typed);
            }}
          />
        </div>
      </main>
    );
  }

  const sentToday = routeMode && !preview ? sentTodayOnThisPhone(code) : [];
  const activeRouteTab = tabs.find((t) => t.id === activeTabId) ?? tabs[0];

  const checklistTabId = activeTabId ?? tabs[0]?.id ?? 0;

  return (
    <main className="min-h-screen bg-slate-100 px-4 py-4">
      <div className="mx-auto max-w-xl space-y-4">
        {header}

        {currentScreen !== rootScreen ? <BackButton label={routeMode ? ROUTE_WORDS.back : s.back} onClick={goToStart} /> : null}

        {/* Send photos: first thing on the start screen. Always mounted, so the sending never stops and its status shows on every screen. */}
        {(
          <CrewPhotos
            showButton={currentScreen === rootScreen && !routeMode}
            queue={queue}
            s={s}
            lang={lang}
            name={name}
            onNameChange={setName}
            onNameUsed={() => storeName(name.trim().slice(0, 80))}
            preview={preview ? () => setSent(true) : undefined}
          />
        )}

        {currentScreen === "home" && routeMode ? (
          <div className="grid gap-4">
            {tabs.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => {
                  setActiveTabId(t.id);
                  open("checklist");
                }}
                className="flex min-h-[120px] items-center justify-between gap-3 rounded-3xl bg-white px-6 text-left text-3xl font-black leading-tight text-slate-900 shadow-sm active:bg-gray-100"
              >
                <span>{t.name}</span>
                {sentToday.includes(t.id) ? <span className="shrink-0 rounded-2xl bg-green-600 px-3 py-2 text-lg font-black text-white">✓ {ROUTE_WORDS.sentToday}</span> : null}
              </button>
            ))}
          </div>
        ) : null}

        {currentScreen === "home" ? (
          <div className="grid gap-4">
            {features.filter((feature) => !(routeMode && feature === "checklist")).map((feature) => (
              <button
                key={feature}
                type="button"
                onClick={() => open(feature)}
                className="flex min-h-[120px] items-center gap-5 rounded-3xl bg-white px-6 text-left text-3xl font-black text-slate-900 shadow-sm active:bg-gray-100"
              >
                <span className="text-6xl" aria-hidden="true">
                  {FEATURE_ICON[feature]}
                </span>
                {routeMode ? (
                  // Route links have no language switch: English with the Spanish under it.
                  <span className="min-w-0 leading-tight">
                    <span className="block">{featureLabel(crewLinkStrings("en"), feature)}</span>
                    <span className="mt-1 block text-xl font-bold text-slate-600">{featureLabel(crewLinkStrings("es"), feature)}</span>
                  </span>
                ) : (
                  featureLabel(s, feature)
                )}
              </button>
            ))}
          </div>
        ) : null}

        {currentScreen === "checklist" && routeMode && activeRouteTab ? (
          <CrewRoute
            key={activeRouteTab.id}
            code={code}
            tab={activeRouteTab}
            name={name}
            onNameChange={setName}
            translations={translations}
            nightNote={nightNote}
            queue={queue}
            preview={Boolean(preview)}
            onSent={markSent}
          />
        ) : null}

        {currentScreen === "checklist" && !routeMode ? (
          <CrewChecklist
            code={code}
            s={s}
            lang={lang}
            name={name}
            onNameChange={setName}
            tabs={tabs}
            translations={translations}
            nightNote={nightNote}
            queue={queue}
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
              markSent();
            }}
          />
        ) : null}

        {currentScreen === "supplies" ? (
          <CrewSupplies
            key={sent ? "sent" : "open"}
            apiBase={`/api/porter-checklist/${encodeURIComponent(code)}`}
            s={s}
            lang={lang}
            name={name}
            onNameChange={setName}
            onSent={markSent}
          />
        ) : null}

        {currentScreen === "arrived" ? (
          <CrewArrived
            key={sent ? "sent" : "open"}
            apiBase={`/api/porter-checklist/${encodeURIComponent(code)}`}
            s={s}
            lang={lang}
            name={name}
            onNameChange={setName}
            onSent={markSent}
          />
        ) : null}

        {currentScreen === "empty" ? <CrewEmpty apiBase={`/api/porter-checklist/${encodeURIComponent(code)}`} s={s} lang={lang} name={name} onNameChange={setName} /> : null}

        {currentScreen === "problem" ? (
          <CrewProblem
            key={sent ? "sent" : "open"}
            apiBase={`/api/porter-checklist/${encodeURIComponent(code)}`}
            s={s}
            lang={lang}
            name={name}
            onNameChange={setName}
            onSent={markSent}
          />
        ) : null}
      </div>

      {sent ? (
        preview ? (
          <PreviewNotSentScreen onDone={goToStart} onClose={preview.onClose} />
        ) : (
          <SentScreen s={s} onDone={goToStart} title={routeMode ? ROUTE_WORDS.sent : undefined} button={routeMode ? ROUTE_WORDS.backToStart : undefined} />
        )
      ) : null}
    </main>
  );
}

/** Route links: the name, once, before anything else. */
function RouteNameScreen({ onDone }: { onDone: (name: string) => void }) {
  const [typed, setTyped] = useState("");
  const clean = typed.trim().slice(0, 80);
  return (
    <form
      className="space-y-4 rounded-3xl bg-white p-5 shadow-sm"
      onSubmit={(event) => {
        event.preventDefault();
        if (clean) onDone(clean);
      }}
    >
      <label className="block">
        <span className="text-3xl font-black text-slate-900">👤 {ROUTE_WORDS.yourName}</span>
        <input
          value={typed}
          onChange={(event) => setTyped(event.target.value)}
          autoComplete="name"
          maxLength={80}
          className="mt-3 min-h-[72px] w-full rounded-2xl border-4 border-slate-300 px-4 text-3xl font-bold outline-none focus:border-blue-600"
        />
      </label>
      <button type="submit" disabled={!clean} className="min-h-[88px] w-full rounded-3xl bg-green-600 text-4xl font-black text-white shadow-lg active:bg-green-700 disabled:bg-slate-300 disabled:text-slate-500">
        {ROUTE_WORDS.ok}
      </button>
    </form>
  );
}
