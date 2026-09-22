"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import { resizeImageForUpload } from "@/lib/imageResize";

type SiteLinkItem = { id: number; name: string; unit: string };
type RecentEntry = {
  kind: "order" | "issue";
  id: number;
  summary: string;
  status: string;
  createdAt: string;
};

type LinkGetResponse = {
  success?: boolean;
  active?: boolean;
  label?: string;
  items?: SiteLinkItem[];
  recent?: RecentEntry[];
  error?: string;
};

type Lang = "en" | "es";

const CATEGORIES = ["restroom", "trash", "damage", "leak", "access", "supplies", "other"] as const;
type Category = (typeof CATEGORIES)[number];

const MAX_PHOTOS = 5;

const T = {
  en: {
    loading: "Loading…",
    notActiveTitle: "Link not active",
    notActiveBody: "This link is no longer active. Please contact your office for a new one.",
    tabOrder: "Order Supplies",
    tabIssue: "Report a Problem",
    noteOptional: "Note (optional)",
    submitOrder: "Submit Order",
    submitIssue: "Submit Report",
    submitting: "Submitting…",
    orderSuccessTitle: "Order submitted",
    orderSuccessBody: "Your supply order was sent. Thank you!",
    issueSuccessTitle: "Report submitted",
    issueSuccessBody: "Your report was sent. Thank you!",
    submitAnother: "Submit another",
    category: "Category",
    photos: "Photos (up to 5)",
    addPhoto: "Add Photo",
    recent: "Recent",
    noRecent: "No recent submissions yet.",
    statusNew: "New",
    statusOrdered: "Ordered",
    statusDelivered: "Delivered",
    statusCancelled: "Cancelled",
    statusOpen: "Open",
    statusResolved: "Resolved",
    addAtLeastOneItem: "Add at least one item before submitting.",
    genericError: "Something went wrong. Please try again.",
    categoryRestroom: "Restroom",
    categoryTrash: "Trash",
    categoryDamage: "Damage",
    categoryLeak: "Leak",
    categoryAccess: "Access / Lock",
    categorySupplies: "Supplies",
    categoryOther: "Other",
  },
  es: {
    loading: "Cargando…",
    notActiveTitle: "Enlace no activo",
    notActiveBody: "Este enlace ya no está activo. Por favor contacte a su oficina para uno nuevo.",
    tabOrder: "Pedir Suministros",
    tabIssue: "Reportar un Problema",
    noteOptional: "Nota (opcional)",
    submitOrder: "Enviar Pedido",
    submitIssue: "Enviar Reporte",
    submitting: "Enviando…",
    orderSuccessTitle: "Pedido enviado",
    orderSuccessBody: "Su pedido de suministros fue enviado. ¡Gracias!",
    issueSuccessTitle: "Reporte enviado",
    issueSuccessBody: "Su reporte fue enviado. ¡Gracias!",
    submitAnother: "Enviar otro",
    category: "Categoría",
    photos: "Fotos (hasta 5)",
    addPhoto: "Agregar Foto",
    recent: "Reciente",
    noRecent: "Todavía no hay envíos recientes.",
    statusNew: "Nuevo",
    statusOrdered: "Pedido",
    statusDelivered: "Entregado",
    statusCancelled: "Cancelado",
    statusOpen: "Abierto",
    statusResolved: "Resuelto",
    addAtLeastOneItem: "Agregue al menos un artículo antes de enviar.",
    genericError: "Algo salió mal. Por favor intente de nuevo.",
    categoryRestroom: "Baño",
    categoryTrash: "Basura",
    categoryDamage: "Daño",
    categoryLeak: "Fuga",
    categoryAccess: "Acceso / Cerradura",
    categorySupplies: "Suministros",
    categoryOther: "Otro",
  },
} as const;

// Widened to plain `string` values (both T.en and T.es share this shape,
// but their literal string values differ, e.g. "Loading…" vs "Cargando…"
// — the exact-literal type TypeScript infers for T.en can't hold T.es's
// values, so a translations object passed around at runtime needs this
// wider type rather than `(typeof T)["en"]`).
type Translations = { [K in keyof (typeof T)["en"]]: string };

function statusLabel(t: Translations, status: string): string {
  const key = `status${status.charAt(0).toUpperCase()}${status.slice(1)}` as keyof Translations;
  return t[key] || status;
}

function categoryLabel(t: Translations, category: string): string {
  const key = `category${category.charAt(0).toUpperCase()}${category.slice(1)}` as keyof Translations;
  return t[key] || category;
}

export default function SiteLinkPage() {
  const params = useParams();
  const token = Array.isArray(params.token) ? params.token[0] : (params.token ?? "");

  const [lang, setLang] = useState<Lang>("en");
  const t = T[lang];

  const [loading, setLoading] = useState(true);
  const [active, setActive] = useState<boolean | null>(null);
  const [label, setLabel] = useState("");
  const [items, setItems] = useState<SiteLinkItem[]>([]);
  const [recent, setRecent] = useState<RecentEntry[]>([]);

  const [tab, setTab] = useState<"order" | "issue">("order");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/site-link/${encodeURIComponent(token)}`, { cache: "no-store" });
      const data: LinkGetResponse = await res.json();
      if (!data.active) {
        setActive(false);
        return;
      }
      setActive(true);
      setLabel(data.label ?? "");
      setItems(data.items ?? []);
      setRecent(data.recent ?? []);
    } catch {
      setActive(false);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (token) load();
  }, [token, load]);

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-gray-50 p-6">
        <p className="text-base text-slate-500">{t.loading}</p>
      </main>
    );
  }

  if (!active) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-gray-50 p-6">
        <div className="w-full max-w-sm rounded-2xl bg-white p-6 text-center shadow-sm">
          <h1 className="text-xl font-bold text-slate-900">{t.notActiveTitle}</h1>
          <p className="mt-2 text-sm leading-6 text-slate-600">{t.notActiveBody}</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gray-50 pb-10">
      <div className="mx-auto max-w-lg">
        <header className="flex items-center justify-between bg-blue-700 px-4 py-5 text-white">
          <h1 className="text-lg font-bold">{label}</h1>
          <div className="flex gap-1 rounded-full bg-blue-800 p-1 text-xs font-semibold">
            <button
              type="button"
              onClick={() => setLang("en")}
              className={`rounded-full px-3 py-1.5 ${lang === "en" ? "bg-white text-blue-800" : "text-white"}`}
            >
              EN
            </button>
            <button
              type="button"
              onClick={() => setLang("es")}
              className={`rounded-full px-3 py-1.5 ${lang === "es" ? "bg-white text-blue-800" : "text-white"}`}
            >
              ES
            </button>
          </div>
        </header>

        <nav className="grid grid-cols-2 gap-2 bg-white p-3 shadow-sm">
          <button
            type="button"
            onClick={() => setTab("order")}
            className={`min-h-[52px] rounded-xl text-sm font-semibold ${
              tab === "order" ? "bg-blue-700 text-white" : "bg-gray-100 text-slate-700"
            }`}
          >
            {t.tabOrder}
          </button>
          <button
            type="button"
            onClick={() => setTab("issue")}
            className={`min-h-[52px] rounded-xl text-sm font-semibold ${
              tab === "issue" ? "bg-blue-700 text-white" : "bg-gray-100 text-slate-700"
            }`}
          >
            {t.tabIssue}
          </button>
        </nav>

        {error && (
          <div className="mx-3 mt-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            {error}
          </div>
        )}

        <div className="px-3">
          {tab === "order" ? (
            <OrderTab t={t} items={items} token={token} onSubmitted={load} onError={setError} />
          ) : (
            <IssueTab t={t} token={token} onSubmitted={load} onError={setError} />
          )}
        </div>

        <section className="mx-3 mt-4 rounded-2xl bg-white p-4 shadow-sm">
          <h2 className="text-sm font-bold text-slate-900">{t.recent}</h2>
          {recent.length === 0 ? (
            <p className="mt-2 text-sm text-slate-500">{t.noRecent}</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {recent.map((entry) => (
                <li
                  key={`${entry.kind}-${entry.id}`}
                  className="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2.5 text-sm"
                >
                  <span className="truncate pr-2 text-slate-700">{entry.summary}</span>
                  <span className="whitespace-nowrap rounded-full bg-blue-100 px-2.5 py-1 text-xs font-semibold text-blue-800">
                    {statusLabel(t, entry.status)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}

function OrderTab({
  t,
  items,
  token,
  onSubmitted,
  onError,
}: {
  t: Translations;
  items: SiteLinkItem[];
  token: string;
  onSubmitted: () => void;
  onError: (message: string) => void;
}) {
  const [qtys, setQtys] = useState<Record<number, number>>({});
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  const hasAnyQty = useMemo(() => Object.values(qtys).some((q) => q > 0), [qtys]);

  function updateQty(itemId: number, delta: number) {
    setQtys((current) => {
      const next = Math.max(0, (current[itemId] ?? 0) + delta);
      return { ...current, [itemId]: next };
    });
  }

  async function handleSubmit() {
    if (!hasAnyQty) {
      onError(t.addAtLeastOneItem);
      return;
    }
    onError("");
    setSubmitting(true);
    try {
      const lines = Object.entries(qtys)
        .filter(([, qty]) => qty > 0)
        .map(([itemId, qty]) => ({ itemId: Number(itemId), qty }));

      const res = await fetch(`/api/site-link/${encodeURIComponent(token)}/order`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lines, note }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        onError(data.error || t.genericError);
        return;
      }
      setSuccess(true);
      setQtys({});
      setNote("");
      onSubmitted();
    } catch {
      onError(t.genericError);
    } finally {
      setSubmitting(false);
    }
  }

  if (success) {
    return (
      <SuccessScreen
        title={t.orderSuccessTitle}
        body={t.orderSuccessBody}
        actionLabel={t.submitAnother}
        onAction={() => setSuccess(false)}
      />
    );
  }

  return (
    <div className="mt-3 space-y-3">
      <div className="divide-y divide-gray-100 rounded-2xl bg-white shadow-sm">
        {items.map((item) => (
          <div key={item.id} className="flex items-center justify-between px-4 py-4">
            <div>
              <p className="text-sm font-semibold text-slate-900">{item.name}</p>
              <p className="text-xs text-slate-500">{item.unit}</p>
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => updateQty(item.id, -1)}
                className="flex h-11 w-11 items-center justify-center rounded-full bg-gray-100 text-xl font-bold text-slate-700 active:bg-gray-200"
                aria-label="decrease"
              >
                −
              </button>
              <span className="w-6 text-center text-base font-bold text-slate-900">
                {qtys[item.id] ?? 0}
              </span>
              <button
                type="button"
                onClick={() => updateQty(item.id, 1)}
                className="flex h-11 w-11 items-center justify-center rounded-full bg-blue-700 text-xl font-bold text-white active:bg-blue-800"
                aria-label="increase"
              >
                +
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className="rounded-2xl bg-white p-4 shadow-sm">
        <label className="text-sm font-semibold text-slate-700">{t.noteOptional}</label>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={3}
          className="mt-1.5 w-full rounded-xl border border-gray-300 px-3 py-2.5 text-base outline-none focus:border-blue-500"
        />
      </div>

      <button
        type="button"
        onClick={handleSubmit}
        disabled={submitting}
        className="min-h-[56px] w-full rounded-xl bg-blue-700 text-base font-bold text-white disabled:opacity-60"
      >
        {submitting ? t.submitting : t.submitOrder}
      </button>
    </div>
  );
}

function IssueTab({
  t,
  token,
  onSubmitted,
  onError,
}: {
  t: Translations;
  token: string;
  onSubmitted: () => void;
  onError: (message: string) => void;
}) {
  const [category, setCategory] = useState<Category>("restroom");
  const [note, setNote] = useState("");
  const [photos, setPhotos] = useState<{ file: Blob; previewUrl: string }[]>([]);
  const [resizing, setResizing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  async function handlePickPhotos(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return;
    onError("");
    setResizing(true);
    try {
      const remaining = MAX_PHOTOS - photos.length;
      const filesToAdd = Array.from(fileList).slice(0, Math.max(0, remaining));
      const resized = await Promise.all(
        filesToAdd.map(async (file) => {
          const { blob } = await resizeImageForUpload(file);
          return { file: blob, previewUrl: URL.createObjectURL(blob) };
        })
      );
      setPhotos((current) => [...current, ...resized]);
    } finally {
      setResizing(false);
    }
  }

  function removePhoto(index: number) {
    setPhotos((current) => {
      const target = current[index];
      if (target) URL.revokeObjectURL(target.previewUrl);
      return current.filter((_, i) => i !== index);
    });
  }

  async function handleSubmit() {
    onError("");
    setSubmitting(true);
    try {
      const formData = new FormData();
      formData.set("category", category);
      formData.set("note", note);
      photos.forEach((p, i) => formData.append("photos", p.file, `photo-${i}.jpg`));

      const res = await fetch(`/api/site-link/${encodeURIComponent(token)}/issue`, {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        onError(data.error || t.genericError);
        return;
      }
      setSuccess(true);
      setNote("");
      photos.forEach((p) => URL.revokeObjectURL(p.previewUrl));
      setPhotos([]);
      onSubmitted();
    } catch {
      onError(t.genericError);
    } finally {
      setSubmitting(false);
    }
  }

  if (success) {
    return (
      <SuccessScreen
        title={t.issueSuccessTitle}
        body={t.issueSuccessBody}
        actionLabel={t.submitAnother}
        onAction={() => setSuccess(false)}
      />
    );
  }

  return (
    <div className="mt-3 space-y-3">
      <div className="rounded-2xl bg-white p-4 shadow-sm">
        <label className="text-sm font-semibold text-slate-700">{t.category}</label>
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value as Category)}
          className="mt-1.5 min-h-[52px] w-full rounded-xl border border-gray-300 px-3 text-base outline-none focus:border-blue-500"
        >
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {categoryLabel(t, c)}
            </option>
          ))}
        </select>
      </div>

      <div className="rounded-2xl bg-white p-4 shadow-sm">
        <label className="text-sm font-semibold text-slate-700">{t.noteOptional}</label>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={3}
          className="mt-1.5 w-full rounded-xl border border-gray-300 px-3 py-2.5 text-base outline-none focus:border-blue-500"
        />
      </div>

      <div className="rounded-2xl bg-white p-4 shadow-sm">
        <label className="text-sm font-semibold text-slate-700">{t.photos}</label>
        <div className="mt-2 grid grid-cols-3 gap-2">
          {photos.map((p, i) => (
            <div key={p.previewUrl} className="relative aspect-square overflow-hidden rounded-xl bg-gray-100">
              {/* eslint-disable-next-line @next/next/no-img-element -- local object URL preview, not an optimizable remote/static asset */}
              <img src={p.previewUrl} alt="" className="h-full w-full object-cover" />
              <button
                type="button"
                onClick={() => removePhoto(i)}
                className="absolute right-1 top-1 flex h-7 w-7 items-center justify-center rounded-full bg-black/60 text-sm font-bold text-white"
                aria-label="remove"
              >
                ×
              </button>
            </div>
          ))}
          {photos.length < MAX_PHOTOS && (
            <label className="flex aspect-square cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-gray-300 text-xs font-semibold text-slate-500">
              {resizing ? t.loading : t.addPhoto}
              <input
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                disabled={resizing}
                onChange={(e) => {
                  handlePickPhotos(e.target.files);
                  e.target.value = "";
                }}
              />
            </label>
          )}
        </div>
      </div>

      <button
        type="button"
        onClick={handleSubmit}
        disabled={submitting}
        className="min-h-[56px] w-full rounded-xl bg-blue-700 text-base font-bold text-white disabled:opacity-60"
      >
        {submitting ? t.submitting : t.submitIssue}
      </button>
    </div>
  );
}

function SuccessScreen({
  title,
  body,
  actionLabel,
  onAction,
}: {
  title: string;
  body: string;
  actionLabel: string;
  onAction: () => void;
}) {
  return (
    <div className="mt-3 rounded-2xl bg-white p-6 text-center shadow-sm">
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-green-100 text-3xl text-green-700">
        ✓
      </div>
      <h2 className="mt-3 text-lg font-bold text-slate-900">{title}</h2>
      <p className="mt-1 text-sm text-slate-600">{body}</p>
      <button
        type="button"
        onClick={onAction}
        className="mt-4 min-h-[52px] w-full rounded-xl bg-blue-700 text-sm font-bold text-white"
      >
        {actionLabel}
      </button>
    </div>
  );
}
