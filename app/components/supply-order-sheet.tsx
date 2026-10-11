"use client";

// "Order for a site" in three taps (for orders that come by text or call):
// pick the site, tap + on the items, tap Order. Each line is "From shelf"
// (picked from the supply shelf; stock drops when picked) or "Buy" (a vendor
// purchase order, shipped direct). An item with none on the shelf starts as
// Buy. Used on the Supplies page and on an account's own page (site already
// picked). Behind FEATURE_SUPPLY_CONTROL (see /api/supply-control).

import { useEffect, useMemo, useState } from "react";
import { BigButton, CHEER, SelectField, Sheet, showToast } from "@/app/ui";

export type ShelfItemLite = { id: number; name: string; unit: string; photoUrl: string; shelfCount: number | null; unitCost: number | null };
type Site = { id: string; name: string };

function pick(row: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = String(row[key] ?? "").trim();
    if (value) return value;
  }
  return "";
}

export default function SupplyOrderSheet({ open, site, onClose, onOrdered }: { open: boolean; /** The site is already known (an account's page). */ site?: Site; onClose: () => void; onOrdered?: () => void }) {
  const [items, setItems] = useState<ShelfItemLite[] | null>(null);
  const [sites, setSites] = useState<Site[] | null>(null);
  const [siteKey, setSiteKey] = useState("");
  const [qty, setQty] = useState<Record<number, number>>({});
  const [buy, setBuy] = useState<Record<number, boolean>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Each opening starts fresh, and loads the items (and the sites, when one is not given).
  useEffect(() => {
    if (!open) return;
    setQty({});
    setBuy({});
    setError("");
    setSiteKey("");
    let alive = true;
    fetch("/api/supply-control?view=items", { cache: "no-store" })
      .then((response) => response.json())
      .then((data: { ready?: boolean; shelf?: ShelfItemLite[] }) => alive && setItems(data.ready ? (data.shelf ?? []) : []))
      .catch(() => alive && setError("The supplies did not load. Close this and try again."));
    if (!site) {
      fetch("/api/accounts", { cache: "no-store" })
        .then((response) => response.json())
        .then((data: { accounts?: Record<string, unknown>[]; data?: Record<string, unknown>[] }) => {
          if (!alive) return;
          setSites(
            (data.accounts ?? data.data ?? [])
              .filter((row) => /^active$/i.test(pick(row, ["status", "Status"])))
              .map((row) => ({ id: pick(row, ["accountId", "id", "Account ID"]), name: pick(row, ["accountName", "Account Name"]) }))
              .filter((row) => row.name)
              .sort((a, b) => a.name.localeCompare(b.name))
          );
        })
        .catch(() => alive && setError("The sites did not load. Close this and try again."));
    }
    return () => {
      alive = false;
    };
  }, [open, site]);

  const chosen = site ?? sites?.find((entry) => `${entry.id}|${entry.name}` === siteKey) ?? null;
  const lines = useMemo(() => (items ?? []).filter((item) => (qty[item.id] ?? 0) > 0), [items, qty]);
  const total = lines.reduce((sum, item) => sum + (qty[item.id] ?? 0) * (item.unitCost ?? 0), 0);
  const isBuy = (item: ShelfItemLite) => buy[item.id] ?? (item.shelfCount ?? 0) <= 0;
  const change = (id: number, by: number) => setQty((current) => ({ ...current, [id]: Math.max(0, Math.min(99, (current[id] ?? 0) + by)) }));

  async function order() {
    setError("");
    if (!chosen) return setError("Pick the site.");
    if (lines.length === 0) return setError("Tap + on what they need.");
    setSaving(true);
    try {
      const response = await fetch("/api/supply-control", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "order", accountId: chosen.id, accountName: chosen.name, lines: lines.map((item) => ({ supplyId: item.id, qty: qty[item.id], source: isBuy(item) ? "buy" : "shelf" })) }),
      });
      const data = (await response.json().catch(() => ({}))) as { success?: boolean; error?: string; approved?: boolean };
      if (!response.ok || data.success !== true) throw new Error(data.error || "That did not save. Try again.");
      showToast(data.approved ? `${CHEER.logged} Approved by itself.` : `${CHEER.logged} Waiting for approval.`);
      onOrdered?.();
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
      title={site ? `Order for ${site.name}` : "Order for a site"}
      onClose={onClose}
      busy={saving}
      actions={
        <BigButton busy={saving} busyLabel="Ordering…" onClick={() => void order()}>
          {lines.length > 0 ? `Order · $${total.toFixed(2)}` : "Order"}
        </BigButton>
      }
    >
      <div className="ui-stack" data-supply-order>
        {site ? null : (
          <SelectField label="Site" value={siteKey} onChange={(event) => setSiteKey(event.target.value)} hint={sites ? undefined : "Loading the sites…"}>
            <option value="">Pick a site</option>
            {(sites ?? []).map((entry) => (
              <option key={`${entry.id}|${entry.name}`} value={`${entry.id}|${entry.name}`}>
                {entry.name}
              </option>
            ))}
          </SelectField>
        )}
        {items === null ? <p className="ui-muted">Loading the supplies…</p> : null}
        {items && items.length === 0 ? <p className="ui-muted">No supplies on the list yet.</p> : null}
        <div className="ui-supply-grid">
          {(items ?? []).map((item) => {
            const count = qty[item.id] ?? 0;
            return (
              <div key={item.id} className={`ui-supply-tile ${count > 0 ? "ui-supply-tile-on" : ""}`} data-item={item.id}>
                {item.photoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element -- a stored photo, shown small
                  <img src={item.photoUrl} alt="" className="ui-supply-photo" />
                ) : (
                  <div className="ui-supply-photo ui-supply-nophoto" aria-hidden="true">
                    🧴
                  </div>
                )}
                <p className="ui-strong">{item.name}</p>
                <p className="ui-muted">{item.shelfCount === null ? "Not counted" : `${item.shelfCount} on shelf`}</p>
                <div className="ui-supply-stepper">
                  <button type="button" className="ui-supply-minus" aria-label={`Less ${item.name}`} disabled={count === 0} onClick={() => change(item.id, -1)}>
                    −
                  </button>
                  <span aria-live="polite">{count}</span>
                  <button type="button" className="ui-supply-plus" aria-label={`More ${item.name}`} onClick={() => change(item.id, 1)}>
                    +
                  </button>
                </div>
                {count > 0 ? (
                  <button type="button" className="ui-supply-source" aria-pressed={isBuy(item)} onClick={() => setBuy((current) => ({ ...current, [item.id]: !isBuy(item) }))}>
                    {isBuy(item) ? "Buy / ship direct" : "From shelf"}
                  </button>
                ) : null}
              </div>
            );
          })}
        </div>
        {error ? <p className="ui-field-error">{error}</p> : null}
      </div>
    </Sheet>
  );
}
