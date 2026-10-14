"use client";

// Supplies -> Shelves: stock at a glance (lib/pg/shelves.ts, migration 038).
// The office shelf, then each site's shelf: product photo, big count,
// green / yellow / red. Tap an office product for the two office buttons:
// 📥 Received from vendor and 🚚 Sent to site. Orders are sent from the
// Supply Orders page. Renders a short note where migration 038 is not in yet.

import { useCallback, useEffect, useMemo, useState } from "react";
import { AutocompleteField, useAllAccountOptions, type SearchOption } from "@/app/sub-schedules/autocomplete";
import { BigButton, EmptyState, ErrorBox, Sheet, SkeletonList, showToast } from "@/app/ui";

type Level = "green" | "yellow" | "red" | "none";
type Tile = { supplyId: number; name: string; code: string; unit: string; photoUrl: string; qty: number | null; level: Level };
type Site = { accountId: string; accountName: string; tiles: Tile[] };
type Data = { ready: boolean; office: Tile[]; sites: Site[] };

const LEVEL_STYLE: Record<Level, string> = {
  green: "border-green-500 bg-green-50 text-green-900",
  yellow: "border-yellow-400 bg-yellow-50 text-yellow-900",
  red: "border-red-500 bg-red-50 text-red-900",
  none: "border-slate-300 bg-slate-50 text-slate-700",
};

export function ShelfTile({ tile, onClick }: { tile: Tile; onClick?: () => void }) {
  const body = (
    <>
      {tile.photoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- product photo from Blob storage
        <img src={tile.photoUrl} alt="" className="h-20 w-20 rounded-xl bg-white object-contain" />
      ) : (
        <span className="flex h-20 w-20 items-center justify-center rounded-xl bg-white text-4xl" aria-hidden="true">
          📦
        </span>
      )}
      <span className="text-5xl font-black leading-none">{tile.qty === null ? "?" : tile.qty}</span>
      <span className="line-clamp-2 text-sm font-bold leading-tight">{tile.name}</span>
    </>
  );
  const className = `flex w-full flex-col items-center gap-2 rounded-2xl border-4 p-3 text-center ${LEVEL_STYLE[tile.level]}`;
  return onClick ? (
    <button type="button" onClick={onClick} className={`${className} active:scale-95`} data-shelf-tile={tile.supplyId}>
      {body}
    </button>
  ) : (
    <div className={className} data-shelf-tile={tile.supplyId}>
      {body}
    </div>
  );
}

const GRID = "grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5";

function Stepper({ value, onChange, disabled }: { value: number; onChange: (n: number) => void; disabled?: boolean }) {
  const button = "flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-200 text-4xl font-black active:bg-slate-300 disabled:opacity-40";
  return (
    <div className="flex items-center justify-center gap-5">
      <button type="button" className={button} disabled={disabled || value <= 1} onClick={() => onChange(Math.max(1, value - 1))} aria-label="One less">
        −
      </button>
      <span className="min-w-[3ch] text-center text-6xl font-black">{value}</span>
      <button type="button" className={button} disabled={disabled || value >= 999} onClick={() => onChange(Math.min(999, value + 1))} aria-label="One more">
        +
      </button>
    </div>
  );
}

export default function Shelves() {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState("");
  const [open, setOpen] = useState<Tile | null>(null);
  const [mode, setMode] = useState<"pick" | "received" | "send">("pick");
  const [qty, setQty] = useState(1);
  const [siteQuery, setSiteQuery] = useState("");
  const [site, setSite] = useState<SearchOption | null>(null);
  const [busy, setBusy] = useState(false);
  const [sheetError, setSheetError] = useState("");
  const { options: accounts, loading: accountsLoading } = useAllAccountOptions();

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/shelves", { cache: "no-store" });
      const body = (await response.json()) as Partial<Data> & { success?: boolean; error?: string };
      if (!response.ok || !body.success) throw new Error(body.error || "The shelves did not load.");
      setData({ ready: body.ready === true, office: body.office ?? [], sites: body.sites ?? [] });
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "The shelves did not load.");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const siteMatches = useMemo(() => {
    const words = siteQuery.trim().toLowerCase();
    return words ? accounts.filter((option) => option.label.toLowerCase().includes(words)).slice(0, 8) : [];
  }, [accounts, siteQuery]);

  function openTile(tile: Tile) {
    setOpen(tile);
    setMode("pick");
    setQty(1);
    setSite(null);
    setSiteQuery("");
    setSheetError("");
  }

  async function act() {
    if (!open) return;
    setSheetError("");
    setBusy(true);
    try {
      const body =
        mode === "received"
          ? { action: "received", supplyId: open.supplyId, qty }
          : { action: "send", accountId: site?.id ?? "", accountName: site?.label ?? "", lines: [{ supplyId: open.supplyId, qty }] };
      if (mode === "send" && !site) throw new Error("Pick the site first.");
      const response = await fetch("/api/shelves", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const result = (await response.json().catch(() => ({}))) as { success?: boolean; error?: string };
      if (!response.ok || !result.success) throw new Error(result.error || "That did not save. Try again.");
      showToast(mode === "received" ? `📥 ${qty} added to the office shelf ✓` : `🚚 ${qty} sent to ${site?.label} ✓`);
      setOpen(null);
      await load();
    } catch (err) {
      setSheetError(err instanceof Error ? err.message : "That did not save. Try again.");
    } finally {
      setBusy(false);
    }
  }

  if (error) return <ErrorBox title="The shelves did not load." text={error} onRetry={() => void load()} />;
  if (!data) return <SkeletonList rows={4} />;
  if (!data.ready) return <EmptyState title="Shelves are not turned on here yet" text="They come with tonight's update." />;

  const big = "flex min-h-[88px] w-full items-center justify-center gap-3 rounded-3xl px-4 text-2xl font-black shadow-sm active:scale-[0.98] disabled:opacity-50";

  return (
    <div className="ui-stack" data-shelves>
      <section className="ui-stack">
        <h2 className="text-2xl font-black">🏢 Office shelf</h2>
        <p className="ui-muted" style={{ margin: 0 }}>
          Tap a product to add what came in, or send it to a site.
        </p>
        {data.office.length === 0 ? <p className="ui-muted">No products yet.</p> : null}
        <div className={GRID}>
          {data.office.map((tile) => (
            <ShelfTile key={tile.supplyId} tile={tile} onClick={() => openTile(tile)} />
          ))}
        </div>
      </section>

      <section className="ui-stack">
        <h2 className="text-2xl font-black">📍 Site shelves</h2>
        {data.sites.length === 0 ? <p className="ui-muted">Nothing has arrived at a site yet. A site shows here once a crew confirms a delivery.</p> : null}
        {data.sites.map((shelf) => (
          <div key={shelf.accountId} className="ui-card" data-site-shelf={shelf.accountId}>
            <p className="ui-card-title" style={{ margin: "0 0 8px" }}>
              {shelf.accountName}
            </p>
            <div className={GRID}>
              {shelf.tiles.map((tile) => (
                <ShelfTile key={tile.supplyId} tile={tile} />
              ))}
            </div>
          </div>
        ))}
      </section>

      <Sheet open={open !== null} title={open?.name ?? ""} text={open ? `Office shelf: ${open.qty === null ? "not counted yet" : open.qty}${open.unit ? ` ${open.unit}` : ""}` : ""} onClose={() => setOpen(null)} closeLabel="Close" busy={busy}>
        {open && mode === "pick" ? (
          <div className="ui-stack">
            <button type="button" className={`${big} bg-green-600 text-white`} onClick={() => setMode("received")}>
              📥 Received from vendor
            </button>
            <button type="button" className={`${big} bg-blue-700 text-white`} onClick={() => setMode("send")}>
              🚚 Sent to site
            </button>
          </div>
        ) : null}
        {open && mode !== "pick" ? (
          <div className="ui-stack">
            <p className="text-center text-xl font-black">{mode === "received" ? "📥 How many came in?" : "🚚 How many are you sending?"}</p>
            <Stepper value={qty} onChange={setQty} disabled={busy} />
            {mode === "send" ? (
              <AutocompleteField
                label="To which site?"
                placeholder="Type the site name"
                query={siteQuery}
                onQueryChange={setSiteQuery}
                options={siteMatches}
                loading={accountsLoading}
                selected={site}
                onSelect={(option) => {
                  setSite(option);
                  setSiteQuery(option.label);
                }}
                onClear={() => {
                  setSite(null);
                  setSiteQuery("");
                }}
                minChars={1}
                emptyText="No accounts found"
              />
            ) : null}
            {sheetError ? <p className="ui-field-error">{sheetError}</p> : null}
            <button type="button" className={`${big} ${mode === "received" ? "bg-green-600" : "bg-blue-700"} text-white`} disabled={busy || (mode === "send" && !site)} onClick={() => void act()}>
              {busy ? "Saving…" : "✓ Confirm"}
            </button>
            <BigButton kind="quiet" disabled={busy} onClick={() => setMode("pick")}>
              Back
            </BigButton>
          </div>
        ) : null}
      </Sheet>
    </div>
  );
}
