"use client";

// "+ Order for a sub" (an order that came by call or text): pick the site,
// who it is for (the account's sub is filled in), tap + on the items, tap
// Order. It lands in the Supply Orders inbox already Approved, as the sub's
// own order would; the office then picks how to fill it (lib/pg/shelves.ts
// orderForSub). Used on the Supply Orders page and on an account's own page
// (site already picked).

import { useEffect, useMemo, useState } from "react";
import { BigButton, CHEER, Field, SelectField, Sheet, showToast } from "@/app/ui";
import { PickLines, useSupplyProducts, type PickLine } from "./supply-pick";

type Site = { id: string; name: string; sub: string };

function pick(row: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = String(row[key] ?? "").trim();
    if (value) return value;
  }
  return "";
}

const SUB_KEYS = ["subcontractor", "Subcontractor", "subAssigned", "Sub Assigned", "subContractor", "Sub Contractor"];

export default function SupplyOrderSheet({ open, site, onClose, onOrdered }: { open: boolean; /** The site is already known (an account's page). */ site?: { id: string; name: string }; onClose: () => void; onOrdered?: () => void }) {
  const products = useSupplyProducts();
  const [sites, setSites] = useState<Site[] | null>(null);
  const [siteKey, setSiteKey] = useState("");
  const [sub, setSub] = useState("");
  const [note, setNote] = useState("");
  const [lines, setLines] = useState<PickLine[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Each opening starts fresh, and loads the sites (to know each one's sub).
  useEffect(() => {
    if (!open) return;
    setLines([]);
    setError("");
    setSiteKey("");
    setSub("");
    setNote("");
    let alive = true;
    fetch("/api/accounts", { cache: "no-store" })
      .then((response) => response.json())
      .then((data: { accounts?: Record<string, unknown>[]; data?: Record<string, unknown>[] }) => {
        if (!alive) return;
        setSites(
          (data.accounts ?? data.data ?? [])
            .filter((row) => /^active$/i.test(pick(row, ["status", "Status"])))
            .map((row) => ({ id: pick(row, ["accountId", "id", "Account ID"]), name: pick(row, ["accountName", "Account Name"]), sub: pick(row, SUB_KEYS) }))
            .filter((row) => row.name)
            .sort((a, b) => a.name.localeCompare(b.name))
        );
      })
      .catch(() => alive && setSites([]));
    return () => {
      alive = false;
    };
  }, [open]);

  const chosen = useMemo(() => {
    if (site) return sites?.find((entry) => entry.id === site.id) ?? { ...site, sub: "" };
    return sites?.find((entry) => `${entry.id}|${entry.name}` === siteKey) ?? null;
  }, [site, sites, siteKey]);
  // The account's own sub, until the office types another.
  useEffect(() => {
    if (chosen?.sub) setSub((current) => current || chosen.sub);
  }, [chosen]);
  const subNames = useMemo(() => [...new Set((sites ?? []).map((entry) => entry.sub).filter(Boolean))].sort(), [sites]);

  async function order() {
    setError("");
    if (!chosen) return setError("Pick the site.");
    if (!sub.trim()) return setError("Who is it for? Pick the sub.");
    if (lines.length === 0) return setError("Add what they need.");
    setSaving(true);
    try {
      const response = await fetch("/api/shelves", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "orderForSub", accountId: chosen.id, accountName: chosen.name, sub: sub.trim(), lines, note }),
      });
      const data = (await response.json().catch(() => ({}))) as { success?: boolean; error?: string };
      if (!response.ok || data.success !== true) throw new Error(data.error || "That did not save. Try again.");
      showToast(`${CHEER.logged} In Supply Orders: pick how we fill it.`);
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
      title={site ? `Order for ${site.name}` : "Order for a sub"}
      text="From a call or a text. It goes in Supply Orders, already approved."
      onClose={onClose}
      busy={saving}
      actions={
        <BigButton busy={saving} busyLabel="Ordering…" onClick={() => void order()}>
          Order
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
        <Field label="For (the sub)" value={sub} onChange={(event) => setSub(event.target.value)} list="supply-order-subs" placeholder="Sub's company name" />
        <datalist id="supply-order-subs">
          {subNames.map((name) => (
            <option key={name} value={name} />
          ))}
        </datalist>
        {products === null ? <p className="ui-muted">Loading the supplies…</p> : <PickLines products={products} lines={lines} onChange={setLines} addLabel="+ Add an item" />}
        <Field label="Note" optional value={note} onChange={(event) => setNote(event.target.value)} placeholder="Called at 7am, needs it by Friday" />
        {error ? <p className="ui-field-error">{error}</p> : null}
      </div>
    </Sheet>
  );
}
