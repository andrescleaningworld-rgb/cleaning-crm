"use client";

// Crew Link "📦 Supplies arrived" (lib/pg/shelves.ts): what is on its way to
// this site, items pre-filled. − / + fixes anything short or missing; Confirm
// puts what came on the site shelf and marks the order Delivered. The office
// hears about anything short. In preview nothing is posted.
import { useEffect, useState } from "react";
import type { TeamHubLang } from "@/app/team-hub/teamHubStrings";
import { translated, type ContentTranslations } from "@/lib/translationKey";
import { formatCrewDateTime } from "@/lib/crewDateTime";
import type { CrewLinkStrings } from "./strings";
import { ErrorBox, SendBar, WhoAndWhen } from "./ui";
import { useCrewLinkPreview } from "./preview";

type Line = { name: string; unit: string; qty: number };
type Waiting = { key: string; at: string; lines: Line[] };

export function BigStepper({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  const button = "flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-slate-200 text-4xl font-black active:bg-slate-300 disabled:opacity-40";
  return (
    <div className="flex items-center gap-3">
      <button type="button" className={button} disabled={value <= 0} onClick={() => onChange(Math.max(0, value - 1))} aria-label="−1">
        −
      </button>
      <span className="min-w-[2.5ch] text-center text-5xl font-black">{value}</span>
      <button type="button" className={button} disabled={value >= 999} onClick={() => onChange(Math.min(999, value + 1))} aria-label="+1">
        +
      </button>
    </div>
  );
}

export default function CrewArrived({
  apiBase,
  s,
  lang,
  name,
  onNameChange,
  onSent,
}: {
  apiBase: string;
  s: CrewLinkStrings;
  lang: TeamHubLang;
  name: string;
  onNameChange: (name: string) => void;
  onSent: () => void;
}) {
  const preview = useCrewLinkPreview();
  const [waiting, setWaiting] = useState<Waiting[] | null>(null);
  const [translations, setTranslations] = useState<ContentTranslations>({});
  const [openKey, setOpenKey] = useState("");
  const [got, setGot] = useState<number[]>([]);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const tr = (text: string) => translated(translations, text, lang);

  useEffect(() => {
    let alive = true;
    fetch(`${apiBase}/shelf`, { cache: "no-store" })
      .then((response) => response.json())
      .then((data: { success?: boolean; waiting?: Waiting[]; translations?: ContentTranslations }) => {
        if (!alive) return;
        const list = data.success ? (data.waiting ?? []) : [];
        setWaiting(list);
        setTranslations(data.translations ?? {});
        // Only one delivery: open it straight away.
        if (list.length === 1) {
          setOpenKey(list[0].key);
          setGot(list[0].lines.map((line) => line.qty));
        }
      })
      .catch(() => alive && setWaiting([]));
    return () => {
      alive = false;
    };
  }, [apiBase]);

  if (waiting === null) return <p className="p-6 text-center text-xl text-slate-600">{s.loading}</p>;
  const open = waiting.find((entry) => entry.key === openKey) ?? null;

  async function confirm() {
    if (!open || !name.trim()) return;
    // Preview: nothing is posted; the page shows "Preview only — not sent".
    if (preview) return onSent();
    setSending(true);
    setError("");
    try {
      const response = await fetch(`${apiBase}/shelf`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "arrive", key: open.key, got, reporterName: name.trim() }) });
      const data = (await response.json().catch(() => ({}))) as { success?: boolean; error?: string };
      if (!response.ok || !data.success) {
        setError(lang === "en" && data.error ? data.error : s.somethingWrong);
        return;
      }
      navigator.vibrate?.([15, 60, 15]);
      onSent();
    } catch {
      setError(s.noSignal);
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="space-y-4">
      <WhoAndWhen s={s} lang={lang} name={name} onNameChange={onNameChange} />

      {waiting.length === 0 ? <p className="rounded-3xl bg-white p-6 text-center text-2xl font-bold text-slate-600">{s.nothingOnTheWay}</p> : null}

      {!open && waiting.length > 1
        ? waiting.map((entry) => (
            <button
              key={entry.key}
              type="button"
              onClick={() => {
                setOpenKey(entry.key);
                setGot(entry.lines.map((line) => line.qty));
              }}
              className="flex min-h-[96px] w-full items-center gap-4 rounded-3xl bg-white px-5 text-left shadow-sm active:bg-gray-100"
            >
              <span className="text-5xl" aria-hidden="true">
                📦
              </span>
              <span>
                <span className="block text-2xl font-black text-slate-900">{formatCrewDateTime(entry.at)}</span>
                <span className="block text-lg text-slate-600">{entry.lines.map((line) => `${line.qty} ${tr(line.name)}`).join(", ")}</span>
              </span>
            </button>
          ))
        : null}

      {open ? (
        <>
          <p className="px-1 text-xl font-bold text-slate-700">{s.fixShort}</p>
          {open.lines.map((line, index) => (
            <div key={`${line.name}-${index}`} className={`flex items-center justify-between gap-3 rounded-3xl p-4 shadow-sm ${got[index] < line.qty ? "bg-amber-100" : "bg-white"}`}>
              <div className="min-w-0">
                <p className="text-2xl font-black text-slate-900">{tr(line.name)}</p>
                <p className="text-lg text-slate-600">
                  {s.ordered(line.qty)}
                  {line.unit ? ` · ${tr(line.unit)}` : ""}
                </p>
              </div>
              <BigStepper value={got[index] ?? line.qty} onChange={(n) => setGot((current) => current.map((value, i) => (i === index ? n : value)))} />
            </div>
          ))}
          <ErrorBox message={error} />
          <SendBar label={`✓ ${s.confirm}`} busyLabel={s.sending} busy={sending} disabled={!name.trim()} onClick={() => void confirm()} hint={!name.trim() ? s.writeYourName : undefined} />
        </>
      ) : null}
    </div>
  );
}
