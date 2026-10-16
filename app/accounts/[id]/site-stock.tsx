"use client";

// On an account's page: 📦 Site stock (lib/pg/shelves.ts, GET /api/shelves?accountId=).
//
//   the counts          what is at the site: photo, big count, green / yellow /
//                       red. Tap one to correct its count (a reason is needed).
//   + Add delivery      supplies that reached the site with no order
//   Kept at warehouse   bought for this customer, still at the warehouse
//   On its way          approved orders and back orders not confirmed yet
//   History             who, what, when, and where it was done
//
// Crews still take a case off with "Case empty" on Crew Link. Renders nothing
// where the supplies system is not in this database yet.

import { useCallback, useEffect, useState } from "react";
import { AddBar, AddButton, BigButton, Card, Field, Sheet, showToast } from "@/app/ui";
import { HistoryList, ShelfTile, type Move } from "../../supplies/shelves";
import { PickLines, Stepper, useSupplyProducts, type PickLine } from "../../components/supply-pick";

type Level = "green" | "yellow" | "red" | "none";
type Tile = { supplyId: number; name: string; code: string; unit: string; photoUrl: string; qty: number | null; level: Level };
type Waiting = { key: string; backOrder?: boolean; fill?: string; sentAt: string; lines: { name: string; qty: number }[] };
type Data = { site: { tiles: Tile[]; held: Tile[] } | null; waiting: Waiting[]; moves: Move[] };

const GRID = "grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5";
const WAY: Record<string, string> = { vendor: "🚚 Vendor ships", pickup: "🏬 Sub picks up", deliver: "🚐 We deliver" };

async function post(body: Record<string, unknown>) {
  const response = await fetch("/api/shelves", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const result = (await response.json().catch(() => ({}))) as { success?: boolean; error?: string };
  if (!response.ok || !result.success) throw new Error(result.error || "That did not save. Try again.");
}

export default function SiteStock({ accountId, accountName }: { accountId: string; accountName: string }) {
  const [data, setData] = useState<Data | null>(null);
  const [adding, setAdding] = useState(false);
  const [fixing, setFixing] = useState<Tile | null>(null);

  // Bumped after a save: loads again.
  const [version, setVersion] = useState(0);
  const load = useCallback(() => setVersion((n) => n + 1), []);

  useEffect(() => {
    if (!accountId) return;
    let alive = true;
    fetch(`/api/shelves?accountId=${encodeURIComponent(accountId)}`, { cache: "no-store" })
      .then((response) => response.json() as Promise<{ success?: boolean; ready?: boolean } & Partial<Data>>)
      .then((body) => alive && setData(body.success && body.ready ? { site: body.site ?? null, waiting: body.waiting ?? [], moves: body.moves ?? [] } : null))
      .catch(() => alive && setData(null));
    return () => {
      alive = false;
    };
  }, [accountId, version]);

  if (!accountId || !data) return null;
  const tiles = data.site?.tiles ?? [];
  const held = data.site?.held ?? [];

  return (
    <Card title="📦 Site stock">
      <div className="ui-stack" data-site-stock>
        <AddBar>
          <AddButton onClick={() => setAdding(true)}>Add delivery</AddButton>
        </AddBar>
        {tiles.length === 0 ? <p className="ui-muted">Nothing counted at this site yet. It fills in when a crew confirms Supplies arrived, or with Add delivery.</p> : null}
        <div className={GRID}>
          {tiles.map((tile) => (
            <ShelfTile key={tile.supplyId} tile={tile} onClick={() => setFixing(tile)} />
          ))}
        </div>
        <div className="ui-actions-row">
          <BigButton kind="second" href={`/supply-orders?accountId=${encodeURIComponent(accountId)}`}>
            Supply orders
          </BigButton>
        </div>

        {held.length > 0 ? (
          <div className="ui-stack">
            <p className="ui-strong" style={{ margin: 0 }}>
              🏷 Kept for them at the warehouse
            </p>
            <div className={GRID}>
              {held.map((tile) => (
                <ShelfTile key={tile.supplyId} tile={tile} />
              ))}
            </div>
          </div>
        ) : null}

        {data.waiting.length > 0 ? (
          <div className="ui-stack">
            <p className="ui-strong" style={{ margin: 0 }}>
              On its way
            </p>
            <ul className="ui-list-plain">
              {data.waiting.map((entry) => (
                <li key={entry.key}>
                  {entry.backOrder ? "⏳ Back order" : (entry.fill && WAY[entry.fill]) || "🚚 On its way"}: {entry.lines.map((line) => `${line.qty} ${line.name}`).join(", ")}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <details>
          <summary className="cursor-pointer font-bold">History</summary>
          <HistoryList moves={data.moves} showAccount={false} empty="Nothing yet for this site." />
        </details>
      </div>

      <AddDeliverySheet open={adding} accountId={accountId} accountName={accountName} onClose={() => setAdding(false)} onSaved={() => void load()} />
      <FixCountSheet tile={fixing} accountId={accountId} accountName={accountName} onClose={() => setFixing(null)} onSaved={() => void load()} />
    </Card>
  );
}

function AddDeliverySheet({ open, accountId, accountName, onClose, onSaved }: { open: boolean; accountId: string; accountName: string; onClose: () => void; onSaved: () => void }) {
  const products = useSupplyProducts();
  const [lines, setLines] = useState<PickLine[]>([]);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setLines([]);
    setNote("");
    setError("");
  }, [open]);

  async function save() {
    if (lines.length === 0) return setError("Add what came.");
    setSaving(true);
    setError("");
    try {
      await post({ action: "addDelivery", accountId, accountName, lines, note });
      showToast("Added to the site ✓");
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "That did not save. Try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet
      open={open}
      title={`+ Add delivery: ${accountName}`}
      text="Supplies that reached the site with no order. They go on the site's stock."
      onClose={onClose}
      busy={saving}
      actions={
        <BigButton busy={saving} busyLabel="Saving…" onClick={() => void save()}>
          ✓ Add to site
        </BigButton>
      }
    >
      <div className="ui-stack">
        {products === null ? <p className="ui-muted">Loading…</p> : <PickLines products={products} lines={lines} onChange={setLines} addLabel="+ Add what came" />}
        <Field label="Where did it come from?" optional value={note} onChange={(event) => setNote(event.target.value)} placeholder="Vendor shipped direct, dropped off by…" />
        {error ? <p className="ui-field-error">{error}</p> : null}
      </div>
    </Sheet>
  );
}

function FixCountSheet({ tile, accountId, accountName, onClose, onSaved }: { tile: Tile | null; accountId: string; accountName: string; onClose: () => void; onSaved: () => void }) {
  const [qty, setQty] = useState(0);
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!tile) return;
    setQty(tile.qty ?? 0);
    setReason("");
    setError("");
  }, [tile]);

  async function save() {
    if (!tile) return;
    if (qty === (tile.qty ?? 0)) return onClose();
    if (reason.trim().length < 3) return setError("Write a short reason.");
    setSaving(true);
    setError("");
    try {
      await post({ action: "setCount", accountId, accountName, supplyId: tile.supplyId, qty, reason });
      showToast("Count saved ✓");
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "That did not save. Try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet
      open={tile !== null}
      title={tile ? `${tile.name}: at the site` : ""}
      text={tile ? `Now: ${tile.qty ?? 0}${tile.unit ? ` ${tile.unit}` : ""}` : ""}
      onClose={onClose}
      busy={saving}
      actions={
        <BigButton busy={saving} busyLabel="Saving…" onClick={() => void save()}>
          Save count
        </BigButton>
      }
    >
      <div className="ui-stack">
        <div className="flex justify-center">
          <Stepper value={qty} max={9999} label={tile?.name ?? "Count"} onChange={setQty} />
        </div>
        {tile && qty !== (tile.qty ?? 0) ? <Field label="Why?" value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Counted on site, damaged, moved…" /> : null}
        {error ? <p className="ui-field-error">{error}</p> : null}
      </div>
    </Sheet>
  );
}
