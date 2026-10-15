"use client";

// Supplies -> 🏬 Warehouse and sites: all the stock on one screen
// (lib/pg/shelves.ts, lib/pg/supply-control.ts).
//
//   + Stock came in     items, how many, the vendor, and whose it is:
//                       Cleaning World's, or bought for a customer (kept at
//                       the warehouse for them)
//   Warehouse           photo, big count, green / yellow / red; tap one for
//                       its facts (count, minimum, cost, vendor, place,
//                       photo). A changed count needs a short reason.
//   Reorder             what is at or below its minimum
//   Kept for customers  stock at the warehouse that belongs to a customer
//   Sites               each site's stock (an account's page has its own)
//   This month          what went to each site, in dollars
//   History             who, what, when, and where it was done
//
// Orders are not here: they are the Supply Orders inbox. Taking supplies is
// the tablet (Supply Check).

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AutocompleteField, useAllAccountOptions, type SearchOption } from "@/app/sub-schedules/autocomplete";
import { BigButton, CHEER, Card, Counts, EmptyState, ErrorBox, Field, Sheet, SkeletonList, showToast } from "@/app/ui";
import AccountLink from "../components/AccountLink";
import { PickLines, useSupplyProducts, type PickLine } from "../components/supply-pick";

type Level = "green" | "yellow" | "red" | "none";
type Tile = { supplyId: number; name: string; code: string; unit: string; photoUrl: string; qty: number | null; level: Level };
type Site = { accountId: string; accountName: string; tiles: Tile[]; held: Tile[] };
type ShelfItem = { id: number; name: string; category: string; unit: string; photoUrl: string; unitCost: number | null; vendor: string; shelfLocation: string; minLevel: number | null; shelfCount: number | null; low: boolean };
type SpendRow = { accountId: string; accountName: string; amount: number; items: number; mode: "included" | "billed"; invoiced: boolean };
export type Move = { id: number; itemName: string; qty: number; kind: string; accountId: string; accountName: string; cost: number; staffName: string; note: string; source: string; at: string };
type Warehouse = { shelf: ShelfItem[]; reorder: ShelfItem[]; spend: { month: string; rows: SpendRow[]; total: number }; moves: Move[] };

const LEVEL_STYLE: Record<Level, string> = {
  green: "border-green-500 bg-green-50 text-green-900",
  yellow: "border-yellow-400 bg-yellow-50 text-yellow-900",
  red: "border-red-500 bg-red-50 text-red-900",
  none: "border-slate-300 bg-slate-50 text-slate-700",
};
const GRID = "grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5";
const dollars = (value: number) => `$${value.toFixed(2)}`;

/** Warehouse color: red at or below the minimum, yellow up to twice that, green above; no minimum: red 0, yellow 1. */
function warehouseLevel(item: ShelfItem): Level {
  if (item.shelfCount === null) return "none";
  const min = item.minLevel;
  if (min !== null && min > 0) return item.shelfCount <= min ? "red" : item.shelfCount <= min * 2 ? "yellow" : "green";
  return item.shelfCount <= 0 ? "red" : item.shelfCount === 1 ? "yellow" : "green";
}

export function ShelfTile({ tile, onClick, caption }: { tile: Tile; onClick?: () => void; caption?: string }) {
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
      {caption ? <span className="text-xs font-semibold opacity-80">{caption}</span> : null}
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

/* ---------- history ---------- */

const MOVE_WORD: Record<string, string> = {
  take: "Taken",
  return: "Brought back",
  pick: "Picked",
  receive: "Came in",
  count: "Counted",
  set: "Count changed",
  send: "Sent to site",
  arrive: "Arrived at site",
  empty: "Case empty",
  lost: "Lost (Cleaning World loss)",
  "site-add": "Added at site",
  "site-set": "Site count changed",
};
const SOURCE_WORD: Record<string, string> = { office: "Office", tablet: "Tablet", "crew-link": "Crew Link", "sub-portal": "Sub portal" };

/** Who, what, when, where it went and where it was done. Used here and on an account's Site stock. */
export function HistoryList({ moves, showAccount = true, empty = "Nothing yet." }: { moves: Move[]; showAccount?: boolean; empty?: string }) {
  if (moves.length === 0) return <p className="ui-muted">{empty}</p>;
  return (
    <ul className="ui-list-plain" data-supply-history>
      {moves.map((move) => (
        <li key={move.id} className="border-b border-slate-100 py-2">
          <span className="ui-strong">
            {move.kind === "send" && move.qty > 0 ? "Taken back off the site" : (MOVE_WORD[move.kind] ?? move.kind)}: {Math.abs(move.qty)} × {move.itemName}
            {move.kind === "lost" && move.cost > 0 ? ` · ${dollars(move.cost)}` : ""}
          </span>
          {showAccount && move.accountName ? (
            <>
              {" · "}
              {move.accountId ? <AccountLink accountId={move.accountId} name={move.accountName} /> : move.accountName}
            </>
          ) : null}
          <span className="ui-muted">
            {" · "}
            {[move.staffName, SOURCE_WORD[move.source], new Date(move.at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })].filter(Boolean).join(" · ")}
          </span>
          {move.note ? <span className="block text-sm text-slate-600">{move.note}</span> : null}
        </li>
      ))}
    </ul>
  );
}

async function post(url: string, body: Record<string, unknown> | FormData): Promise<Record<string, unknown>> {
  const response = await fetch(url, body instanceof FormData ? { method: "POST", body } : { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok || data.success !== true) throw new Error(typeof data.error === "string" ? data.error : "That did not save. Try again.");
  return data;
}

/* ---------- the screen ---------- */

export default function Shelves() {
  const [warehouse, setWarehouse] = useState<Warehouse | null>(null);
  const [sites, setSites] = useState<Site[]>([]);
  const [ready, setReady] = useState(true);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<ShelfItem | null>(null);
  const [cameIn, setCameIn] = useState(false);
  const [busy, setBusy] = useState("");

  const load = useCallback(async () => {
    try {
      const [control, shelves] = await Promise.all([
        fetch("/api/supply-control", { cache: "no-store" }).then((response) => response.json() as Promise<{ success?: boolean; ready?: boolean; error?: string } & Partial<Warehouse>>),
        fetch("/api/shelves", { cache: "no-store" }).then((response) => response.json() as Promise<{ success?: boolean; ready?: boolean; error?: string; sites?: Site[] }>),
      ]);
      if (!control.success || !shelves.success) throw new Error(control.error || shelves.error || "The stock did not load.");
      if (!control.ready || !shelves.ready) {
        setReady(false);
        return;
      }
      setWarehouse({ shelf: control.shelf ?? [], reorder: control.reorder ?? [], spend: control.spend ?? { month: "", rows: [], total: 0 }, moves: control.moves ?? [] });
      setSites(shelves.sites ?? []);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "The stock did not load.");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const held = useMemo(() => sites.filter((site) => site.held.length > 0), [sites]);
  const atSites = useMemo(() => sites.filter((site) => site.tiles.length > 0), [sites]);

  async function markInvoiced(row: SpendRow, month: string) {
    setBusy(`inv-${row.accountId}`);
    try {
      await post("/api/supply-control", { action: "markInvoiced", accountId: row.accountId, month, amount: row.amount, on: !row.invoiced });
      showToast(row.invoiced ? "Mark taken off" : "Marked invoiced ✓");
      await load();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "That did not save.", "bad");
    } finally {
      setBusy("");
    }
  }

  if (error) return <ErrorBox title="The stock did not load." text={error} onRetry={() => void load()} />;
  if (!ready) return <EmptyState title="Stock is not turned on here yet" text="It comes with the next update." />;
  if (!warehouse) return <SkeletonList rows={4} />;

  return (
    <div className="ui-stack" data-shelves>
      <button type="button" onClick={() => setCameIn(true)} className="flex min-h-[80px] w-full items-center justify-center gap-3 rounded-3xl bg-green-600 px-4 text-2xl font-black text-white shadow-sm active:scale-[0.98]" data-stock-came-in>
        📥 + Stock came in
      </button>
      <Counts
        items={[
          { label: "Reorder", value: warehouse.reorder.length, tone: warehouse.reorder.length > 0 ? "bad" : "good" },
          { label: "This month", value: dollars(warehouse.spend.total), tone: "info" },
        ]}
      />

      <section className="ui-stack" data-warehouse>
        <h2 className="text-2xl font-black">🏬 Warehouse</h2>
        <p className="ui-muted" style={{ margin: 0 }}>
          Cleaning World&apos;s own stock. Tap one to change its count or facts.
        </p>
        {warehouse.shelf.length === 0 ? <p className="ui-muted">No products yet. Add them on Products.</p> : null}
        <div className={GRID}>
          {warehouse.shelf.map((item) => (
            <ShelfTile
              key={item.id}
              tile={{ supplyId: item.id, name: item.name, code: item.name, unit: item.unit, photoUrl: item.photoUrl, qty: item.shelfCount, level: warehouseLevel(item) }}
              caption={item.shelfLocation || (item.minLevel !== null ? `min ${item.minLevel}` : undefined)}
              onClick={() => setEditing(item)}
            />
          ))}
        </div>
      </section>

      {warehouse.reorder.length > 0 ? (
        <Card title={`🔴 Reorder (${warehouse.reorder.length})`}>
          <ul className="ui-list-plain" data-reorder>
            {warehouse.reorder.map((item) => (
              <li key={item.id} className="py-1">
                <span className="ui-strong">{item.name}</span>: {item.shelfCount} left, minimum {item.minLevel}
                {item.vendor ? <span className="ui-muted"> · {item.vendor}</span> : null}
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      {held.length > 0 ? (
        <section className="ui-stack" data-held>
          <h2 className="text-2xl font-black">🏷 Kept for customers</h2>
          <p className="ui-muted" style={{ margin: 0 }}>
            Bought for one customer, at the warehouse until it goes to their site.
          </p>
          {held.map((site) => (
            <div key={site.accountId} className="ui-card">
              <p className="ui-card-title" style={{ margin: "0 0 8px" }}>
                <AccountLink accountId={site.accountId} name={site.accountName} />
              </p>
              <div className={GRID}>
                {site.held.map((tile) => (
                  <ShelfTile key={tile.supplyId} tile={tile} />
                ))}
              </div>
            </div>
          ))}
        </section>
      ) : null}

      <section className="ui-stack" data-sites>
        <h2 className="text-2xl font-black">📍 Sites</h2>
        {atSites.length === 0 ? <p className="ui-muted">No site stock yet. A site shows here once a crew confirms a delivery.</p> : null}
        {atSites.map((site) => (
          <div key={site.accountId} className="ui-card" data-site-shelf={site.accountId}>
            <p className="ui-card-title" style={{ margin: "0 0 8px" }}>
              <AccountLink accountId={site.accountId} name={site.accountName} />
            </p>
            <div className={GRID}>
              {site.tiles.map((tile) => (
                <ShelfTile key={tile.supplyId} tile={tile} />
              ))}
            </div>
          </div>
        ))}
      </section>

      <Card title={`This month: ${dollars(warehouse.spend.total)}`}>
        {warehouse.spend.rows.length === 0 ? <p className="ui-muted">Nothing has gone out this month.</p> : null}
        {warehouse.spend.rows.map((row) => (
          <div key={`${row.accountId}|${row.accountName}`} className="ui-card-row" style={{ justifyContent: "space-between", flexWrap: "wrap", gap: 8, padding: "8px 0" }} data-spend-row={row.accountName}>
            <div>
              <p className="ui-strong">{row.accountId ? <AccountLink accountId={row.accountId} name={row.accountName} /> : row.accountName}</p>
              <p className="ui-muted">
                {row.items} item{row.items === 1 ? "" : "s"}
                {row.accountId ? ` · ${row.mode === "billed" ? "Billed to customer" : "Supplies included"}` : ""}
              </p>
            </div>
            <div className="ui-actions-row">
              <p className="ui-strong">{dollars(row.amount)}</p>
              {row.mode === "billed" && row.accountId ? (
                <BigButton kind={row.invoiced ? "second" : "main"} busy={busy === `inv-${row.accountId}`} busyLabel="Saving…" onClick={() => void markInvoiced(row, warehouse.spend.month)}>
                  {row.invoiced ? "Invoiced ✓" : "Mark invoiced"}
                </BigButton>
              ) : null}
            </div>
          </div>
        ))}
      </Card>

      <Card title="History">
        <HistoryList moves={warehouse.moves} empty="Nothing yet. It fills in as stock comes in, goes out and is counted." />
      </Card>

      <ItemSheet item={editing} onClose={() => setEditing(null)} onSaved={() => void load()} />
      <StockCameInSheet open={cameIn} onClose={() => setCameIn(false)} onSaved={() => void load()} />
    </div>
  );
}

/* ---------- + Stock came in ---------- */

function StockCameInSheet({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved: () => void }) {
  const products = useSupplyProducts();
  const { options: accounts, loading: accountsLoading } = useAllAccountOptions();
  const [lines, setLines] = useState<PickLine[]>([]);
  const [vendor, setVendor] = useState("");
  const [owner, setOwner] = useState<"cw" | "customer">("cw");
  const [query, setQuery] = useState("");
  const [customer, setCustomer] = useState<SearchOption | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setLines([]);
    setVendor("");
    setOwner("cw");
    setQuery("");
    setCustomer(null);
    setError("");
  }, [open]);

  const matches = useMemo(() => {
    const words = query.trim().toLowerCase();
    return words ? accounts.filter((option) => option.label.toLowerCase().includes(words)).slice(0, 8) : [];
  }, [accounts, query]);

  async function save() {
    setError("");
    if (lines.length === 0) return setError("Add what came in.");
    if (owner === "customer" && !customer) return setError("Pick the customer it belongs to.");
    setSaving(true);
    try {
      const result = await post("/api/shelves", { action: "cameIn", lines, vendor, ownerAccountId: owner === "customer" ? customer?.id : "", ownerAccountName: owner === "customer" ? customer?.label : "" });
      showToast(`📥 ${String(result.items ?? "")} in ✓`);
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "That did not save. Try again.");
    } finally {
      setSaving(false);
    }
  }

  const choice = (value: "cw" | "customer", label: string) => (
    <button type="button" aria-pressed={owner === value} onClick={() => setOwner(value)} className={`min-h-[56px] flex-1 rounded-2xl px-3 text-lg font-black ${owner === value ? "bg-blue-700 text-white" : "bg-white text-slate-900 ring-2 ring-slate-300"}`}>
      {label}
    </button>
  );

  return (
    <Sheet
      open={open}
      title="📥 Stock came in"
      onClose={onClose}
      busy={saving}
      actions={
        <BigButton busy={saving} busyLabel="Saving…" onClick={() => void save()}>
          ✓ Put it in
        </BigButton>
      }
    >
      <div className="ui-stack" data-came-in>
        {products === null ? <p className="ui-muted">Loading…</p> : <PickLines products={products} lines={lines} onChange={setLines} addLabel="+ Add what came in" />}
        <Field label="Vendor" optional value={vendor} onChange={(event) => setVendor(event.target.value)} placeholder="Who sent it" />
        <p className="ui-strong" style={{ margin: 0 }}>
          Whose is it?
        </p>
        <div className="flex gap-2">
          {choice("cw", "Cleaning World")}
          {choice("customer", "A customer")}
        </div>
        {owner === "customer" ? (
          <AutocompleteField
            label="Which customer?"
            placeholder="Type the account name"
            query={query}
            onQueryChange={setQuery}
            options={matches}
            loading={accountsLoading}
            selected={customer}
            onSelect={(option) => {
              setCustomer(option);
              setQuery(option.label);
            }}
            onClear={() => {
              setCustomer(null);
              setQuery("");
            }}
            minChars={1}
            emptyText="No accounts found"
          />
        ) : null}
        {error ? <p className="ui-field-error">{error}</p> : null}
      </div>
    </Sheet>
  );
}

/* ---------- one product's warehouse facts ---------- */

function ItemSheet({ item, onClose, onSaved }: { item: ShelfItem | null; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({ unit: "", unitCost: "", vendor: "", shelfLocation: "", minLevel: "", shelfCount: "", reason: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!item) return;
    setForm({
      unit: item.unit,
      unitCost: item.unitCost === null ? "" : String(item.unitCost),
      vendor: item.vendor,
      shelfLocation: item.shelfLocation,
      minLevel: item.minLevel === null ? "" : String(item.minLevel),
      shelfCount: item.shelfCount === null ? "" : String(item.shelfCount),
      reason: "",
    });
    setError("");
  }, [item]);

  // A changed count is an office edit: it needs a reason (a first count does not).
  const countChanged = item !== null && item.shelfCount !== null && form.shelfCount !== "" && Number(form.shelfCount) !== item.shelfCount;

  async function save() {
    if (!item) return;
    if (countChanged && form.reason.trim().length < 3) return setError("Write a short reason for the new count.");
    setSaving(true);
    setError("");
    try {
      await post("/api/supply-control", { action: "saveItem", id: item.id, ...form });
      const file = fileRef.current?.files?.[0];
      if (file) {
        const upload = new FormData();
        upload.append("id", String(item.id));
        upload.append("file", file);
        await post("/api/supply-control", upload);
      }
      showToast(CHEER.logged);
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "That did not save. Try again.");
    } finally {
      setSaving(false);
    }
  }

  const set = (key: keyof typeof form) => (event: { target: { value: string } }) => setForm((current) => ({ ...current, [key]: event.target.value }));

  return (
    <Sheet
      open={Boolean(item)}
      title={item?.name ?? ""}
      onClose={onClose}
      busy={saving}
      actions={
        <BigButton busy={saving} busyLabel="Saving…" onClick={() => void save()}>
          Save
        </BigButton>
      }
    >
      <div className="ui-stack" data-item-form>
        <Field label="In the warehouse now" type="number" inputMode="numeric" min={0} value={form.shelfCount} onChange={set("shelfCount")} />
        {countChanged ? <Field label="Why is the count different?" value={form.reason} onChange={set("reason")} placeholder="Recounted, damaged, found more…" /> : null}
        <Field label="Minimum (reorder at or below)" type="number" inputMode="numeric" min={0} optional value={form.minLevel} onChange={set("minLevel")} />
        <Field label="Cost of one ($)" type="number" inputMode="decimal" min={0} step="0.01" optional value={form.unitCost} onChange={set("unitCost")} />
        <Field label="Unit" hint="Each, box, gallon…" optional value={form.unit} onChange={set("unit")} />
        <Field label="Vendor" optional value={form.vendor} onChange={set("vendor")} />
        <Field label="Place on the shelf" hint="A3, back wall…" optional value={form.shelfLocation} onChange={set("shelfLocation")} />
        <label className="ui-field">
          <span className="ui-label">Photo</span>
          <input ref={fileRef} type="file" accept="image/*" capture="environment" className="ui-input" />
        </label>
        {error ? <p className="ui-field-error">{error}</p> : null}
      </div>
    </Sheet>
  );
}
