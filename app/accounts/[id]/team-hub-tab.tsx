"use client";

// Simplicity pass rewrite (docs/team-hub-spec.md "GLOBAL RULES" + "ADMIN"):
// first-time setup is now a single-screen, 3-numbered-step wizard with
// everything prefilled (crews as checkboxes, sub auto-filled, workers by
// first name only, one "Text invite" button per worker). Once any crew
// exists, the tab shows a one-line-per-crew summary with a "Customize"
// toggle that reveals the original Phase 0/1 editor (module toggles, item
// pickers, regenerate link, reset PIN, deactivate) — that editor's code is
// otherwise unchanged from before this pass, just re-homed under
// Customize instead of always being visible.
import { useEffect, useState, useCallback } from "react";
import TranslatedText from "../../components/TranslatedText";
import { formatCrewDateTime } from "@/lib/crewDateTime";

type TeamHubSite = {
  id: number;
  accountId: string;
  label: string;
  supervisorPhone: string | null;
  active: boolean;
  createdAt: string;
  nightChecklistCutoffTime: string | null;
  nightChecklistServiceDays: number[] | null;
};

type TeamHubCrew = {
  id: number;
  siteId: number;
  name: string;
  crewType: "porter" | "night" | "other";
  crewKind: "sub" | "inhouse";
  subId: string | null;
  token: string;
  tokenVersion: number;
  active: boolean;
  revokedAt: string | null;
};

type TeamHubModule = "checklist" | "rounds" | "handoff" | "requests" | "supplies" | "issues";
const TEAM_HUB_MODULES: TeamHubModule[] = ["checklist", "rounds", "handoff", "requests", "supplies", "issues"];

type LibraryItem = { id: number; area?: string; name?: string; text?: string; active: boolean };

type CrewItem = {
  id: number;
  crewId: number;
  itemType: "checklist" | "round" | "supply";
  itemId: number;
  enabled: boolean;
};

type TeamHubWorker = {
  id: number;
  crewId: number;
  firstName: string;
  active: boolean;
  failedAttempts: number;
  lockedUntil: string | null;
  lastSignInAt: string | null;
  lastDevice: string | null;
};

type AssignedSub = { status: "matched"; subId: string; subName: string } | { status: "unmatched"; options: { subId: string; name: string }[] };

// Which modules + library items each wizard crew type gets automatically —
// see docs/team-hub-spec.md "ADMIN" for the source of these defaults.
const CREW_TYPE_LABELS: Record<"porter" | "night", string> = { porter: "Day porter", night: "Night crew" };
const CREW_TYPE_MODULES: Record<"porter" | "night", TeamHubModule[]> = {
  porter: ["rounds", "handoff", "supplies", "issues"],
  night: ["checklist", "handoff", "issues"],
};

function generatePin(): string {
  const bytes = new Uint8Array(2);
  crypto.getRandomValues(bytes);
  const num = (bytes[0] * 256 + bytes[1]) % 10000;
  return String(num).padStart(4, "0");
}

function buildInviteText(firstName: string, siteLabel: string, link: string, pin: string): string {
  return (
    `Hi ${firstName}, here's your Team Hub for ${siteLabel}: ${link}\n` +
    `Tap the link, pick your name, and enter your PIN: ${pin}\n\n` +
    `Hola ${firstName}, aquí está tu Team Hub para ${siteLabel}: ${link}\n` +
    `Toca el enlace, elige tu nombre, y escribe tu PIN: ${pin}`
  );
}

export default function AccountTeamHubTab({ accountId, accountName }: { accountId: string; accountName: string }) {
  const [loading, setLoading] = useState(true);
  const [site, setSite] = useState<TeamHubSite | null>(null);
  const [assignedSub, setAssignedSub] = useState<AssignedSub | null>(null);
  const [crews, setCrews] = useState<TeamHubCrew[]>([]);
  const [error, setError] = useState("");
  const [wizardDone, setWizardDone] = useState(false);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const siteRes = await fetch(`/api/admin/team-hub/sites?accountId=${encodeURIComponent(accountId)}`, { cache: "no-store" });
      const siteData = await siteRes.json();
      const loadedSite: TeamHubSite | null = siteData.site ?? null;
      setSite(loadedSite);
      setAssignedSub(siteData.assignedSub ?? null);

      if (loadedSite) {
        const crewsRes = await fetch(`/api/admin/team-hub/crews?siteId=${loadedSite.id}`, { cache: "no-store" });
        const crewsData = await crewsRes.json();
        setCrews(crewsData.crews ?? []);
      } else {
        setCrews([]);
      }
    } catch {
      setError("Failed to load this account's Team Hub.");
    } finally {
      setLoading(false);
    }
  }, [accountId]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleSetSiteActive(active: boolean) {
    if (!site) return;
    try {
      const res = await fetch("/api/admin/team-hub/sites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "setActive", id: site.id, active }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "Failed.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update Team Hub.");
    }
  }

  if (loading) {
    return <p className="rounded-2xl bg-white p-6 text-sm text-slate-500 shadow-sm">Loading Team Hub…</p>;
  }

  if (error && crews.length === 0 && !site) {
    return <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>;
  }

  if (crews.length === 0 && !wizardDone) {
    return (
      <SetupWizard
        accountId={accountId}
        accountName={accountName}
        site={site}
        assignedSub={assignedSub}
        onFinished={() => {
          setWizardDone(true);
          load();
        }}
      />
    );
  }

  if (!site) {
    // Wizard finished but the reload hasn't landed yet (race-safe fallback).
    return <p className="rounded-2xl bg-white p-6 text-sm text-slate-500 shadow-sm">Loading Team Hub…</p>;
  }

  return (
    <div className="space-y-6">
      {error && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>}

      <section className="rounded-2xl bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-slate-900">{site.label}</h2>
            <p className="text-sm text-slate-500">
              {site.supervisorPhone ? `Supervisor: ${site.supervisorPhone}` : "No supervisor phone set"}
            </p>
          </div>
          <span
            className={`rounded-full px-3 py-1 text-xs font-semibold ${
              site.active ? "bg-green-100 text-green-800" : "bg-slate-200 text-slate-600"
            }`}
          >
            {site.active ? "Active" : "Deactivated"}
          </span>
          <button
            type="button"
            onClick={() => handleSetSiteActive(!site.active)}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            {site.active ? "Deactivate Team Hub" : "Reactivate Team Hub"}
          </button>
        </div>
      </section>

      <section className="rounded-2xl bg-white p-5 shadow-sm">
        <h3 className="text-base font-bold text-slate-900">Crews</h3>
        <div className="mt-3 space-y-3">
          {crews.map((crew) => (
            <CrewSummaryRow key={crew.id} site={site} crew={crew} onChanged={load} />
          ))}
        </div>
        <AddAnotherCrew siteId={site.id} onChanged={load} />
      </section>

      {crews.some((c) => c.crewType === "night") && <NightChecklistAlertSettings site={site} onChanged={load} />}

      <OrdersAndProblems site={site} accountId={accountId} accountName={accountName} />

      <SiteActivityFeed siteId={site.id} crews={crews} />
    </div>
  );
}

// ─── Night checklist alert config (Phase 6) ─────────────────────────────

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function NightChecklistAlertSettings({ site, onChanged }: { site: TeamHubSite; onChanged: () => void }) {
  const [open, setOpen] = useState(false);
  const [cutoffTime, setCutoffTime] = useState(site.nightChecklistCutoffTime ?? "21:00");
  const [days, setDays] = useState<Set<number>>(new Set(site.nightChecklistServiceDays ?? [1, 2, 3, 4, 5]));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const enabled = Boolean(site.nightChecklistCutoffTime && site.nightChecklistServiceDays?.length);

  function toggleDay(day: number) {
    setDays((prev) => {
      const next = new Set(prev);
      if (next.has(day)) next.delete(day);
      else next.add(day);
      return next;
    });
  }

  async function save(nextCutoffTime: string | null) {
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/admin/team-hub/sites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "setNightChecklistAlert",
          id: site.id,
          cutoffTime: nextCutoffTime,
          serviceDays: nextCutoffTime ? Array.from(days) : null,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "Failed to save.");
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="rounded-2xl bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-bold text-slate-900">Night checklist alert</h3>
          <p className="text-sm text-slate-500">
            {enabled
              ? `Emails info@/crm@ if the night checklist isn't submitted by ${site.nightChecklistCutoffTime} on ${Array.from(site.nightChecklistServiceDays ?? []).map((d) => WEEKDAY_LABELS[d]).join(", ")}.`
              : "Off — no alert configured for this site."}
          </p>
        </div>
        <button type="button" onClick={() => setOpen((o) => !o)} className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">
          {open ? "Hide" : "Configure"}
        </button>
      </div>

      {open && (
        <div className="mt-4 space-y-3 border-t border-slate-100 pt-4">
          <div className="flex flex-wrap items-center gap-3">
            <label className="text-sm font-semibold text-slate-700">Cutoff time</label>
            <input type="time" value={cutoffTime} onChange={(e) => setCutoffTime(e.target.value)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          </div>
          <div className="flex flex-wrap gap-2">
            {WEEKDAY_LABELS.map((label, day) => (
              <button
                key={day}
                type="button"
                onClick={() => toggleDay(day)}
                className={`rounded-lg border px-3 py-1.5 text-xs font-semibold ${days.has(day) ? "border-blue-600 bg-blue-600 text-white" : "border-slate-300 text-slate-600 hover:bg-slate-50"}`}
              >
                {label}
              </button>
            ))}
          </div>
          {error && <p className="text-sm font-semibold text-red-700">{error}</p>}
          <div className="flex gap-2">
            <button type="button" disabled={saving} onClick={() => save(cutoffTime)} className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800 disabled:opacity-60">
              {saving ? "Saving..." : "Save"}
            </button>
            {enabled && (
              <button type="button" disabled={saving} onClick={() => save(null)} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
                Turn off
              </button>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

// ─── Activity feed (Phase 6) ─────────────────────────────────────────────

type ActivityBase = { id: string; at: string; crewId: number; crewName: string; workerFirstName: string | null; photos: string[] };
type ActivityEvent =
  | (ActivityBase & { kind: "checklist_submitted"; doneCount: number; totalCount: number | null; problemCount: number })
  | (ActivityBase & { kind: "round_check"; roundName: string; note: string })
  | (ActivityBase & {
      kind: "issue_reported";
      category: string;
      status: "open" | "resolved";
      note: string;
      noteEnglish: string | null;
      noteLanguage: string | null;
    })
  | (ActivityBase & {
      kind: "supply_order";
      itemCount: number;
      status: "new" | "ordered" | "delivered" | "cancelled";
      note: string;
      noteEnglish: string | null;
      noteLanguage: string | null;
    });

type ActivityKindFilter = "all" | ActivityEvent["kind"];

const ACTIVITY_KIND_OPTIONS: { value: ActivityKindFilter; label: string }[] = [
  { value: "all", label: "Everything" },
  { value: "checklist_submitted", label: "Checklists" },
  { value: "round_check", label: "Round checks" },
  { value: "issue_reported", label: "Problems" },
  { value: "supply_order", label: "Supply orders" },
];

const ISSUE_CATEGORY_LABELS: Record<string, string> = {
  restroom: "restroom",
  trash: "trash",
  damage: "damage",
  leak: "leak",
  access: "access/lock",
  supplies: "supplies",
  safety: "safety",
  other: "other",
};

const ORDER_STATUS_WORDS: Record<string, string> = { new: "not ordered yet", ordered: "ordered", delivered: "delivered", cancelled: "cancelled" };

// "Night" -> "Night crew", "Night crew" stays as-is.
function crewLabel(crewName: string): string {
  return /crew/i.test(crewName) ? crewName : `${crewName} crew`;
}

// Plain-language line, e.g. "Night crew finished 28 of 30".
function describeActivityEvent(event: ActivityEvent): string {
  const crew = crewLabel(event.crewName);
  const who = event.workerFirstName ? `${event.workerFirstName} (${crew})` : crew;
  switch (event.kind) {
    case "checklist_submitted": {
      const count = event.totalCount !== null ? `${event.doneCount} of ${event.totalCount}` : `${event.doneCount} item${event.doneCount === 1 ? "" : "s"}`;
      const problems = event.problemCount > 0 ? ` — ${event.problemCount} problem${event.problemCount === 1 ? "" : "s"} marked` : "";
      return `${crew} finished ${count}${problems}`;
    }
    case "round_check":
      return `${who} checked ${event.roundName}`;
    case "issue_reported":
      return `${who} reported a ${ISSUE_CATEGORY_LABELS[event.category] ?? event.category} problem — ${event.status === "open" ? "still open" : "resolved"}`;
    case "supply_order":
      return `${who} ordered ${event.itemCount} suppl${event.itemCount === 1 ? "y" : "ies"} — ${ORDER_STATUS_WORDS[event.status] ?? event.status}`;
  }
}

function SiteActivityFeed({ siteId, crews }: { siteId: number; crews: TeamHubCrew[] }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [error, setError] = useState("");
  const [kind, setKind] = useState<ActivityKindFilter>("all");
  const [status, setStatus] = useState<"" | "open" | "closed">("");
  const [crewId, setCrewId] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const params = new URLSearchParams({ siteId: String(siteId) });
    if (kind !== "all") params.set("kind", kind);
    if (status) params.set("status", status);
    if (crewId) params.set("crewId", crewId);
    if (fromDate) params.set("from", fromDate);
    if (toDate) params.set("to", toDate);
    try {
      const res = await fetch(`/api/admin/team-hub/activity?${params.toString()}`, { cache: "no-store" });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "Failed to load activity.");
      setEvents(data.events ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load activity.");
    } finally {
      setLoading(false);
    }
  }, [siteId, kind, status, crewId, fromDate, toDate]);

  // Reload whenever a filter changes while the feed is open.
  useEffect(() => {
    if (open) load();
  }, [open, load]);

  const selectClass = "rounded-lg border border-slate-300 px-2 py-1.5 text-xs text-slate-800";
  const statusApplies = kind === "all" || kind === "issue_reported" || kind === "supply_order";

  return (
    <section className="rounded-2xl bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-bold text-slate-900">Activity</h3>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
        >
          {open ? "Hide" : "Show"}
        </button>
      </div>

      {open && (
        <div className="mt-3">
          <div className="mb-3 flex flex-wrap items-end gap-2">
            <select value={kind} onChange={(e) => setKind(e.target.value as ActivityKindFilter)} className={selectClass} aria-label="Type">
              {ACTIVITY_KIND_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
            {statusApplies && (
              <select value={status} onChange={(e) => setStatus(e.target.value as "" | "open" | "closed")} className={selectClass} aria-label="Status">
                <option value="">Any status</option>
                <option value="open">Open</option>
                <option value="closed">Closed</option>
              </select>
            )}
            {crews.length > 1 && (
              <select value={crewId} onChange={(e) => setCrewId(e.target.value)} className={selectClass} aria-label="Crew">
                <option value="">All crews</option>
                {crews.map((c) => (
                  <option key={c.id} value={String(c.id)}>{c.name}</option>
                ))}
              </select>
            )}
            <label className="text-xs text-slate-500">
              From <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className={selectClass} />
            </label>
            <label className="text-xs text-slate-500">
              To <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className={selectClass} />
            </label>
          </div>
          {status && statusApplies && kind === "all" && (
            <p className="mb-2 text-xs text-slate-500">Status only applies to problems and supply orders, so checklists and round checks are hidden.</p>
          )}

          {loading && <p className="text-sm text-slate-500">Loading...</p>}
          {error && <p className="text-sm font-semibold text-red-700">{error}</p>}
          {!loading && events.length === 0 && !error && <p className="text-sm text-slate-500">No activity matches.</p>}
          <ul className="divide-y divide-slate-100">
            {events.map((event) => (
              <li key={event.id} className="py-2 text-sm">
                <div className="flex items-start justify-between gap-4">
                  <span className="text-slate-700">{describeActivityEvent(event)}</span>
                  <span className="shrink-0 text-xs text-slate-400">{formatCrewDateTime(event.at)}</span>
                </div>
                {(event.kind === "issue_reported" || event.kind === "supply_order") && event.note && (
                  <p className="mt-1 text-xs text-slate-600">
                    <TranslatedText original={event.note} english={event.noteEnglish} language={event.noteLanguage} />
                  </p>
                )}
                {event.kind === "round_check" && event.note && <p className="mt-1 text-xs text-slate-600">{event.note}</p>}
                {event.photos.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {event.photos.map((url) => (
                      <a key={url} href={url} target="_blank" rel="noreferrer">
                        {/* eslint-disable-next-line @next/next/no-img-element -- Vercel Blob URL */}
                        <img src={url} alt="Activity photo" className="h-16 w-16 rounded-lg border border-slate-200 object-cover" />
                      </a>
                    ))}
                  </div>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

// ─── Step 1-3 wizard (first-time setup) ────────────────────────────────────

type WizardWorker = { key: number; firstName: string };
type CreatedInvite = { crewName: string; firstName: string; pin: string; link: string };

function SetupWizard({
  accountId,
  accountName,
  site,
  assignedSub,
  onFinished,
}: {
  accountId: string;
  accountName: string;
  site: TeamHubSite | null;
  assignedSub: AssignedSub | null;
  onFinished: () => void;
}) {
  const [siteLabel, setSiteLabel] = useState(site?.label || accountName);
  const [checked, setChecked] = useState<Record<"porter" | "night", boolean>>({ porter: true, night: true });
  const [subChoice, setSubChoice] = useState<string>(""); // "" = auto/in-house, "inhouse", or a subId
  const [workers, setWorkers] = useState<Record<"porter" | "night", WizardWorker[]>>({
    porter: [{ key: 1, firstName: "" }],
    night: [{ key: 2, firstName: "" }],
  });
  const [nextKey, setNextKey] = useState(3);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const [invites, setInvites] = useState<CreatedInvite[] | null>(null);

  const matched = assignedSub?.status === "matched" ? assignedSub : null;
  const [showPicker, setShowPicker] = useState(assignedSub?.status === "unmatched");

  function toggleCrew(type: "porter" | "night") {
    setChecked((prev) => ({ ...prev, [type]: !prev[type] }));
  }

  function addWorker(type: "porter" | "night") {
    setWorkers((prev) => ({ ...prev, [type]: [...prev[type], { key: nextKey, firstName: "" }] }));
    setNextKey((k) => k + 1);
  }

  function setWorkerName(type: "porter" | "night", key: number, firstName: string) {
    setWorkers((prev) => ({ ...prev, [type]: prev[type].map((w) => (w.key === key ? { ...w, firstName } : w)) }));
  }

  async function handleCreate() {
    const crewTypes = (Object.keys(checked) as ("porter" | "night")[]).filter((t) => checked[t]);
    if (crewTypes.length === 0) {
      setError("Pick at least one crew.");
      return;
    }
    if (!siteLabel.trim()) {
      setError("A site label is required.");
      return;
    }

    setCreating(true);
    setError("");
    try {
      let currentSite = site;
      if (!currentSite) {
        const res = await fetch("/api/admin/team-hub/sites", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "create", accountId, label: siteLabel.trim(), supervisorPhone: null }),
        });
        const data = await res.json();
        if (!res.ok || !data.success) throw new Error(data.error || "Could not create Team Hub.");
        currentSite = data.site;
      }
      if (!currentSite) {
        throw new Error("Could not create Team Hub.");
      }
      const siteId = currentSite.id;

      // subChoice is "" until the admin touches the dropdown (it's only
      // shown at all when unmatched, or after "Change" on a matched sub) —
      // "" means "use whatever's already decided": the matched sub if
      // there is one, in-house otherwise. Any non-empty subChoice is an
      // explicit admin pick and always wins, including "inhouse" itself.
      let crewKind: "sub" | "inhouse" = "inhouse";
      let subId: string | null = null;
      if (subChoice && subChoice !== "inhouse") {
        crewKind = "sub";
        subId = subChoice;
      } else if (!subChoice && matched) {
        crewKind = "sub";
        subId = matched.subId;
      }

      const createdInvites: CreatedInvite[] = [];

      for (const crewType of crewTypes) {
        const crewRes = await fetch("/api/admin/team-hub/crews", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "create",
            siteId,
            name: CREW_TYPE_LABELS[crewType],
            crewType,
            crewKind,
            subId,
          }),
        });
        const crewData = await crewRes.json();
        if (!crewRes.ok || !crewData.success) throw new Error(crewData.error || "Could not create crew.");
        const crew: TeamHubCrew = crewData.crew;

        const libRes = await fetch(`/api/admin/team-hub/crew-items?crewId=${crew.id}`, { cache: "no-store" });
        const libData = await libRes.json();
        const libraries = libData.libraries ?? { checklist: [], rounds: [], supplies: [] };

        const moduleFlags: Partial<Record<TeamHubModule, boolean>> = {};
        for (const m of TEAM_HUB_MODULES) moduleFlags[m] = CREW_TYPE_MODULES[crewType].includes(m);
        await fetch("/api/admin/team-hub/crew-items", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "setModules", crewId: crew.id, modules: moduleFlags }),
        });

        const defaultItems =
          crewType === "night"
            ? (libraries.checklist as LibraryItem[]).map((item, index) => ({ itemType: "checklist", itemId: item.id, enabled: true, sortOrder: index }))
            : (libraries.rounds as LibraryItem[]).map((item, index) => ({ itemType: "round", itemId: item.id, enabled: true, sortOrder: index }));
        if (defaultItems.length > 0) {
          await fetch("/api/admin/team-hub/crew-items", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "setCrewItems", crewId: crew.id, items: defaultItems }),
          });
        }

        const link = `${window.location.origin}/team-hub/${crew.token}`;
        for (const w of workers[crewType]) {
          const firstName = w.firstName.trim();
          if (!firstName) continue;
          const pin = generatePin();
          const workerRes = await fetch("/api/admin/team-hub/workers", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "create", crewId: crew.id, firstName, pin }),
          });
          const workerData = await workerRes.json();
          if (!workerRes.ok || !workerData.success) throw new Error(workerData.error || `Could not add worker "${firstName}".`);
          createdInvites.push({ crewName: CREW_TYPE_LABELS[crewType], firstName, pin, link });
        }
      }

      setInvites(createdInvites);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not finish setup.");
    } finally {
      setCreating(false);
    }
  }

  if (invites) {
    return <SendInvitesStep siteLabel={siteLabel} invites={invites} onDone={onFinished} />;
  }

  return (
    <section className="rounded-2xl bg-white p-5 shadow-sm">
      <h2 className="text-lg font-bold text-slate-900">Set up Team Hub for {accountName}</h2>

      {error && (
        <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>
      )}

      {!site && (
        <div className="mt-4">
          <label className="text-sm font-medium text-slate-700">Site label (crews see only this, never the account name)</label>
          <input
            type="text"
            value={siteLabel}
            onChange={(e) => setSiteLabel(e.target.value)}
            className="mt-1 min-h-[44px] w-full max-w-sm rounded-lg border border-gray-300 px-3 text-sm"
          />
        </div>
      )}

      <div className="mt-6">
        <h3 className="text-sm font-bold text-slate-900">1. Who cleans here?</h3>
        <div className="mt-3 flex flex-wrap gap-3">
          {(["porter", "night"] as const).map((type) => (
            <label
              key={type}
              className={`flex min-h-[56px] cursor-pointer items-center gap-2 rounded-xl border-2 px-4 text-sm font-semibold ${
                checked[type] ? "border-blue-600 bg-blue-50 text-blue-800" : "border-gray-200 text-slate-600"
              }`}
            >
              <input type="checkbox" checked={checked[type]} onChange={() => toggleCrew(type)} className="h-5 w-5" />
              {CREW_TYPE_LABELS[type]}
            </label>
          ))}
        </div>

        <div className="mt-3 text-sm">
          {matched && !showPicker ? (
            <p className="text-slate-600">
              Cleaned by: <span className="font-semibold text-slate-900">{matched.subName}</span>{" "}
              <button type="button" onClick={() => setShowPicker(true)} className="text-xs font-semibold text-blue-700 underline">
                Change
              </button>
            </p>
          ) : (
            <div>
              <p className="text-slate-600">
                {assignedSub?.status === "unmatched" && assignedSub.options.length > 0
                  ? "We couldn't confirm the sub on this account — pick below, or leave as in-house:"
                  : "In-house crew:"}
              </p>
              <select
                value={subChoice}
                onChange={(e) => setSubChoice(e.target.value)}
                className="mt-1 min-h-[44px] w-full max-w-sm rounded-lg border border-gray-300 px-3 text-sm"
              >
                <option value="inhouse">In-house</option>
                {(assignedSub?.status === "unmatched" ? assignedSub.options : []).map((o) => (
                  <option key={o.subId} value={o.subId}>
                    {o.name}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      </div>

      <div className="mt-6">
        <h3 className="text-sm font-bold text-slate-900">2. Add workers</h3>
        <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
          {(["porter", "night"] as const)
            .filter((t) => checked[t])
            .map((type) => (
              <div key={type} className="rounded-xl border border-gray-200 p-3">
                <p className="text-xs font-bold uppercase tracking-wide text-slate-500">{CREW_TYPE_LABELS[type]}</p>
                <div className="mt-2 space-y-2">
                  {workers[type].map((w) => (
                    <input
                      key={w.key}
                      type="text"
                      value={w.firstName}
                      onChange={(e) => setWorkerName(type, w.key, e.target.value)}
                      placeholder="First name"
                      className="min-h-[44px] w-full rounded-lg border border-gray-300 px-3 text-sm"
                    />
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => addWorker(type)}
                  className="mt-2 text-xs font-semibold text-blue-700"
                >
                  + Add another
                </button>
              </div>
            ))}
        </div>
      </div>

      <button
        type="button"
        onClick={handleCreate}
        disabled={creating}
        className="mt-6 min-h-[52px] w-full rounded-lg bg-blue-700 text-base font-semibold text-white disabled:opacity-60 sm:w-auto sm:px-8"
      >
        {creating ? "Setting up…" : "Create Team Hub"}
      </button>
    </section>
  );
}

function SendInvitesStep({ siteLabel, invites, onDone }: { siteLabel: string; invites: CreatedInvite[]; onDone: () => void }) {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  function textInvite(invite: CreatedInvite) {
    const message = buildInviteText(invite.firstName, siteLabel, invite.link, invite.pin);
    if (navigator.share) {
      navigator.share({ text: message }).catch(() => {
        window.open(`sms:?&body=${encodeURIComponent(message)}`);
      });
      return;
    }
    window.open(`sms:?&body=${encodeURIComponent(message)}`);
  }

  function copyInvite(invite: CreatedInvite, key: string) {
    const message = buildInviteText(invite.firstName, siteLabel, invite.link, invite.pin);
    navigator.clipboard?.writeText(message).then(() => {
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 2000);
    });
  }

  return (
    <section className="rounded-2xl bg-white p-5 shadow-sm">
      <h2 className="text-lg font-bold text-slate-900">3. Send invites</h2>
      <p className="mt-1 text-sm text-slate-500">
        Each worker&apos;s PIN is only shown here, once. Text it to them now, or use &quot;Reset PIN&quot; later under Customize.
      </p>

      <div className="mt-4 divide-y divide-gray-100">
        {invites.length === 0 ? (
          <p className="py-3 text-sm text-slate-500">No workers were added.</p>
        ) : (
          invites.map((invite, index) => {
            const key = `${invite.crewName}-${invite.firstName}-${index}`;
            return (
              <div key={key} className="flex flex-wrap items-center justify-between gap-2 py-3">
                <div>
                  <p className="text-sm font-semibold text-slate-900">{invite.firstName}</p>
                  <p className="text-xs text-slate-500">
                    {invite.crewName} · PIN {invite.pin}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => textInvite(invite)}
                    className="rounded-lg bg-blue-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-800"
                  >
                    Text invite
                  </button>
                  <button
                    type="button"
                    onClick={() => copyInvite(invite, key)}
                    className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    {copiedKey === key ? "Copied!" : "Copy"}
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      <button
        type="button"
        onClick={onDone}
        className="mt-6 min-h-[52px] w-full rounded-lg bg-blue-700 text-base font-semibold text-white sm:w-auto sm:px-8"
      >
        Done
      </button>
    </section>
  );
}

// ─── Summary view (after first-time setup) ─────────────────────────────────

type CrewSummary = { checklist: { doneCount: number; totalCount: number; submittedAt: string } | null; rounds: { checkedCount: number; totalCount: number } | null };

function CrewSummaryRow({ site, crew, onChanged }: { site: TeamHubSite; crew: TeamHubCrew; onChanged: () => void }) {
  const [summary, setSummary] = useState<CrewSummary | null>(null);
  const [customizing, setCustomizing] = useState(false);

  useEffect(() => {
    (async () => {
      const res = await fetch(`/api/admin/team-hub/crew-summary?crewId=${crew.id}`, { cache: "no-store" });
      const data = await res.json();
      if (res.ok && data.success) setSummary({ checklist: data.checklist, rounds: data.rounds });
    })();
  }, [crew.id]);

  let statusLine = "No activity yet";
  if (summary?.checklist) {
    statusLine = `Finished ${summary.checklist.doneCount} of ${summary.checklist.totalCount} last visit`;
  } else if (summary?.rounds) {
    statusLine = `${summary.rounds.checkedCount} of ${summary.rounds.totalCount} checks today`;
  }

  return (
    <div className="rounded-xl border border-gray-200 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-slate-900">
            {crew.name}{" "}
            <span
              className={`ml-1 rounded-full px-2 py-0.5 text-xs font-semibold ${
                crew.active ? "bg-green-100 text-green-800" : "bg-slate-200 text-slate-600"
              }`}
            >
              {crew.active ? "Active" : "Revoked"}
            </span>
          </p>
          <p className="text-sm text-slate-500">{statusLine}</p>
        </div>
        <button
          type="button"
          onClick={() => setCustomizing((c) => !c)}
          className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
        >
          {customizing ? "Hide" : "Customize"}
        </button>
      </div>

      {customizing && <CrewCustomize site={site} crew={crew} onChanged={onChanged} />}
    </div>
  );
}

function CrewCustomize({ site, crew, onChanged }: { site: TeamHubSite; crew: TeamHubCrew; onChanged: () => void }) {
  const [copied, setCopied] = useState(false);

  async function handleSetActive() {
    await fetch("/api/admin/team-hub/crews", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "setActive", id: crew.id, active: !crew.active }),
    });
    onChanged();
  }

  async function handleRegenerate() {
    await fetch("/api/admin/team-hub/crews", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "regenerateToken", id: crew.id }),
    });
    onChanged();
  }

  function handleCopy() {
    const url = `${window.location.origin}/team-hub/${crew.token}`;
    navigator.clipboard?.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div className="mt-3 space-y-3 border-t border-gray-100 pt-3">
      <p className="text-xs text-slate-500">
        {crew.crewType} · {crew.crewKind === "sub" ? `sub ${crew.subId}` : "in-house"} · site: {site.label}
      </p>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={handleCopy} className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">
          {copied ? "Copied!" : "Copy Link"}
        </button>
        <button type="button" onClick={handleRegenerate} className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">
          Regenerate Link
        </button>
        <button type="button" onClick={handleSetActive} className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">
          {crew.active ? "Revoke" : "Reactivate"}
        </button>
      </div>

      <WorkersSetup crewId={crew.id} />
      <VisibilitySetup crewId={crew.id} />
    </div>
  );
}

function AddAnotherCrew({ siteId, onChanged }: { siteId: number; onChanged: () => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [crewType, setCrewType] = useState<TeamHubCrew["crewType"]>("other");
  const [crewKind, setCrewKind] = useState<TeamHubCrew["crewKind"]>("inhouse");
  const [subId, setSubId] = useState("");
  const [creating, setCreating] = useState(false);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    try {
      setCreating(true);
      const res = await fetch("/api/admin/team-hub/crews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "create", siteId, name: name.trim(), crewType, crewKind, subId: crewKind === "sub" ? subId.trim() : null }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "Could not create crew.");
      setName("");
      setSubId("");
      setOpen(false);
      onChanged();
    } catch {
      // Retryable, low-stakes action — no separate error UI needed here.
    } finally {
      setCreating(false);
    }
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="mt-4 text-sm font-semibold text-blue-700">
        + Add another crew
      </button>
    );
  }

  return (
    <form onSubmit={handleCreate} className="mt-4 grid grid-cols-1 gap-3 rounded-xl border border-gray-200 p-4 sm:grid-cols-4">
      <input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Crew name"
        required
        className="min-h-[44px] rounded-lg border border-gray-300 px-3 text-sm sm:col-span-2"
      />
      <select value={crewType} onChange={(e) => setCrewType(e.target.value as TeamHubCrew["crewType"])} className="min-h-[44px] rounded-lg border border-gray-300 px-3 text-sm">
        <option value="porter">Porter</option>
        <option value="night">Night</option>
        <option value="other">Other</option>
      </select>
      <select value={crewKind} onChange={(e) => setCrewKind(e.target.value as TeamHubCrew["crewKind"])} className="min-h-[44px] rounded-lg border border-gray-300 px-3 text-sm">
        <option value="inhouse">In-house</option>
        <option value="sub">Subcontractor</option>
      </select>
      {crewKind === "sub" && (
        <input
          type="text"
          value={subId}
          onChange={(e) => setSubId(e.target.value)}
          placeholder="Sub ID"
          required
          className="min-h-[44px] rounded-lg border border-gray-300 px-3 text-sm sm:col-span-2"
        />
      )}
      <div className="flex gap-2 sm:col-span-4">
        <button type="submit" disabled={creating} className="min-h-[44px] rounded-lg bg-blue-700 px-5 text-sm font-semibold text-white disabled:opacity-60">
          {creating ? "Adding…" : "Add Crew"}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="min-h-[44px] rounded-lg border border-slate-300 px-5 text-sm font-semibold text-slate-700">
          Cancel
        </button>
      </div>
    </form>
  );
}

// ─── Orders & Problems (Phase 4) ────────────────────────────────────────

type SupplyOrderLine = { itemName: string; unit: string; qty: number };
type SupplyOrder = {
  id: number;
  status: "new" | "ordered" | "delivered" | "cancelled";
  note: string;
  noteEnglish: string | null;
  noteLanguage: string | null;
  workerFirstName: string | null;
  createdAt: string;
  lines: SupplyOrderLine[];
  // Crew Link write-in ("Other supplies not on the list").
  otherItems: string | null;
};

type Issue = {
  id: number;
  category: string;
  note: string;
  noteEnglish: string | null;
  noteLanguage: string | null;
  status: "open" | "resolved";
  runId: number | null;
  workerFirstName: string | null;
  complaintId: string | null;
  createdAt: string;
  photos: string[];
};

const ORDER_STATUS_STYLES: Record<SupplyOrder["status"], string> = {
  new: "bg-blue-100 text-blue-800",
  ordered: "bg-amber-100 text-amber-800",
  delivered: "bg-green-100 text-green-800",
  cancelled: "bg-slate-200 text-slate-600",
};

// Used for a Team Hub site (site) and, on the account page's Crew Link
// section, for that account's Crew Link rows (crewLinkAccountId) — same
// one-tap status, photos, English-first notes and "Promote to complaint".
export function OrdersAndProblems({
  site,
  crewLinkAccountId,
  accountId,
  accountName,
}: {
  site?: TeamHubSite;
  crewLinkAccountId?: string;
  accountId: string;
  accountName: string;
}) {
  const [orders, setOrders] = useState<SupplyOrder[]>([]);
  const [issues, setIssues] = useState<Issue[]>([]);
  const [loading, setLoading] = useState(true);
  const query = site ? `siteId=${site.id}` : `crewLinkAccountId=${encodeURIComponent(crewLinkAccountId ?? "")}`;
  const sourceLabel = site ? "Team Hub" : "Crew Link";

  const load = useCallback(async () => {
    const [ordersRes, issuesRes] = await Promise.all([
      fetch(`/api/admin/team-hub/supply-orders?${query}`, { cache: "no-store" }),
      fetch(`/api/admin/team-hub/issues?${query}`, { cache: "no-store" }),
    ]);
    const ordersData = await ordersRes.json();
    const issuesData = await issuesRes.json();
    setOrders(ordersData.orders ?? []);
    setIssues(issuesData.issues ?? []);
    setLoading(false);
  }, [query]);

  useEffect(() => {
    // Initial data load, same pattern used elsewhere in this file.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  async function setOrderStatus(id: number, status: SupplyOrder["status"]) {
    await fetch("/api/admin/team-hub/supply-orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status }),
    });
    await load();
  }

  async function setIssueStatus(id: number, status: Issue["status"]) {
    await fetch("/api/admin/team-hub/issues", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "setStatus", id, status }),
    });
    await load();
  }

  if (loading) return null;
  if (orders.length === 0 && issues.length === 0) return null;

  return (
    <section className="rounded-2xl bg-white p-5 shadow-sm space-y-5">
      <div>
        <h3 className="text-base font-bold text-slate-900">Supply orders</h3>
        {orders.length === 0 ? (
          <p className="mt-2 text-sm text-slate-500">No orders yet.</p>
        ) : (
          <div className="mt-2 divide-y divide-gray-100">
            {orders.map((order) => (
              <div key={order.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                <div>
                  {order.lines.length > 0 && (
                    <p className="text-sm text-slate-800">{order.lines.map((l) => `${l.itemName} x${l.qty}`).join(", ")}</p>
                  )}
                  {order.otherItems && (
                    <p className="mt-0.5 rounded-md bg-amber-50 px-2 py-1 text-sm text-amber-900">
                      <span className="font-bold">Other supplies:</span> {order.otherItems}
                    </p>
                  )}
                  <p className="text-xs text-slate-500">
                    {order.workerFirstName ?? "Unknown"} · {formatCrewDateTime(order.createdAt)}
                    {order.note ? (
                      <>
                        {" · "}
                        <TranslatedText original={order.note} english={order.noteEnglish} language={order.noteLanguage} />
                      </>
                    ) : null}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${ORDER_STATUS_STYLES[order.status]}`}>{order.status}</span>
                  {order.status === "new" && (
                    <button type="button" onClick={() => setOrderStatus(order.id, "ordered")} className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">
                      Mark Ordered
                    </button>
                  )}
                  {order.status === "ordered" && (
                    <button type="button" onClick={() => setOrderStatus(order.id, "delivered")} className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">
                      Mark Delivered
                    </button>
                  )}
                  {(order.status === "new" || order.status === "ordered") && (
                    <button type="button" onClick={() => setOrderStatus(order.id, "cancelled")} className="text-xs font-semibold text-slate-400 hover:text-slate-600">
                      Cancel
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div>
        <h3 className="text-base font-bold text-slate-900">Problems reported</h3>
        {issues.length === 0 ? (
          <p className="mt-2 text-sm text-slate-500">No problems reported.</p>
        ) : (
          <div className="mt-2 divide-y divide-gray-100">
            {issues.map((issue) => (
              <IssueRow
                key={issue.id}
                issue={issue}
                accountId={accountId}
                accountName={accountName}
                sourceLabel={sourceLabel}
                onSetStatus={setIssueStatus}
                onChanged={load}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function IssueRow({
  issue,
  accountId,
  accountName,
  sourceLabel,
  onSetStatus,
  onChanged,
}: {
  issue: Issue;
  accountId: string;
  accountName: string;
  sourceLabel: string;
  onSetStatus: (id: number, status: Issue["status"]) => void;
  onChanged: () => void;
}) {
  const [complaintDraft, setComplaintDraft] = useState("");
  const [saving, setSaving] = useState(false);

  async function saveComplaintId() {
    if (!complaintDraft.trim()) return;
    setSaving(true);
    await fetch("/api/admin/team-hub/issues", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "setComplaintId", id: issue.id, complaintId: complaintDraft.trim() }),
    });
    setSaving(false);
    setComplaintDraft("");
    onChanged();
  }

  const promoteUrl = `/complaints/new?accountId=${encodeURIComponent(accountId)}&accountName=${encodeURIComponent(accountName)}&issue=${encodeURIComponent(
    `[${sourceLabel}] ${issue.category}: ${issue.noteEnglish || issue.note}`
  )}`;

  return (
    <div className="py-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-sm font-semibold capitalize text-slate-900">
            {issue.category}
            {issue.runId ? <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-500">during a checklist run</span> : null}
          </p>
          {issue.note && <p className="text-sm text-slate-700"><TranslatedText original={issue.note} english={issue.noteEnglish} language={issue.noteLanguage} /></p>}
          <p className="text-xs text-slate-500">
            {issue.workerFirstName ?? "Unknown"} · {formatCrewDateTime(issue.createdAt)}
          </p>
        </div>
        <span
          className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${
            issue.status === "open" ? "bg-red-100 text-red-800" : "bg-green-100 text-green-800"
          }`}
        >
          {issue.status}
        </span>
      </div>

      {issue.photos.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-2">
          {issue.photos.map((url) => (
            <a key={url} href={url} target="_blank" rel="noopener noreferrer">
              {/* eslint-disable-next-line @next/next/no-img-element -- remote
                  Vercel Blob thumbnails, one-off admin view, not worth
                  next/image's loader config for this. */}
              <img src={url} alt="" className="h-16 w-16 rounded-lg object-cover" />
            </a>
          ))}
        </div>
      )}

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => onSetStatus(issue.id, issue.status === "open" ? "resolved" : "open")}
          className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
        >
          {issue.status === "open" ? "Resolve" : "Reopen"}
        </button>

        {issue.complaintId ? (
          <span className="text-xs text-slate-500">Complaint: {issue.complaintId}</span>
        ) : (
          <>
            <a href={promoteUrl} target="_blank" rel="noopener noreferrer" className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">
              Promote to complaint
            </a>
            <input
              type="text"
              value={complaintDraft}
              onChange={(e) => setComplaintDraft(e.target.value)}
              placeholder="Paste complaint ID"
              className="min-h-[32px] w-40 rounded-lg border border-gray-300 px-2 text-xs"
            />
            <button
              type="button"
              onClick={saveComplaintId}
              disabled={saving || !complaintDraft.trim()}
              className="rounded-lg bg-blue-700 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
            >
              Save
            </button>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Workers + Visibility editors (Phase 0/1, unchanged by this pass) ─────

function WorkersSetup({ crewId }: { crewId: number }) {
  const [loading, setLoading] = useState(true);
  const [workers, setWorkers] = useState<TeamHubWorker[]>([]);
  const [error, setError] = useState("");

  const [newFirstName, setNewFirstName] = useState("");
  const [newPin, setNewPin] = useState("");
  const [creating, setCreating] = useState(false);

  const [pinDrafts, setPinDrafts] = useState<Record<number, string>>({});

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/admin/team-hub/workers?crewId=${crewId}`, { cache: "no-store" });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "Failed to load workers.");
      setWorkers(data.workers ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load workers.");
    } finally {
      setLoading(false);
    }
  }, [crewId]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!newFirstName.trim() || !/^\d{4,6}$/.test(newPin.trim())) {
      setError("Name and a 4-6 digit PIN are required.");
      return;
    }
    try {
      setCreating(true);
      setError("");
      const res = await fetch("/api/admin/team-hub/workers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "create", crewId, firstName: newFirstName.trim(), pin: newPin.trim() }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "Could not add worker.");
      setNewFirstName("");
      setNewPin("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add worker.");
    } finally {
      setCreating(false);
    }
  }

  async function handleSetActive(worker: TeamHubWorker) {
    await fetch("/api/admin/team-hub/workers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "setActive", id: worker.id, active: !worker.active }),
    });
    await load();
  }

  async function handleResetPin(worker: TeamHubWorker) {
    const pin = (pinDrafts[worker.id] ?? "").trim();
    if (!/^\d{4,6}$/.test(pin)) {
      setError("Enter a 4-6 digit PIN to reset to.");
      return;
    }
    setError("");
    const res = await fetch("/api/admin/team-hub/workers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "resetPin", id: worker.id, pin }),
    });
    const data = await res.json();
    if (!res.ok || !data.success) {
      setError(data.error || "Could not reset PIN.");
      return;
    }
    setPinDrafts((current) => ({ ...current, [worker.id]: "" }));
    await load();
  }

  if (loading) return <p className="mt-3 text-sm text-slate-500">Loading workers…</p>;

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
      <h4 className="text-sm font-bold text-slate-900">Workers</h4>
      <p className="mt-1 text-xs text-slate-500">
        Each worker signs in to this crew&apos;s link with their first name and a 4-6 digit PIN.
      </p>

      {error && (
        <div className="mt-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">{error}</div>
      )}

      <form onSubmit={handleCreate} className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-4">
        <input
          type="text"
          value={newFirstName}
          onChange={(e) => setNewFirstName(e.target.value)}
          placeholder="First name"
          required
          className="min-h-[40px] rounded-lg border border-gray-300 px-3 text-sm sm:col-span-2"
        />
        <input
          type="text"
          inputMode="numeric"
          value={newPin}
          onChange={(e) => setNewPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
          placeholder="PIN (4-6 digits)"
          required
          className="min-h-[40px] rounded-lg border border-gray-300 px-3 text-sm"
        />
        <button
          type="submit"
          disabled={creating}
          className="min-h-[40px] rounded-lg bg-blue-700 px-4 text-sm font-semibold text-white disabled:opacity-60"
        >
          {creating ? "Adding…" : "Add Worker"}
        </button>
      </form>

      <div className="mt-4 divide-y divide-gray-200 rounded-lg bg-white">
        {workers.length === 0 ? (
          <p className="p-3 text-sm text-slate-500">No workers yet.</p>
        ) : (
          workers.map((worker) => {
            const locked = worker.lockedUntil && new Date(worker.lockedUntil).getTime() > Date.now();
            return (
              <div key={worker.id} className="flex flex-wrap items-center justify-between gap-2 p-3">
                <div>
                  <p className="text-sm font-semibold text-slate-900">
                    {worker.firstName}{" "}
                    <span
                      className={`ml-1 rounded-full px-2 py-0.5 text-xs font-semibold ${
                        worker.active ? "bg-green-100 text-green-800" : "bg-slate-200 text-slate-600"
                      }`}
                    >
                      {worker.active ? "Active" : "Deactivated"}
                    </span>
                    {locked && (
                      <span className="ml-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">
                        Locked
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-slate-500">
                    {worker.lastSignInAt ? `Last signed in ${new Date(worker.lastSignInAt).toLocaleString()}` : "Never signed in"}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    type="text"
                    inputMode="numeric"
                    value={pinDrafts[worker.id] ?? ""}
                    onChange={(e) =>
                      setPinDrafts((current) => ({ ...current, [worker.id]: e.target.value.replace(/\D/g, "").slice(0, 6) }))
                    }
                    placeholder="New PIN"
                    className="min-h-[36px] w-24 rounded-lg border border-gray-300 px-2 text-xs"
                  />
                  <button
                    type="button"
                    onClick={() => handleResetPin(worker)}
                    className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                  >
                    Reset PIN
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSetActive(worker)}
                    className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                  >
                    {worker.active ? "Deactivate" : "Reactivate"}
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

function VisibilitySetup({ crewId }: { crewId: number }) {
  const [loading, setLoading] = useState(true);
  const [modules, setModules] = useState<Record<TeamHubModule, boolean>>({} as Record<TeamHubModule, boolean>);
  const [crewItems, setCrewItems] = useState<CrewItem[]>([]);
  const [libraries, setLibraries] = useState<{ checklist: LibraryItem[]; rounds: LibraryItem[]; supplies: LibraryItem[] }>({
    checklist: [],
    rounds: [],
    supplies: [],
  });
  const [preview, setPreview] = useState(false);

  useEffect(() => {
    (async () => {
      const res = await fetch(`/api/admin/team-hub/crew-items?crewId=${crewId}`, { cache: "no-store" });
      const data = await res.json();
      setModules(data.modules ?? {});
      setCrewItems(data.crewItems ?? []);
      setLibraries(data.libraries ?? { checklist: [], rounds: [], supplies: [] });
      setLoading(false);
    })();
  }, [crewId]);

  async function toggleModule(moduleName: TeamHubModule) {
    const next = { ...modules, [moduleName]: !modules[moduleName] };
    setModules(next);
    await fetch("/api/admin/team-hub/crew-items", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "setModules", crewId, modules: { [moduleName]: next[moduleName] } }),
    });
  }

  function isEnabled(itemType: CrewItem["itemType"], itemId: number): boolean {
    return crewItems.some((ci) => ci.itemType === itemType && ci.itemId === itemId && ci.enabled);
  }

  async function toggleItem(itemType: CrewItem["itemType"], itemId: number) {
    const existing = crewItems.filter((ci) => !(ci.itemType === itemType && ci.itemId === itemId));
    const wasEnabled = isEnabled(itemType, itemId);
    const nextItems = wasEnabled ? existing : [...existing, { id: 0, crewId, itemType, itemId, enabled: true }];
    setCrewItems(nextItems);

    await fetch("/api/admin/team-hub/crew-items", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "setCrewItems",
        crewId,
        items: nextItems.map((ci, index) => ({ itemType: ci.itemType, itemId: ci.itemId, enabled: ci.enabled, sortOrder: index })),
      }),
    });
  }

  if (loading) return <p className="mt-3 text-sm text-slate-500">Loading visibility setup…</p>;

  const enabledModules = TEAM_HUB_MODULES.filter((m) => modules[m]);

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-bold text-slate-900">Modules</h4>
        <button
          type="button"
          onClick={() => setPreview((p) => !p)}
          className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100"
        >
          {preview ? "Back to editing" : "Preview as crew"}
        </button>
      </div>

      {preview ? (
        <PreviewAsCrew enabledModules={enabledModules} crewItems={crewItems} libraries={libraries} />
      ) : (
        <>
          <div className="mt-2 flex flex-wrap gap-2">
            {TEAM_HUB_MODULES.map((moduleName) => (
              <button
                key={moduleName}
                type="button"
                onClick={() => toggleModule(moduleName)}
                className={`rounded-full px-3 py-1.5 text-xs font-semibold capitalize ${
                  modules[moduleName] ? "bg-blue-700 text-white" : "bg-white text-slate-600 ring-1 ring-slate-300"
                }`}
              >
                {moduleName}
              </button>
            ))}
          </div>

          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <LibraryPicker
              title="Checklist items"
              items={libraries.checklist}
              labelKey="text"
              isEnabled={(id) => isEnabled("checklist", id)}
              onToggle={(id) => toggleItem("checklist", id)}
            />
            <LibraryPicker
              title="Rounds"
              items={libraries.rounds}
              labelKey="name"
              isEnabled={(id) => isEnabled("round", id)}
              onToggle={(id) => toggleItem("round", id)}
            />
            <LibraryPicker
              title="Supply items"
              items={libraries.supplies}
              labelKey="name"
              isEnabled={(id) => isEnabled("supply", id)}
              onToggle={(id) => toggleItem("supply", id)}
            />
          </div>
        </>
      )}
    </div>
  );
}

function LibraryPicker({
  title,
  items,
  labelKey,
  isEnabled,
  onToggle,
}: {
  title: string;
  items: LibraryItem[];
  labelKey: "text" | "name";
  isEnabled: (id: number) => boolean;
  onToggle: (id: number) => void;
}) {
  const [search, setSearch] = useState("");
  const filtered = items.filter((item) => (item[labelKey] ?? "").toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="rounded-lg bg-white p-3">
      <h5 className="text-xs font-bold uppercase tracking-wide text-slate-500">{title}</h5>
      <input
        type="text"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search…"
        className="mt-2 w-full rounded-md border border-gray-300 px-2 py-1.5 text-xs"
      />
      <ul className="mt-2 max-h-48 space-y-1 overflow-y-auto">
        {filtered.map((item) => (
          <li key={item.id}>
            <label className="flex items-center gap-2 text-xs text-slate-700">
              <input type="checkbox" checked={isEnabled(item.id)} onChange={() => onToggle(item.id)} className="h-4 w-4" />
              {item.area ? <span className="text-slate-400">{item.area}:</span> : null}
              {item[labelKey]}
            </label>
          </li>
        ))}
      </ul>
    </div>
  );
}

function PreviewAsCrew({
  enabledModules,
  crewItems,
  libraries,
}: {
  enabledModules: TeamHubModule[];
  crewItems: CrewItem[];
  libraries: { checklist: LibraryItem[]; rounds: LibraryItem[]; supplies: LibraryItem[] };
}) {
  function enabledNames(itemType: CrewItem["itemType"], items: LibraryItem[], labelKey: "text" | "name") {
    const enabledIds = new Set(crewItems.filter((ci) => ci.itemType === itemType && ci.enabled).map((ci) => ci.itemId));
    return items.filter((i) => enabledIds.has(i.id)).map((i) => i[labelKey]);
  }

  return (
    <div className="mt-3 rounded-lg bg-white p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Summary preview</p>
      <p className="mt-2 text-sm font-semibold text-slate-900">Enabled modules</p>
      <p className="text-sm text-slate-600">{enabledModules.length ? enabledModules.join(", ") : "None"}</p>

      <p className="mt-3 text-sm font-semibold text-slate-900">Checklist items</p>
      <ul className="list-inside list-disc text-sm text-slate-600">
        {enabledNames("checklist", libraries.checklist, "text").map((t, i) => (
          <li key={i}>{t}</li>
        ))}
      </ul>

      <p className="mt-3 text-sm font-semibold text-slate-900">Rounds</p>
      <ul className="list-inside list-disc text-sm text-slate-600">
        {enabledNames("round", libraries.rounds, "name").map((t, i) => (
          <li key={i}>{t}</li>
        ))}
      </ul>

      <p className="mt-3 text-sm font-semibold text-slate-900">Supply items</p>
      <ul className="list-inside list-disc text-sm text-slate-600">
        {enabledNames("supply", libraries.supplies, "name").map((t, i) => (
          <li key={i}>{t}</li>
        ))}
      </ul>
    </div>
  );
}
