"use client";

// Equipment home (simple redesign): big buttons for every job across the
// top, a search box, four plain status chips (Good / Needs repair / Lost /
// Retired) and big photo cards with the tag number. Tap a card → that
// item's page, where every action lives. Retired items only show under the
// Retired chip. Reads only the Equipment tab (GET /api/equipment) plus the
// tablet-report colors (GET /api/equipment/health).
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { SetUpTabletButton } from "./EquipmentCheckAdmin";
import type { EquipmentCategory, EquipmentItem } from "./types";
import {
  BigButton,
  EquipmentPhoto,
  EquipmentShell,
  ErrorNote,
  SIMPLE_STATUS_LABEL,
  SIMPLE_STATUS_STYLE,
  StatusChip,
  simpleStatus,
  whereLine,
  type SimpleStatus,
  type TabletFlag,
} from "./ui";

type Filter = "all" | SimpleStatus;
const FILTERS: Filter[] = ["all", "good", "repair", "lost", "retired"];

export default function EquipmentListPage() {
  const [equipment, setEquipment] = useState<EquipmentItem[]>([]);
  const [categories, setCategories] = useState<EquipmentCategory[]>([]);
  const [flags, setFlags] = useState<Record<string, TabletFlag>>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [equipmentRes, categoriesRes, healthRes] = await Promise.all([
          fetch("/api/equipment", { cache: "no-store" }),
          fetch("/api/equipment-categories", { cache: "no-store" }),
          fetch("/api/equipment/health", { cache: "no-store" }),
        ]);
        const equipmentData = (await equipmentRes.json()) as { success?: boolean; equipment?: EquipmentItem[]; error?: string };
        const categoriesData = (await categoriesRes.json()) as { success?: boolean; categories?: EquipmentCategory[] };
        const healthData = (await healthRes.json().catch(() => ({}))) as { success?: boolean; flags?: Record<string, TabletFlag> };
        if (cancelled) return;
        if (!equipmentData.success || !Array.isArray(equipmentData.equipment)) {
          setLoadError(equipmentData.error || "Could not load equipment.");
          return;
        }
        setEquipment(equipmentData.equipment);
        if (categoriesData.success && Array.isArray(categoriesData.categories)) setCategories(categoriesData.categories);
        // Tablet colors are extra — the page still works without them.
        if (healthData.success && healthData.flags) setFlags(healthData.flags);
      } catch {
        if (!cancelled) setLoadError("No connection. Reload the page.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const categoryNameById = useMemo(() => new Map(categories.map((c) => [c.id, c.name])), [categories]);

  const rows = useMemo(
    () =>
      equipment
        .map((item) => ({ item, status: simpleStatus(item, flags[item.id]) }))
        .sort((a, b) => (a.item.serialNumber || a.item.name).localeCompare(b.item.serialNumber || b.item.name, undefined, { numeric: true })),
    [equipment, flags]
  );

  const counts = useMemo(() => {
    const result: Record<Filter, number> = { all: 0, good: 0, repair: 0, lost: 0, retired: 0 };
    for (const row of rows) {
      result[row.status] += 1;
      if (row.status !== "retired") result.all += 1;
    }
    return result;
  }, [rows]);

  const query = search.trim().toLowerCase();
  const shown = rows.filter(({ item, status }) => {
    if (filter === "all" ? status === "retired" : status !== filter) return false;
    if (!query) return true;
    return [item.name, item.serialNumber, item.currentHolderName, categoryNameById.get(item.categoryId) ?? ""].some((text) =>
      text.toLowerCase().includes(query)
    );
  });

  return (
    <EquipmentShell title="Equipment">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
        <BigButton icon="➕" label="Add equipment" tone="green" href="/equipment/new" />
        <BigButton icon="🚐" label="Vehicles" href="/equipment/vehicles" />
        <BigButton icon="🔩" label="Parts & stock" href="/equipment/parts" />
        <BigButton icon="👥" label="Staff & PINs" href="/equipment/staff" />
        <SetUpTabletButton big />
      </div>

      <input
        type="search"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="🔍 Search by name or tag number"
        aria-label="Search equipment"
        className="min-h-[64px] w-full rounded-2xl border-2 border-gray-300 bg-white px-5 text-xl outline-none focus:border-blue-600"
      />

      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            aria-pressed={filter === f}
            className={`flex min-h-[52px] items-center gap-2 rounded-full border-2 px-4 text-lg font-bold ${
              filter === f ? "border-blue-700 bg-blue-700 text-white" : "border-gray-300 bg-white text-gray-800 hover:bg-gray-100"
            }`}
          >
            {f !== "all" ? <span className={`h-3 w-3 rounded-full ${SIMPLE_STATUS_STYLE[f].dot}`} aria-hidden="true" /> : null}
            {f === "all" ? "All in use" : SIMPLE_STATUS_LABEL[f]}
            <span className="opacity-70">{counts[f]}</span>
          </button>
        ))}
      </div>

      <ErrorNote message={loadError} />

      {loading ? (
        <p className="p-8 text-center text-xl text-gray-600">Loading…</p>
      ) : shown.length === 0 && !loadError ? (
        <p className="rounded-2xl bg-white p-8 text-center text-xl text-gray-600 shadow-sm">
          {query ? "Nothing matches that search." : "Nothing here."}
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {shown.map(({ item, status }) => (
            <Link
              key={item.id}
              href={`/equipment/${encodeURIComponent(item.id)}`}
              className={`overflow-hidden rounded-3xl border-4 bg-white shadow-sm transition hover:shadow-md ${SIMPLE_STATUS_STYLE[status].card}`}
            >
              <EquipmentPhoto url={item.photoUrl} name={item.name} className="h-44 w-full" />
              <div className="space-y-2 p-4">
                {item.serialNumber ? <p className="text-3xl font-black text-gray-900">{item.serialNumber}</p> : null}
                <p className={item.serialNumber ? "text-lg font-semibold text-gray-600" : "text-2xl font-black text-gray-900"}>{item.name}</p>
                <StatusChip status={status} />
                <p className={`text-lg ${item.overdue ? "font-bold text-red-700" : "text-gray-600"}`}>{whereLine(item)}</p>
              </div>
            </Link>
          ))}
        </div>
      )}
    </EquipmentShell>
  );
}
