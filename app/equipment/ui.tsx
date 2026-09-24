"use client";

// Shared pieces for the Equipment admin screens (simple redesign): the four
// plain status colors, big buttons, the confirm dialog used before anything
// destructive, the photo tile, and the one Add / Edit form. Built so a
// manager with no training can use it: one main action per screen, big
// labeled buttons, few words, nothing hidden behind menus.
import Link from "next/link";
import { useState, type ReactNode } from "react";
import { resizeImageForUpload } from "@/lib/imageResize";
import type { EquipmentCategory, EquipmentItem } from "./types";

// ─── Status ──────────────────────────────────────────────────────────────

export type SimpleStatus = "good" | "repair" | "lost" | "retired";

// From GET /api/equipment/health — the newest tablet report, when it matters.
export type TabletFlag = { condition: "lost" | "damaged"; reportedAt: string };

export const SIMPLE_STATUS_LABEL: Record<SimpleStatus, string> = {
  good: "Good",
  repair: "Needs repair",
  lost: "Lost",
  retired: "Retired",
};

export const SIMPLE_STATUS_STYLE: Record<SimpleStatus, { chip: string; card: string; dot: string }> = {
  good: { chip: "bg-green-100 text-green-800 border-green-300", card: "border-green-300", dot: "bg-green-500" },
  repair: { chip: "bg-amber-100 text-amber-900 border-amber-300", card: "border-amber-400", dot: "bg-amber-500" },
  lost: { chip: "bg-red-100 text-red-800 border-red-300", card: "border-red-400", dot: "bg-red-500" },
  retired: { chip: "bg-gray-200 text-gray-700 border-gray-300", card: "border-gray-300", dot: "bg-gray-400" },
};

export function simpleStatus(item: EquipmentItem, flag: TabletFlag | undefined): SimpleStatus {
  if (item.status === "Retired") return "retired";
  if (flag?.condition === "lost") return "lost";
  if (item.status === "InRepair" || item.needsMaintenanceReview || flag?.condition === "damaged") return "repair";
  return "good";
}

// One short line under the status: where it is right now.
export function whereLine(item: EquipmentItem): string {
  if (item.status === "CheckedOut") {
    return `${item.overdue ? "Overdue — " : ""}With ${item.currentHolderName || "someone"}`;
  }
  if (item.status === "InRepair") return "At repair";
  if (item.status === "Retired") return "Not in use";
  return "In the shop";
}

export function StatusChip({ status }: { status: SimpleStatus }) {
  return (
    <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-base font-bold ${SIMPLE_STATUS_STYLE[status].chip}`}>
      <span className={`h-3 w-3 rounded-full ${SIMPLE_STATUS_STYLE[status].dot}`} aria-hidden="true" />
      {SIMPLE_STATUS_LABEL[status]}
    </span>
  );
}

// ─── Layout + buttons ────────────────────────────────────────────────────

export function EquipmentShell({ back, title, children }: { back?: { href: string; label: string }; title: string; children: ReactNode }) {
  return (
    <main className="min-h-screen bg-gray-50 px-4 py-6">
      <div className="mx-auto max-w-5xl space-y-5">
        {back ? (
          <Link href={back.href} className="inline-flex min-h-[48px] items-center gap-2 rounded-xl bg-white px-4 text-lg font-bold text-blue-800 shadow-sm hover:bg-gray-100">
            <span aria-hidden="true">←</span> {back.label}
          </Link>
        ) : null}
        <h1 className="text-3xl font-black text-gray-900">{title}</h1>
        {children}
      </div>
    </main>
  );
}

const BUTTON_TONES = {
  primary: "bg-blue-700 text-white hover:bg-blue-800",
  green: "bg-green-600 text-white hover:bg-green-700",
  amber: "bg-amber-100 text-amber-900 border-2 border-amber-300 hover:bg-amber-200",
  red: "bg-white text-red-700 border-2 border-red-300 hover:bg-red-50",
  plain: "bg-white text-gray-800 border-2 border-gray-300 hover:bg-gray-100",
} as const;

export function BigButton({
  icon,
  label,
  onClick,
  href,
  tone = "plain",
  disabled,
  className = "",
}: {
  icon?: string;
  label: string;
  onClick?: () => void;
  href?: string;
  tone?: keyof typeof BUTTON_TONES;
  disabled?: boolean;
  className?: string;
}) {
  const classes = `flex min-h-[64px] items-center justify-center gap-3 rounded-2xl px-5 text-xl font-bold shadow-sm disabled:opacity-50 ${BUTTON_TONES[tone]} ${className}`;
  const content = (
    <>
      {icon ? (
        <span className="text-2xl" aria-hidden="true">
          {icon}
        </span>
      ) : null}
      {label}
    </>
  );
  if (href) {
    return (
      <Link href={href} className={classes}>
        {content}
      </Link>
    );
  }
  return (
    <button type="button" onClick={onClick} disabled={disabled} className={classes}>
      {content}
    </button>
  );
}

export function ErrorNote({ message }: { message: string }) {
  if (!message) return null;
  return <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-lg font-semibold text-red-700">{message}</p>;
}

// Asked before anything destructive (retire, restore, delete, reset PIN…).
// Optional note box for actions that record one ("Found it").
export function ConfirmDialog({
  title,
  body,
  confirmLabel,
  tone = "primary",
  busy,
  error,
  noteLabel,
  onConfirm,
  onCancel,
}: {
  title: string;
  body?: string;
  confirmLabel: string;
  tone?: "primary" | "red" | "green";
  busy?: boolean;
  error?: string;
  noteLabel?: string;
  onConfirm: (note: string) => void;
  onCancel: () => void;
}) {
  const [note, setNote] = useState("");
  const confirmTone = tone === "red" ? "bg-red-600 text-white hover:bg-red-700" : tone === "green" ? BUTTON_TONES.green : BUTTON_TONES.primary;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true">
      <div className="w-full max-w-md space-y-4 rounded-3xl bg-white p-6 shadow-xl">
        <p className="text-2xl font-black text-gray-900">{title}</p>
        {body ? <p className="text-lg text-gray-700">{body}</p> : null}
        {noteLabel ? (
          <label className="block">
            <span className="text-lg font-bold text-gray-700">{noteLabel}</span>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              maxLength={1000}
              className="mt-2 w-full rounded-xl border-2 border-gray-300 p-3 text-lg outline-none focus:border-blue-600"
            />
          </label>
        ) : null}
        <ErrorNote message={error ?? ""} />
        <div className="grid grid-cols-2 gap-3">
          <button type="button" onClick={onCancel} disabled={busy} className={`min-h-[64px] rounded-2xl text-xl font-bold ${BUTTON_TONES.plain}`}>
            Cancel
          </button>
          <button type="button" onClick={() => onConfirm(note.trim())} disabled={busy} className={`min-h-[64px] rounded-2xl text-xl font-bold disabled:opacity-60 ${confirmTone}`}>
            {busy ? "…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Photo ───────────────────────────────────────────────────────────────

export function EquipmentPhoto({ url, name, className = "" }: { url: string; name: string; className?: string }) {
  if (!url) {
    return (
      <div className={`flex items-center justify-center bg-gray-100 text-6xl ${className}`} aria-label={name}>
        <span aria-hidden="true">🧰</span>
      </div>
    );
  }
  // eslint-disable-next-line @next/next/no-img-element -- Vercel Blob / pasted photo URL, admin-only view
  return <img src={url} alt={name} className={`bg-gray-100 object-cover ${className}`} />;
}

// ─── Add / Edit form ─────────────────────────────────────────────────────

export type EquipmentDraft = {
  name: string;
  serialNumber: string;
  categoryId: string;
  photoUrl: string;
  purchaseDate: string;
  purchaseCost: string;
  conditionNotes: string;
};

export function draftFromItem(item: EquipmentItem | null): EquipmentDraft {
  return {
    name: item?.name ?? "",
    serialNumber: item?.serialNumber ?? "",
    categoryId: item?.categoryId ?? "",
    photoUrl: item?.photoUrl ?? "",
    purchaseDate: item?.purchaseDate ?? "",
    purchaseCost: item?.purchaseCost ? String(item.purchaseCost) : "",
    conditionNotes: item?.conditionNotes ?? "",
  };
}

const inputClass = "mt-2 min-h-[56px] w-full rounded-xl border-2 border-gray-300 px-4 text-xl text-gray-900 outline-none focus:border-blue-600";

// Add (item = null → POST /api/equipment) or Edit (PATCH /api/equipment/[id]).
// Photo, name, tag and category up front; purchase details under "More details".
export function EquipmentForm({
  item,
  categories,
  onSaved,
  onCancel,
}: {
  item: EquipmentItem | null;
  categories: EquipmentCategory[];
  onSaved: (id: string) => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState<EquipmentDraft>(() => draftFromItem(item));
  const [showMore, setShowMore] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const set = (field: keyof EquipmentDraft) => (value: string) => setDraft((d) => ({ ...d, [field]: value }));

  async function uploadPhoto(file: File | undefined) {
    if (!file) return;
    setUploading(true);
    setError("");
    try {
      const { blob } = await resizeImageForUpload(file);
      const formData = new FormData();
      formData.set("photo", blob, "photo.jpg");
      const res = await fetch("/api/equipment/photo", { method: "POST", body: formData });
      const data = (await res.json()) as { success?: boolean; url?: string; error?: string };
      if (!data.success || !data.url) setError(data.error || "Photo upload failed.");
      else set("photoUrl")(data.url);
    } catch {
      setError("Photo upload failed. Try again.");
    } finally {
      setUploading(false);
    }
  }

  async function save() {
    const name = draft.name.trim();
    if (!name) {
      setError("Type a name first.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const payload = {
        name,
        serialNumber: draft.serialNumber.trim(),
        categoryId: draft.categoryId,
        photoUrl: draft.photoUrl,
        purchaseDate: draft.purchaseDate,
        purchaseCost: Number(draft.purchaseCost) || 0,
        conditionNotes: draft.conditionNotes,
      };
      const res = await fetch(item ? `/api/equipment/${encodeURIComponent(item.id)}` : "/api/equipment", {
        method: item ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await res.json()) as { success?: boolean; id?: string; error?: string };
      if (!data.success) {
        setError(data.error || "Could not save. Try again.");
        return;
      }
      onSaved(item ? item.id : data.id ?? "");
    } catch {
      setError("No connection. Try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4 rounded-3xl bg-white p-5 shadow-sm">
      <div className="flex flex-col items-center gap-3 sm:flex-row">
        <EquipmentPhoto url={draft.photoUrl} name={draft.name || "New equipment"} className="h-40 w-40 shrink-0 rounded-2xl" />
        <div className="grid w-full gap-3">
          <label className={`flex min-h-[64px] cursor-pointer items-center justify-center gap-3 rounded-2xl px-5 text-xl font-bold shadow-sm ${BUTTON_TONES.plain}`}>
            <span className="text-2xl" aria-hidden="true">
              📷
            </span>
            {uploading ? "Uploading…" : draft.photoUrl ? "Change photo" : "Add photo"}
            <input
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              disabled={uploading}
              onChange={(e) => {
                uploadPhoto(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
          </label>
          {draft.photoUrl ? (
            <button type="button" onClick={() => set("photoUrl")("")} className="text-base font-semibold text-gray-500 underline">
              Remove photo
            </button>
          ) : null}
        </div>
      </div>

      <label className="block">
        <span className="text-lg font-bold text-gray-800">Name</span>
        <input value={draft.name} onChange={(e) => set("name")(e.target.value)} placeholder="e.g. Floor buffer" className={inputClass} />
      </label>

      <label className="block">
        <span className="text-lg font-bold text-gray-800">Tag number</span>
        <input value={draft.serialNumber} onChange={(e) => set("serialNumber")(e.target.value)} placeholder="The number on the sticker" className={inputClass} />
      </label>

      <label className="block">
        <span className="text-lg font-bold text-gray-800">Type</span>
        <select value={draft.categoryId} onChange={(e) => set("categoryId")(e.target.value)} className={inputClass}>
          <option value="">No type</option>
          {categories
            .filter((c) => c.active || c.id === draft.categoryId)
            .map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
        </select>
      </label>

      <button type="button" onClick={() => setShowMore((v) => !v)} aria-expanded={showMore} className="min-h-[48px] text-lg font-bold text-blue-700">
        {showMore ? "▾ Hide more details" : "▸ More details (price, date, notes)"}
      </button>

      {showMore ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="text-lg font-bold text-gray-800">Bought on</span>
            <input type="date" value={draft.purchaseDate} onChange={(e) => set("purchaseDate")(e.target.value)} className={inputClass} />
          </label>
          <label className="block">
            <span className="text-lg font-bold text-gray-800">Price ($)</span>
            <input type="number" inputMode="decimal" value={draft.purchaseCost} onChange={(e) => set("purchaseCost")(e.target.value)} className={inputClass} />
          </label>
          <label className="block sm:col-span-2">
            <span className="text-lg font-bold text-gray-800">Notes</span>
            <textarea
              value={draft.conditionNotes}
              onChange={(e) => set("conditionNotes")(e.target.value)}
              rows={2}
              className="mt-2 w-full rounded-xl border-2 border-gray-300 p-3 text-xl outline-none focus:border-blue-600"
            />
          </label>
        </div>
      ) : null}

      <ErrorNote message={error} />

      <div className="grid gap-3 sm:grid-cols-2">
        <BigButton label="Cancel" onClick={onCancel} disabled={saving} />
        <BigButton icon="✔" label={saving ? "Saving…" : item ? "Save changes" : "Add equipment"} tone="green" onClick={save} disabled={saving || uploading} />
      </div>
    </div>
  );
}
