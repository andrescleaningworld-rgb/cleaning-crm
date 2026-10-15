"use client";

// The sub portal's "📦 Supplies arrived" and "🗑 Case empty" (lib/pg/shelves.ts,
// app/api/subcontractor-portal/shelf). Pick the site, then:
//   arrived   what is on its way, items pre-filled with what was ordered;
//             "All arrived", or − / + then "Confirm what arrived". Only what
//             came goes on the site's shelf; anything short stays on its way
//             (a back order), extra goes on the shelf too
//   empty     the site's shelf, big photo and count; one tap = one empty case
// The same as Crew Link's two screens, in the portal's own look.
import { useEffect, useState, type ReactNode } from "react";
import { BigStepper, asOrdered, rowTone } from "@/app/porter/[code]/CrewArrived";
import { SUB_WORDS } from "@/app/ui/words";

type Site = { accountId: string; accountName: string };
type Line = { name: string; unit: string; qty: number };
type Waiting = { key: string; at: string; backOrder?: boolean; lines: Line[] };
type ShelfItem = { supplyId: number; name: string; unit: string; photoUrl: string; qty: number };

const API = "/api/subcontractor-portal/shelf";
const levelClass = (qty: number) => (qty <= 0 ? "border-red-500 bg-red-50" : qty === 1 ? "border-yellow-400 bg-yellow-50" : "border-green-500 bg-green-50");

export default function SubShelf({
  mode,
  sites,
  words,
  header,
  onConfirmed,
}: {
  mode: "arrived" | "empty";
  sites: Site[];
  words: (typeof SUB_WORDS)["en"];
  /** The screen's title row with its Back button. */
  header: ReactNode;
  onConfirmed: () => void;
}) {
  const [site, setSite] = useState<Site | null>(sites.length === 1 ? sites[0] : null);
  const [data, setData] = useState<{ waiting: Waiting[]; shelf: ShelfItem[] } | null>(null);
  const [openKey, setOpenKey] = useState("");
  const [got, setGot] = useState<number[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!site) return;
    let alive = true;
    fetch(`${API}?accountId=${encodeURIComponent(site.accountId)}`, { cache: "no-store" })
      .then((response) => response.json())
      .then((body: { success?: boolean; waiting?: Waiting[]; shelf?: ShelfItem[]; error?: string }) => {
        if (!alive) return;
        if (!body.success) {
          setError(body.error || words.notSent);
          setData({ waiting: [], shelf: [] });
          return;
        }
        const waiting = body.waiting ?? [];
        setData({ waiting, shelf: body.shelf ?? [] });
        if (waiting.length === 1) {
          setOpenKey(waiting[0].key);
          setGot(waiting[0].lines.map((line) => line.qty));
        }
      })
      .catch(() => alive && setError(words.notSent));
    return () => {
      alive = false;
    };
  }, [site, words.notSent]);

  async function post(body: Record<string, unknown>): Promise<{ qty?: number } | null> {
    setError("");
    setBusy(true);
    try {
      const response = await fetch(API, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ accountId: site?.accountId, ...body }) });
      const result = (await response.json().catch(() => ({}))) as { success?: boolean; error?: string; qty?: number };
      if (!response.ok || !result.success) throw new Error(result.error || words.notSent);
      return result;
    } catch (err) {
      setError(err instanceof Error ? err.message : words.notSent);
      return null;
    } finally {
      setBusy(false);
    }
  }

  const open = data?.waiting.find((entry) => entry.key === openKey) ?? null;

  return (
    <section className="ui-stack" data-sub-shelf={mode}>
      {header}
      {!site || sites.length > 1 ? (
        <div className="ui-stack">
          <p className="ui-strong">{words.pickSite}</p>
          <div className="sub-sites" role="group" aria-label={words.pickSite}>
            {sites.map((entry) => (
              <button
                key={entry.accountId || entry.accountName}
                type="button"
                className="ui-chip"
                aria-pressed={site?.accountId === entry.accountId}
                onClick={() => {
                  setSite(entry);
                  setData(null);
                  setOpenKey("");
                  setError("");
                }}
              >
                {entry.accountName}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {site && !data ? <p className="ui-muted">…</p> : null}

      {site && data && mode === "arrived" ? (
        <div className="ui-stack">
          {data.waiting.length === 0 ? <p className="ui-strong">{words.nothingOnTheWay}</p> : null}
          {!open && data.waiting.length > 1
            ? data.waiting.map((entry) => (
                <button
                  key={entry.key}
                  type="button"
                  className="sub-row"
                  onClick={() => {
                    setOpenKey(entry.key);
                    setGot(entry.lines.map((line) => line.qty));
                  }}
                >
                  <span>{entry.backOrder ? `⏳ ${words.backOrder}: ` : "📦 "}{entry.lines.map((line) => `${line.qty} ${line.name}`).join(", ")}</span>
                  <span aria-hidden="true">›</span>
                </button>
              ))
            : null}
          {open ? (
            <>
              {open.backOrder ? <p className="ui-strong">⏳ {words.backOrder}</p> : null}
              <p className="ui-strong">{words.fixShort}</p>
              {open.lines.map((line, index) => (
                <div key={`${line.name}-${index}`} className={`flex items-center justify-between gap-3 rounded-3xl p-4 ${rowTone(line.qty, got[index])}`}>
                  <div className="min-w-0">
                    <p className="text-xl font-black">{line.name}</p>
                    <p className="ui-muted" style={{ margin: 0 }}>
                      {words.ordered(line.qty)}
                      {line.unit ? ` · ${line.unit}` : ""}
                    </p>
                  </div>
                  <BigStepper value={got[index] ?? line.qty} onChange={(n) => setGot((current) => current.map((value, i) => (i === index ? n : value)))} />
                </div>
              ))}
              <button
                type="button"
                className="sub-big sub-big-green"
                disabled={busy}
                onClick={async () => {
                  if (await post({ action: "arrive", key: open.key, got })) onConfirmed();
                }}
              >
                <span>{busy ? words.sending : `✓ ${asOrdered(open.lines, got) ? words.allArrived : words.confirmWhatCame}`}</span>
              </button>
            </>
          ) : null}
        </div>
      ) : null}

      {site && data && mode === "empty" ? (
        <div className="ui-stack">
          <p className="ui-strong">{data.shelf.length === 0 ? words.shelfEmpty : words.emptyHint}</p>
          <div className="grid grid-cols-2 gap-3">
            {data.shelf.map((item) => (
              <button
                key={item.supplyId}
                type="button"
                disabled={busy || item.qty <= 0}
                onClick={async () => {
                  const result = await post({ action: "empty", supplyId: item.supplyId });
                  if (result) setData((current) => (current ? { ...current, shelf: current.shelf.map((entry) => (entry.supplyId === item.supplyId ? { ...entry, qty: result.qty ?? entry.qty - 1 } : entry)) } : current));
                }}
                className={`flex flex-col items-center gap-2 rounded-3xl border-4 p-3 text-center active:scale-95 disabled:opacity-60 ${levelClass(item.qty)}`}
              >
                {item.photoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element -- product photo from Blob storage
                  <img src={item.photoUrl} alt="" className="h-24 w-24 rounded-2xl bg-white object-contain" />
                ) : (
                  <span className="flex h-24 w-24 items-center justify-center rounded-2xl bg-white text-5xl" aria-hidden="true">
                    📦
                  </span>
                )}
                <span className="text-6xl font-black leading-none">{item.qty}</span>
                <span className="text-lg font-bold leading-tight">{item.name}</span>
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {error ? <p className="ui-field-error">{error}</p> : null}
    </section>
  );
}
