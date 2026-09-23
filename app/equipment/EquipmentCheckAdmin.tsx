"use client";

// Manager-side pieces of the Equipment Check tablet app
// (docs/equipment-check-spec.md §3, §7, §8), dropped into the existing
// Equipment pages as additions only: the "Set up a tablet" panel, report
// history (per item and per staff member), and the per-person PIN controls
// in the Staff list. Reads only its own /api/equipment-check-link,
// /api/equipment-pins and /api/equipment-reports routes.
import { useCallback, useEffect, useState } from "react";
import QRCode from "qrcode";
import { INSTALL_STEPS } from "@/app/equipment-check/strings";
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

function useCopiedFlag(): [boolean, () => void] {
  const [copied, setCopied] = useState(false);
  const flash = useCallback(() => {
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  }, []);
  return [copied, flash];
}

// §7 — "Set up a tablet" at the top of Equipment: a panel with a QR code of
// the tablet link (generated in the browser by the `qrcode` package — no
// external service ever sees the link), the link with Copy, an "Email link"
// mailto for the tablet's own inbox, and the EN/ES Add to Home Screen steps.
// "New link" lives here too, in case the link ever gets out (old link stops
// working, tablets sign out).
export function SetUpTabletButton() {
  const { path, error, regenerate } = useTabletLinkPath();
  const [open, setOpen] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [copied, flashCopied] = useCopiedFlag();

  const linkUrl = path && typeof window !== "undefined" ? `${window.location.origin}${path}` : "";

  useEffect(() => {
    if (!open || !linkUrl) return;
    let cancelled = false;
    QRCode.toDataURL(linkUrl, { width: 320, margin: 2, errorCorrectionLevel: "M" })
      .then((url) => {
        if (!cancelled) setQrDataUrl(url);
      })
      .catch(() => {
        if (!cancelled) setQrDataUrl("");
      });
    return () => {
      cancelled = true;
    };
  }, [open, linkUrl]);

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(linkUrl);
      flashCopied();
    } catch {
      window.prompt("Copy this link:", linkUrl);
    }
  }

  function newLink() {
    if (!window.confirm("Make a new tablet link? The old link stops working — every tablet (and any staff phone) has to be set up again.")) return;
    regenerate();
  }

  const mailto = `mailto:?subject=${encodeURIComponent("Equipment Check tablet link")}&body=${encodeURIComponent(
    `Open this on the tablet, then add it to the Home Screen:\n${linkUrl}\n\nÁbrelo en la tableta y agrégalo a la pantalla de inicio:\n${linkUrl}`
  )}`;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={!path}
        className="rounded-lg bg-blue-700 px-5 py-3 text-sm font-semibold text-white shadow-sm hover:bg-blue-800 disabled:opacity-60"
      >
        Set up a tablet
      </button>
      {error && <span className="text-xs font-semibold text-red-700">{error}</span>}

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setOpen(false)}>
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Set up a tablet"
            className="max-h-full w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4">
              <h2 className="text-2xl font-bold text-gray-900">Set up a tablet</h2>
              <button type="button" onClick={() => setOpen(false)} className="text-2xl leading-none text-gray-400 hover:text-gray-600" aria-label="Close">
                ✕
              </button>
            </div>

            <div className="mt-4 flex justify-center">
              {qrDataUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- data: URL generated in the browser
                <img src={qrDataUrl} alt="QR code of the tablet link" className="h-72 w-72 rounded-lg border border-gray-200" />
              ) : (
                <div className="flex h-72 w-72 items-center justify-center rounded-lg border border-gray-200 text-sm text-gray-500">Loading…</div>
              )}
            </div>

            <div className="mt-4 flex items-center gap-2">
              <input readOnly value={linkUrl} onFocus={(e) => e.target.select()} className="min-w-0 flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-800" />
              <button type="button" onClick={copyLink} className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800">
                {copied ? "Copied!" : "Copy"}
              </button>
            </div>
            <a href={mailto} className="mt-3 inline-block rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50">
              Email link
            </a>

            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              {(["en", "es"] as const).map((lang) => (
                <div key={lang} className="rounded-lg bg-gray-50 p-3 text-sm text-gray-800">
                  <p className="mb-1 font-semibold">{INSTALL_STEPS[lang].title}</p>
                  {INSTALL_STEPS[lang].all.map((step) => (
                    <p key={step}>{step}</p>
                  ))}
                </div>
              ))}
            </div>

            <div className="mt-5 border-t border-gray-100 pt-3 text-right">
              <button type="button" onClick={newLink} className="text-xs font-semibold text-gray-500 hover:underline">
                Make a new link (old one stops working)
              </button>
            </div>
          </div>
        </div>
      )}
    </>
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
// "Copy invite" message) — used once by StaffSection.
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

function inviteText(name: string, linkUrl: string): string {
  const firstName = name.trim().split(/\s+/)[0] || name;
  return (
    `Hi ${firstName}, here's the equipment app: ${linkUrl}. The first time, tap your name and create your own 4-digit PIN.\n\n` +
    `Hola ${firstName}, aquí está la app de equipo: ${linkUrl}. La primera vez, toca tu nombre y crea tu propio PIN de 4 dígitos.`
  );
}

// Only for someone who wants the app on their OWN phone — shared tablets
// don't need an invite (they just tap their name). sms: links do nothing on
// Windows, so this copies the message; on a phone/tablet with the share
// sheet it opens that instead (Messages, WhatsApp, …).
function CopyInviteButton({ name, linkUrl }: { name: string; linkUrl: string }) {
  const [copied, flashCopied] = useCopiedFlag();

  async function invite() {
    const text = inviteText(name, linkUrl);
    const isTouchDevice = typeof window !== "undefined" && window.matchMedia?.("(pointer: coarse)").matches;
    if (isTouchDevice && typeof navigator.share === "function") {
      try {
        await navigator.share({ text });
        return;
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        // fall through to copying
      }
    }
    try {
      await navigator.clipboard.writeText(text);
      flashCopied();
    } catch {
      window.prompt("Copy this invite:", text);
    }
  }

  return (
    <button type="button" onClick={invite} className="text-xs font-semibold text-blue-700 hover:underline" title="Only needed if they want the app on their own phone">
      {copied ? "Invite copied!" : "Copy invite (own phone)"}
    </button>
  );
}

// §3 — one Staff row's PIN status + actions. "Allow PIN setup" is the main
// action; once it's open the person just taps their name on the tablet.
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

  const linkUrl = linkPath && typeof window !== "undefined" ? `${window.location.origin}${linkPath}` : "";
  const reportsButton = (
    <button type="button" onClick={onToggleHistory} className="self-start text-xs font-semibold text-blue-700 hover:underline">
      {historyOpen ? "Hide reports" : "Reports"}
    </button>
  );

  if (!member.active) {
    return <div className="flex flex-col gap-1">{reportsButton}</div>;
  }

  let body: React.ReactNode;
  if (pin?.lockedUntil) {
    body = (
      <>
        <span className="text-xs font-semibold text-red-700">Locked until {new Date(pin.lockedUntil).toLocaleTimeString()}</span>
        <button type="button" onClick={allowSetup} disabled={saving} className="self-start text-xs font-semibold text-blue-700 hover:underline disabled:opacity-60">
          Reset PIN
        </button>
      </>
    );
  } else if (pin?.hasPin) {
    body = (
      <>
        <span className="text-xs font-semibold text-green-700">PIN set</span>
        <button type="button" onClick={allowSetup} disabled={saving} className="self-start text-xs font-semibold text-blue-700 hover:underline disabled:opacity-60">
          Reset PIN
        </button>
      </>
    );
  } else if (pin?.setupOpen && pin.setupAllowedUntil) {
    body = (
      <>
        <span className="rounded-lg bg-green-50 px-2 py-1 text-xs font-semibold text-green-800">
          They can now tap their name on the tablet to create a PIN.
        </span>
        <span className="text-xs text-gray-500">Open until {new Date(pin.setupAllowedUntil).toLocaleString()}</span>
        {linkUrl && <CopyInviteButton name={member.name} linkUrl={linkUrl} />}
      </>
    );
  } else {
    body = (
      <>
        {pin?.setupAllowedUntil && <span className="text-xs text-gray-500">Setup expired</span>}
        <button
          type="button"
          onClick={allowSetup}
          disabled={saving}
          className="self-start rounded-lg bg-blue-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-800 disabled:opacity-60"
        >
          {saving ? "Allowing…" : "Allow PIN setup"}
        </button>
      </>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      {body}
      {reportsButton}
      {error && <span className="text-xs font-semibold text-red-700">{error}</span>}
    </div>
  );
}

