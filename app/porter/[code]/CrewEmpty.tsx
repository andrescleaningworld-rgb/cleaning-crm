"use client";

// Crew Link "🗑 Case empty" (lib/pg/shelves.ts): this site's shelf, a big
// photo and count per product. One tap = one empty case off the shelf. Red
// at 0, yellow at 1, green at 2 or more. In preview nothing is posted (the
// count only changes on this screen).
import { useEffect, useState } from "react";
import type { TeamHubLang } from "@/app/team-hub/teamHubStrings";
import { translated, type ContentTranslations } from "@/lib/translationKey";
import type { CrewLinkStrings } from "./strings";
import { ErrorBox, WhoAndWhen } from "./ui";
import { useCrewLinkPreview } from "./preview";

type Level = "green" | "yellow" | "red" | "none";
type ShelfItem = { supplyId: number; name: string; unit: string; photoUrl: string; qty: number; level: Level };

const levelOf = (qty: number): Level => (qty <= 0 ? "red" : qty === 1 ? "yellow" : "green");
const LEVEL_STYLE: Record<Level, string> = {
  green: "border-green-500 bg-green-50",
  yellow: "border-yellow-400 bg-yellow-50",
  red: "border-red-500 bg-red-50",
  none: "border-slate-300 bg-white",
};

export default function CrewEmpty({
  apiBase,
  s,
  lang,
  name,
  onNameChange,
}: {
  apiBase: string;
  s: CrewLinkStrings;
  lang: TeamHubLang;
  name: string;
  onNameChange: (name: string) => void;
}) {
  const preview = useCrewLinkPreview();
  const [shelf, setShelf] = useState<ShelfItem[] | null>(null);
  const [translations, setTranslations] = useState<ContentTranslations>({});
  const [busyId, setBusyId] = useState<number | null>(null);
  const [flash, setFlash] = useState<number | null>(null);
  const [error, setError] = useState("");
  const tr = (text: string) => translated(translations, text, lang);

  useEffect(() => {
    let alive = true;
    fetch(`${apiBase}/shelf`, { cache: "no-store" })
      .then((response) => response.json())
      .then((data: { success?: boolean; shelf?: ShelfItem[]; translations?: ContentTranslations }) => {
        if (!alive) return;
        setShelf(data.success ? (data.shelf ?? []) : []);
        setTranslations(data.translations ?? {});
      })
      .catch(() => alive && setShelf([]));
    return () => {
      alive = false;
    };
  }, [apiBase]);

  if (shelf === null) return <p className="p-6 text-center text-xl text-slate-600">{s.loading}</p>;

  async function empty(item: ShelfItem) {
    setError("");
    if (!name.trim()) return setError(s.writeYourName);
    if (item.qty <= 0) return;
    const show = (qty: number) => {
      setShelf((current) => (current ?? []).map((entry) => (entry.supplyId === item.supplyId ? { ...entry, qty, level: levelOf(qty) } : entry)));
      setFlash(item.supplyId);
      window.setTimeout(() => setFlash(null), 900);
      navigator.vibrate?.(15);
    };
    // Preview: nothing is posted; only this screen changes.
    if (preview) return show(item.qty - 1);
    setBusyId(item.supplyId);
    try {
      const response = await fetch(`${apiBase}/shelf`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "empty", supplyId: item.supplyId, reporterName: name.trim() }) });
      const data = (await response.json().catch(() => ({}))) as { success?: boolean; error?: string; qty?: number };
      if (!response.ok || !data.success) {
        setError(lang === "en" && data.error ? data.error : s.somethingWrong);
        return;
      }
      show(typeof data.qty === "number" ? data.qty : item.qty - 1);
    } catch {
      setError(s.noSignal);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-4">
      <WhoAndWhen s={s} lang={lang} name={name} onNameChange={onNameChange} />
      {shelf.length === 0 ? <p className="rounded-3xl bg-white p-6 text-center text-2xl font-bold text-slate-600">{s.shelfEmpty}</p> : <p className="px-1 text-xl font-bold text-slate-700">{s.emptyHint}</p>}
      <ErrorBox message={error} />
      <div className="grid grid-cols-2 gap-3">
        {shelf.map((item) => (
          <button
            key={item.supplyId}
            type="button"
            disabled={busyId !== null || item.qty <= 0}
            onClick={() => void empty(item)}
            className={`relative flex flex-col items-center gap-2 rounded-3xl border-4 p-3 text-center shadow-sm active:scale-95 disabled:opacity-60 ${LEVEL_STYLE[item.level]}`}
          >
            {item.photoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- product photo from Blob storage
              <img src={item.photoUrl} alt="" className="h-24 w-24 rounded-2xl bg-white object-contain" />
            ) : (
              <span className="flex h-24 w-24 items-center justify-center rounded-2xl bg-white text-5xl" aria-hidden="true">
                📦
              </span>
            )}
            <span className="text-6xl font-black leading-none text-slate-900">{item.qty}</span>
            <span className="text-lg font-bold leading-tight text-slate-800">{tr(item.name)}</span>
            {flash === item.supplyId ? <span className="absolute right-3 top-3 rounded-full bg-slate-900 px-3 py-1 text-xl font-black text-white">{s.takenOff}</span> : null}
          </button>
        ))}
      </div>
    </div>
  );
}
