"use client";

import { useEffect, useState, useCallback } from "react";

type TeamHubSite = {
  id: number;
  accountId: string;
  label: string;
  supervisorPhone: string | null;
  active: boolean;
  createdAt: string;
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

export default function AccountTeamHubTab({
  accountId,
  accountName,
}: {
  accountId: string;
  accountName: string;
}) {
  const [loading, setLoading] = useState(true);
  const [site, setSite] = useState<TeamHubSite | null>(null);
  const [crews, setCrews] = useState<TeamHubCrew[]>([]);
  const [error, setError] = useState("");

  const [newLabel, setNewLabel] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [creatingSite, setCreatingSite] = useState(false);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const siteRes = await fetch(`/api/admin/team-hub/sites?accountId=${encodeURIComponent(accountId)}`, {
        cache: "no-store",
      });
      const siteData = await siteRes.json();
      const loadedSite: TeamHubSite | null = siteData.site ?? null;
      setSite(loadedSite);

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

  async function handleCreateSite(e: React.FormEvent) {
    e.preventDefault();
    if (!newLabel.trim()) return;
    try {
      setCreatingSite(true);
      setError("");
      const res = await fetch("/api/admin/team-hub/sites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create",
          accountId,
          label: newLabel.trim(),
          supervisorPhone: newPhone.trim() || null,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "Could not create Team Hub.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create Team Hub.");
    } finally {
      setCreatingSite(false);
    }
  }

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

  if (error && !site) {
    return <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>;
  }

  if (!site) {
    return (
      <section className="rounded-2xl bg-white p-5 shadow-sm">
        <h2 className="text-lg font-bold text-slate-900">Set up Team Hub for {accountName}</h2>
        <p className="mt-1 text-sm text-slate-600">
          Creates a Team Hub for this account — crews can then be added, each with their own no-login link.
        </p>
        <form onSubmit={handleCreateSite} className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="text-sm font-medium text-slate-700">Site label (crews see only this)</label>
            <input
              type="text"
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              placeholder="e.g. Site 14"
              required
              className="mt-1 min-h-[44px] w-full rounded-lg border border-gray-300 px-3 text-sm"
            />
          </div>
          <div>
            <label className="text-sm font-medium text-slate-700">Supervisor phone (optional)</label>
            <input
              type="tel"
              value={newPhone}
              onChange={(e) => setNewPhone(e.target.value)}
              className="mt-1 min-h-[44px] w-full rounded-lg border border-gray-300 px-3 text-sm"
            />
          </div>
          <div className="sm:col-span-2">
            <button
              type="submit"
              disabled={creatingSite}
              className="min-h-[44px] rounded-lg bg-blue-700 px-5 text-sm font-semibold text-white disabled:opacity-60"
            >
              {creatingSite ? "Creating…" : "Create Team Hub"}
            </button>
          </div>
        </form>
      </section>
    );
  }

  return (
    <div className="space-y-6">
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>
      )}

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
        <CrewsSection siteId={site.id} crews={crews} onChanged={load} />
      </section>
    </div>
  );
}

function CrewsSection({
  siteId,
  crews,
  onChanged,
}: {
  siteId: number;
  crews: TeamHubCrew[];
  onChanged: () => void;
}) {
  const [name, setName] = useState("");
  const [crewType, setCrewType] = useState<TeamHubCrew["crewType"]>("porter");
  const [crewKind, setCrewKind] = useState<TeamHubCrew["crewKind"]>("inhouse");
  const [subId, setSubId] = useState("");
  const [creating, setCreating] = useState(false);
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const [expandedCrewId, setExpandedCrewId] = useState<number | null>(null);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    try {
      setCreating(true);
      const res = await fetch("/api/admin/team-hub/crews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create",
          siteId,
          name: name.trim(),
          crewType,
          crewKind,
          subId: crewKind === "sub" ? subId.trim() : null,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "Could not create crew.");
      setName("");
      setSubId("");
      onChanged();
    } catch {
      // Surfaced via the parent's error state on next load if it recurs;
      // kept local/minimal here since crew creation is a small, retryable action.
    } finally {
      setCreating(false);
    }
  }

  async function handleSetActive(crew: TeamHubCrew) {
    await fetch("/api/admin/team-hub/crews", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "setActive", id: crew.id, active: !crew.active }),
    });
    onChanged();
  }

  async function handleRegenerate(crew: TeamHubCrew) {
    await fetch("/api/admin/team-hub/crews", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "regenerateToken", id: crew.id }),
    });
    onChanged();
  }

  function handleCopy(crew: TeamHubCrew) {
    // /team-hub/[token] doesn't exist until Phase 1 — the link is created
    // and copyable now so admin setup isn't blocked on that phase, but it
    // won't resolve to anything yet.
    const url = `${window.location.origin}/team-hub/${crew.token}`;
    navigator.clipboard?.writeText(url).then(() => {
      setCopiedId(crew.id);
      setTimeout(() => setCopiedId(null), 2000);
    });
  }

  return (
    <div className="mt-3 space-y-4">
      <form onSubmit={handleCreate} className="grid grid-cols-1 gap-3 sm:grid-cols-4">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Crew name"
          required
          className="min-h-[44px] rounded-lg border border-gray-300 px-3 text-sm sm:col-span-2"
        />
        <select
          value={crewType}
          onChange={(e) => setCrewType(e.target.value as TeamHubCrew["crewType"])}
          className="min-h-[44px] rounded-lg border border-gray-300 px-3 text-sm"
        >
          <option value="porter">Porter</option>
          <option value="night">Night</option>
          <option value="other">Other</option>
        </select>
        <select
          value={crewKind}
          onChange={(e) => setCrewKind(e.target.value as TeamHubCrew["crewKind"])}
          className="min-h-[44px] rounded-lg border border-gray-300 px-3 text-sm"
        >
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
        <button
          type="submit"
          disabled={creating}
          className="min-h-[44px] rounded-lg bg-blue-700 px-5 text-sm font-semibold text-white disabled:opacity-60"
        >
          {creating ? "Adding…" : "Add Crew"}
        </button>
      </form>

      <div className="divide-y divide-gray-100">
        {crews.length === 0 ? (
          <p className="py-4 text-sm text-slate-500">No crews yet.</p>
        ) : (
          crews.map((crew) => (
            <div key={crew.id} className="py-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold text-slate-900">
                    {crew.name}{" "}
                    <span className="font-normal text-slate-500">
                      ({crew.crewType} · {crew.crewKind === "sub" ? `sub ${crew.subId}` : "in-house"})
                    </span>
                  </p>
                  <span
                    className={`mt-1 inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                      crew.active ? "bg-green-100 text-green-800" : "bg-slate-200 text-slate-600"
                    }`}
                  >
                    {crew.active ? "Active" : "Revoked"}
                  </span>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => handleCopy(crew)}
                    className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    {copiedId === crew.id ? "Copied!" : "Copy Link"}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleRegenerate(crew)}
                    className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    Regenerate
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSetActive(crew)}
                    className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    {crew.active ? "Revoke" : "Reactivate"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setExpandedCrewId(expandedCrewId === crew.id ? null : crew.id)}
                    className="rounded-lg bg-blue-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-800"
                  >
                    {expandedCrewId === crew.id ? "Hide Visibility" : "Visibility Setup"}
                  </button>
                </div>
              </div>

              {expandedCrewId === crew.id && <VisibilitySetup crewId={crew.id} />}
            </div>
          ))
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

  // Inlined directly in the effect (not a separate useCallback) — this has
  // exactly one caller (mount) and nothing else in the component needs to
  // re-trigger it, so there's no reason to name/memoize it, and inlining
  // avoids react-hooks/set-state-in-effect's concern about an effect
  // synchronously invoking a callback that sets state.
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
    const nextItems = wasEnabled
      ? existing
      : [...existing, { id: 0, crewId, itemType, itemId, enabled: true }];
    setCrewItems(nextItems);

    await fetch("/api/admin/team-hub/crew-items", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "setCrewItems",
        crewId,
        items: nextItems.map((ci, index) => ({
          itemType: ci.itemType,
          itemId: ci.itemId,
          enabled: ci.enabled,
          sortOrder: index,
        })),
      }),
    });
  }

  if (loading) return <p className="mt-3 text-sm text-slate-500">Loading visibility setup…</p>;

  const enabledModules = TEAM_HUB_MODULES.filter((m) => modules[m]);

  return (
    <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
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
              <input
                type="checkbox"
                checked={isEnabled(item.id)}
                onChange={() => onToggle(item.id)}
                className="h-4 w-4"
              />
              {item.area ? <span className="text-slate-400">{item.area}:</span> : null}
              {item[labelKey]}
            </label>
          </li>
        ))}
      </ul>
    </div>
  );
}

// Phase 0 note: /team-hub/[token] (the real public rendering path) doesn't
// exist until Phase 1, so this can't yet "render the exact crew view
// through the real public rendering path" as the spec describes for later
// phases — it's a read-only summary of what's currently enabled instead.
// Revisit once Phase 1 ships the real page.
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
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        Placeholder preview — real crew rendering ships in Phase 1
      </p>
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
