"use client";

// Manager-side pieces of the Equipment Check tablet app
// (docs/equipment-check-spec.md §3, §7, §8), dropped into the existing
// Equipment pages as additions only: the "Open tablet app" button, report
// history (per item and per staff member), and the per-person PIN controls
// in the Staff list. Reads only its own /api/equipment-check-link,
// /api/equipment-pins and /api/equipment-reports routes.
import { useCallback, useEffect, useState } from "react";
import TranslatedText from "@/app/components/TranslatedText";
import type { Staff } from "./types";

// §8 — shown wherever "Last reported by" or report history appears.
export const EQUIPMENT_REPORT_CAUTION =
  "Last report only — not proof of who caused it. Someone may have used it after without reporting. Check before acting.";

export function EquipmentReportCaution() {
  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-900">
      ⚠️ {EQUIPMENT_REPORT_CAUTION}
    </div>
  );
}

type Condition = "good" | "damaged" | "lost";

const CONDITION_LABEL: Record<Condition, string> = {
  good: "Good",
  damaged: "Damaged or not working",
  lost: "Lost",
};

const CONDITION_BADGE: Record<Condition, string> = {
  good: "border-green-200 bg-green-100 text-green-800",
  damaged: "border-yellow-300 bg-yellow-100 text-yellow-900",
  lost: "border-red-200 bg-red-100 text-red-800",
};

type ReportRow = {
  id: number;
  staffId: string;
  staffName: string;
  equipmentId: string;
  equipmentName: string;
  equipmentTag: string;
  condition: Condition;
  notesOriginal: string | null;
  notesEnglish: string | null;
  notesLang: string | null;
  photoUrls: string[];
  createdAt: string;
};

function ConditionBadge({ condition }: { condition: Condition }) {
  return (
    <span className={`rounded-full border px-2 py-1 text-xs font-semibold ${CONDITION_BADGE[condition]}`}>
      {CONDITION_LABEL[condition]}
    </span>
  );
}

function useEquipmentReports(filter: { equipmentId: string } | { staffId: string }) {
  const query = "equipmentId" in filter ? `equipmentId=${encodeURIComponent(filter.equipmentId)}` : `staffId=${encodeURIComponent(filter.staffId)}`;
  const [reports, setReports] = useState<ReportRow[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/equipment-reports?${query}`, { cache: "no-store" });
        const data = (await res.json()) as { success?: boolean; reports?: ReportRow[]; error?: string };
        if (cancelled) return;
        if (data.success && Array.isArray(data.reports)) setReports(data.reports);
        else setError(data.error || "Failed to load reports.");
      } catch {
        if (!cancelled) setError("Network error loading reports.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [query]);

  return { reports, error };
}

function ReportList({ reports, show }: { reports: ReportRow[]; show: "staff" | "equipment" }) {
  return (
    <ul className="divide-y divide-gray-100">
      {reports.map((r) => (
        <li key={r.id} className="py-3">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <ConditionBadge condition={r.condition} />
            <span className="font-semibold text-gray-900">
              {show === "staff" ? r.staffName : `${r.equipmentName}${r.equipmentTag ? ` (${r.equipmentTag})` : ""}`}
            </span>
            <span className="text-gray-500">{new Date(r.createdAt).toLocaleString()}</span>
          </div>
          {r.notesOriginal && (
            <p className="mt-1 text-sm text-gray-700">
              <TranslatedText original={r.notesOriginal} english={r.notesEnglish} language={r.notesLang} />
            </p>
          )}
          {r.photoUrls.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2">
              {r.photoUrls.map((url) => (
                <a key={url} href={url} target="_blank" rel="noreferrer">
                  {/* eslint-disable-next-line @next/next/no-img-element -- Vercel Blob URL */}
                  <img src={url} alt="Report photo" className="h-20 w-20 rounded-lg border border-gray-200 object-cover" />
                </a>
              ))}
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}

// §7 — item page: "Last reported by" + condition, then full history.
export function EquipmentItemReports({ equipmentId }: { equipmentId: string }) {
  const { reports, error } = useEquipmentReports({ equipmentId });
  const last = reports?.[0];

  return (
    <section className="mb-6 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <h2 className="mb-3 text-xl font-bold text-gray-900">Tablet Reports</h2>
      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">{error}</div>
      ) : reports === null ? (
        <div className="p-4 text-center text-gray-600">Loading...</div>
      ) : reports.length === 0 ? (
        <div className="p-4 text-center text-gray-600">No tablet reports yet.</div>
      ) : (
        <>
          <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
            <span className="text-gray-500">Last reported by</span>
            <span className="font-semibold text-gray-900">{last!.staffName}</span>
            <ConditionBadge condition={last!.condition} />
            <span className="text-gray-500">{new Date(last!.createdAt).toLocaleString()}</span>
          </div>
          <EquipmentReportCaution />
          <ReportList reports={reports} show="staff" />
        </>
      )}
    </section>
  );
}

// §7 — one staff member's report history (expanded under their Staff row).
export function StaffEquipmentReports({ staffId }: { staffId: string }) {
  const { reports, error } = useEquipmentReports({ staffId });
  if (error) return <div className="text-sm font-semibold text-red-700">{error}</div>;
  if (reports === null) return <div className="text-sm text-gray-600">Loading...</div>;
  if (reports.length === 0) return <div className="text-sm text-gray-600">No tablet reports from this person yet.</div>;
  return (
    <div className="space-y-2">
      <EquipmentReportCaution />
      <ReportList reports={reports} show="equipment" />
    </div>
  );
}

function useTabletLinkPath() {
  const [path, setPath] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async (method: "GET" | "POST") => {
    setError("");
    try {
      const res = await fetch("/api/equipment-check-link", { method, cache: "no-store" });
      const data = (await res.json()) as { success?: boolean; path?: string; error?: string };
      if (data.success && data.path) setPath(data.path);
      else setError(data.error || "Failed to load the tablet link.");
    } catch {
      setError("Network error loading the tablet link.");
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial fetch on mount
    load("GET");
  }, [load]);

  return { path, error, regenerate: () => load("POST") };
}

// §7 — "Open tablet app" at the top of Equipment, plus "New link" in case
// the link ever gets out (old link stops working, tablets sign out).
export function OpenTabletAppButton() {
  const { path, error, regenerate } = useTabletLinkPath();

  function newLink() {
    if (!window.confirm("Make a new tablet link? The old link stops working — tablets and staff phones will need the new one.")) return;
    regenerate();
  }

  return (
    <div className="flex items-center gap-2">
      <a
        href={path || undefined}
        target="_blank"
        rel="noreferrer"
        aria-disabled={!path}
        className={`rounded-lg bg-blue-700 px-5 py-3 text-sm font-semibold text-white shadow-sm hover:bg-blue-800 ${path ? "" : "pointer-events-none opacity-60"}`}
      >
        Open tablet app
      </a>
      <button type="button" onClick={newLink} className="text-xs font-semibold text-gray-500 hover:underline">
        New link
      </button>
      {error && <span className="text-xs font-semibold text-red-700">{error}</span>}
    </div>
  );
}

export type EquipmentPinStatus = {
  staffId: string;
  hasPin: boolean;
  setupAllowedUntil: string | null;
  setupOpen: boolean;
  lockedUntil: string | null;
  lastSignInAt: string | null;
};

// Loads PIN status for the whole Staff list plus the tablet link (for the
// "Text invite" message) — used once by StaffSection.
export function useEquipmentPinStatuses() {
  const [pins, setPins] = useState<Record<string, EquipmentPinStatus>>({});
  const { path } = useTabletLinkPath();

  const reload = useCallback(async () => {
    try {
      const res = await fetch("/api/equipment-pins", { cache: "no-store" });
      const data = (await res.json()) as { success?: boolean; pins?: EquipmentPinStatus[] };
      if (data.success && Array.isArray(data.pins)) {
        setPins(Object.fromEntries(data.pins.map((p) => [p.staffId, p])));
      }
    } catch {
      // PIN column just shows "—" until the next reload
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial fetch on mount
    reload();
  }, [reload]);

  return { pins, linkPath: path, reload };
}

function inviteSmsHref(name: string, linkUrl: string): string {
  const firstName = name.trim().split(/\s+/)[0] || name;
  const body =
    `Hi ${firstName}, here's the equipment app: ${linkUrl}. The first time, tap your name and create your own 4-digit PIN.\n\n` +
    `Hola ${firstName}, aquí está la app de equipo: ${linkUrl}. La primera vez, toca tu nombre y crea tu propio PIN de 4 dígitos.`;
  // "sms:?&body=" opens Messages with the text filled in on both iOS and
  // Android; Staff records have no phone number, so the manager picks the
  // recipient in Messages.
  return `sms:?&body=${encodeURIComponent(body)}`;
}

// §3 — one Staff row's PIN status + actions.
export function StaffPinControls({
  member,
  pin,
  linkPath,
  onChanged,
  historyOpen,
  onToggleHistory,
}: {
  member: Staff;
  pin: EquipmentPinStatus | undefined;
  linkPath: string;
  onChanged: () => void;
  historyOpen: boolean;
  onToggleHistory: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function allowSetup() {
    if (pin?.hasPin && !window.confirm(`Reset ${member.name}'s PIN? Their old PIN stops working and they create a new one on the tablet (next 48 hours).`)) {
      return;
    }
    setSaving(true);
    setError("");
    try {
      const res = await fetch(`/api/equipment-pins/${encodeURIComponent(member.id)}`, { method: "POST" });
      const data = (await res.json()) as { success?: boolean; error?: string };
      if (!data.success) setError(data.error || "Failed.");
      else onChanged();
    } catch {
      setError("Network error.");
    } finally {
      setSaving(false);
    }
  }

  let status: string;
  if (pin?.lockedUntil) status = `Locked until ${new Date(pin.lockedUntil).toLocaleTimeString()}`;
  else if (pin?.hasPin) status = "PIN set";
  else if (pin?.setupOpen && pin.setupAllowedUntil) status = `Setup open until ${new Date(pin.setupAllowedUntil).toLocaleString()}`;
  else if (pin?.setupAllowedUntil) status = "Setup expired";
  else status = "No PIN";

  const linkUrl = linkPath && typeof window !== "undefined" ? `${window.location.origin}${linkPath}` : "";

  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs font-semibold text-gray-600">{status}</span>
      {member.active ? (
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={allowSetup}
            disabled={saving}
            className="font-semibold text-blue-700 hover:underline disabled:cursor-not-allowed disabled:opacity-60"
          >
            {pin?.hasPin || pin?.lockedUntil ? "Reset PIN" : "Allow PIN setup"}
          </button>
          {pin?.setupOpen && linkUrl && (
            <a href={inviteSmsHref(member.name, linkUrl)} className="font-semibold text-blue-700 hover:underline">
              Text invite
            </a>
          )}
          <button type="button" onClick={onToggleHistory} className="font-semibold text-blue-700 hover:underline">
            {historyOpen ? "Hide reports" : "Reports"}
          </button>
        </div>
      ) : (
        <button type="button" onClick={onToggleHistory} className="self-start font-semibold text-blue-700 hover:underline">
          {historyOpen ? "Hide reports" : "Reports"}
        </button>
      )}
      {error && <span className="text-xs font-semibold text-red-700">{error}</span>}
    </div>
  );
}
