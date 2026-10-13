"use client";

// Crew Link setup -> "Pick supplies for this account": a checklist of the
// catalog (Supplies -> Catalog). The crew at this account sees only the items
// ticked here. With nothing ticked they see the whole catalog, as before.
// "Copy list from another account" ticks that account's items here; nothing
// is saved until Save. Renders nothing where migration 033 is not in yet.

import { useCallback, useEffect, useMemo, useState } from "react";
import { BigButton, SearchBar, SelectField, Sheet, showToast } from "@/app/ui";

type Item = { id: number; name: string; brand: string; productLine: string; unit: string };
type Other = { accountId: string; accountName: string; count: number };

async function getJson(url: string): Promise<Record<string, unknown>> {
  const response = await fetch(url, { cache: "no-store" });
  const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok || body.success !== true) throw new Error(typeof body.error === "string" ? body.error : "That did not load.");
  return body;
}

export default function AccountSupplies({ accountId, accountName }: { accountId: string; accountName: string }) {
  const [ready, setReady] = useState(false);
  const [items, setItems] = useState<Item[]>([]);
  const [others, setOthers] = useState<Other[]>([]);
  const [saved, setSaved] = useState<number[]>([]);
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [brand, setBrand] = useState("");
  const [copyFrom, setCopyFrom] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const body = await getJson(`/api/admin/crew-supplies?view=account&accountId=${encodeURIComponent(accountId)}`);
      if (body.ready !== true) return setReady(false);
      const ids = (body.pickedIds as number[]) ?? [];
      setItems((body.items as Item[]) ?? []);
      setOthers((body.others as Other[]) ?? []);
      setSaved(ids);
      setPicked(new Set(ids));
      setReady(true);
    } catch {
      setReady(false);
    }
  }, [accountId]);

  useEffect(() => {
    void load();
  }, [load]);

  const brands = useMemo(() => [...new Set(items.map((item) => item.brand).filter(Boolean))].sort((a, b) => a.localeCompare(b)), [items]);
  const list = useMemo(() => {
    const words = search.trim().toLowerCase();
    return items.filter((item) => (!brand || item.brand === brand) && (!words || [item.name, item.brand, item.productLine].join(" ").toLowerCase().includes(words)));
  }, [items, search, brand]);

  if (!ready) return null;

  const toggle = (id: number) =>
    setPicked((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  async function copy() {
    if (!copyFrom) return;
    setError("");
    setBusy(true);
    try {
      const body = await getJson(`/api/admin/crew-supplies?view=accountList&accountId=${encodeURIComponent(copyFrom)}`);
      const known = new Set(items.map((item) => item.id));
      const ids = ((body.pickedIds as number[]) ?? []).filter((id) => known.has(id));
      setPicked(new Set(ids));
      showToast(`${ids.length} item${ids.length === 1 ? "" : "s"} ticked. Tap Save to keep them.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "That list did not load.");
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    setError("");
    setBusy(true);
    try {
      const response = await fetch("/api/admin/crew-supplies", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "setAccountList", accountId, itemIds: [...picked] }) });
      const body = (await response.json().catch(() => ({}))) as { success?: boolean; error?: string; pickedIds?: number[] };
      if (!response.ok || body.success !== true) throw new Error(body.error ?? "That did not save. Try again.");
      setSaved(body.pickedIds ?? []);
      setPicked(new Set(body.pickedIds ?? []));
      showToast("Saved ✓");
      setOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "That did not save. Try again.");
    } finally {
      setBusy(false);
    }
  }

  const activeSaved = saved.filter((id) => items.some((item) => item.id === id)).length;

  return (
    <div className="ui-card" data-account-supplies>
      <p className="ui-card-title" style={{ margin: 0 }}>
        Supplies for this account
      </p>
      <p className="ui-card-text">{activeSaved > 0 ? `The crew sees ${activeSaved} item${activeSaved === 1 ? "" : "s"} picked for this account.` : `Nothing picked yet: the crew sees the whole catalog (${items.length} items).`}</p>
      <div className="ui-actions-row" style={{ marginTop: 8 }}>
        <BigButton
          kind="second"
          onClick={() => {
            setPicked(new Set(saved));
            setSearch("");
            setBrand("");
            setCopyFrom("");
            setError("");
            setOpen(true);
          }}
        >
          Pick supplies for this account
        </BigButton>
        <BigButton kind="quiet" href="/supplies?tab=catalog">
          Open the catalog
        </BigButton>
      </div>

      <Sheet
        open={open}
        title="Pick supplies"
        text={accountName}
        onClose={() => setOpen(false)}
        busy={busy}
        actions={
          <BigButton busy={busy} busyLabel="Saving…" onClick={() => void save()}>
            Save ({picked.size} picked)
          </BigButton>
        }
      >
        <div className="ui-stack">
          <p className="ui-muted" style={{ margin: 0 }}>
            Tick what this crew can order. With nothing ticked they see the whole catalog.
          </p>

          {others.length > 0 ? (
            <div className="ui-stack">
              <SelectField label="Copy list from another account" value={copyFrom} disabled={busy} onChange={(event) => setCopyFrom(event.target.value)}>
                <option value="">Pick an account</option>
                {others.map((other) => (
                  <option key={other.accountId} value={other.accountId}>
                    {other.accountName} ({other.count})
                  </option>
                ))}
              </SelectField>
              <div>
                <BigButton kind="second" disabled={busy || !copyFrom} onClick={() => void copy()}>
                  Copy list
                </BigButton>
              </div>
            </div>
          ) : null}

          <SearchBar value={search} onChange={setSearch} label="Search" placeholder="Name, brand or product line" />
          {brands.length > 0 ? (
            <SelectField label="Brand" value={brand} onChange={(event) => setBrand(event.target.value)}>
              <option value="">All brands</option>
              {brands.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </SelectField>
          ) : null}

          <div className="ui-actions-row">
            <BigButton kind="quiet" disabled={busy} onClick={() => setPicked((current) => new Set([...current, ...list.map((item) => item.id)]))}>
              Tick all shown
            </BigButton>
            <BigButton kind="quiet" disabled={busy} onClick={() => setPicked(new Set())}>
              Untick all
            </BigButton>
          </div>

          <div className="ui-checks" data-supply-checklist>
            {list.map((item) => (
              <label key={item.id} className="ui-check">
                <input type="checkbox" checked={picked.has(item.id)} disabled={busy} onChange={() => toggle(item.id)} />
                <span>
                  <span className="ui-strong">{item.name}</span>
                  <span className="ui-muted"> · {[item.brand, item.productLine, item.unit].filter(Boolean).join(" · ")}</span>
                </span>
              </label>
            ))}
            {list.length === 0 ? <p className="ui-muted">Nothing matches.</p> : null}
          </div>
          {error ? <p className="ui-field-error">{error}</p> : null}
        </div>
      </Sheet>
    </div>
  );
}
