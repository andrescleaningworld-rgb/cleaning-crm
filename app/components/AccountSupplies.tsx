"use client";

// Crew Link setup -> "Pick supplies for this account": the Supplies products
// (one list, migration 038), searchable by name, brand, type or product code.
// The crew at this account sees only the products ticked here. With nothing
// ticked they see the default list (products marked "On the default list" on
// the Supplies page). "Copy list from another account" ticks that account's
// products here; nothing is saved until Save. Renders nothing where migration
// 038 is not in yet.

import { useCallback, useEffect, useMemo, useState } from "react";
import { BigButton, SearchBar, SelectField, Sheet, showToast } from "@/app/ui";

type Product = { supplyId: number; name: string; brand: string; type: string; code: string; unit: string; photoUrl: string; onDefault: boolean };
type Other = { accountId: string; accountName: string; count: number };

async function getJson(url: string): Promise<Record<string, unknown>> {
  const response = await fetch(url, { cache: "no-store" });
  const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok || body.success !== true) throw new Error(typeof body.error === "string" ? body.error : "That did not load.");
  return body;
}

export default function AccountSupplies({ accountId, accountName }: { accountId: string; accountName: string }) {
  const [ready, setReady] = useState(false);
  const [products, setProducts] = useState<Product[]>([]);
  const [others, setOthers] = useState<Other[]>([]);
  const [saved, setSaved] = useState<number[]>([]);
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [copyFrom, setCopyFrom] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const body = await getJson(`/api/admin/supply-list?view=picker&accountId=${encodeURIComponent(accountId)}`);
      if (body.ready !== true) return setReady(false);
      const ids = (body.pickedIds as number[]) ?? [];
      setProducts((body.products as Product[]) ?? []);
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

  const list = useMemo(() => {
    const words = search.trim().toLowerCase();
    if (!words) return products;
    return products.filter((product) => [product.name, product.brand, product.type, product.code].join(" ").toLowerCase().includes(words));
  }, [products, search]);

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
      const body = await getJson(`/api/admin/supply-list?view=accountList&accountId=${encodeURIComponent(copyFrom)}`);
      const known = new Set(products.map((product) => product.supplyId));
      const ids = ((body.pickedIds as number[]) ?? []).filter((id) => known.has(id));
      setPicked(new Set(ids));
      showToast(`${ids.length} product${ids.length === 1 ? "" : "s"} ticked. Tap Save to keep them.`);
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
      const response = await fetch("/api/admin/supply-list", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "setPicks", accountId, supplyIds: [...picked] }) });
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

  const activeSaved = saved.filter((id) => products.some((product) => product.supplyId === id)).length;
  const onDefault = products.filter((product) => product.onDefault).length;

  return (
    <div className="ui-card" data-account-supplies>
      <p className="ui-card-title" style={{ margin: 0 }}>
        Supplies for this account
      </p>
      <p className="ui-card-text">
        {activeSaved > 0
          ? `The crew sees ${activeSaved} product${activeSaved === 1 ? "" : "s"} picked for this account.`
          : `Nothing picked yet: the crew sees the default list (${onDefault} product${onDefault === 1 ? "" : "s"}).`}
      </p>
      <div className="ui-actions-row" style={{ marginTop: 8 }}>
        <BigButton
          kind="second"
          onClick={() => {
            setPicked(new Set(saved));
            setSearch("");
            setCopyFrom("");
            setError("");
            setOpen(true);
          }}
        >
          Pick supplies for this account
        </BigButton>
        <BigButton kind="quiet" href="/supplies">
          Open Supplies
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
          <SearchBar value={search} onChange={setSearch} label="Search" placeholder="Name, brand, type or product code" />

          <div className="ui-actions-row">
            <BigButton kind="quiet" disabled={busy} onClick={() => setPicked((current) => new Set([...current, ...list.map((product) => product.supplyId)]))}>
              Tick all shown
            </BigButton>
            <BigButton kind="quiet" disabled={busy} onClick={() => setPicked(new Set())}>
              Untick all
            </BigButton>
          </div>

          <div className="ui-stack" data-supply-checklist>
            {list.map((product) => (
              <label
                key={product.supplyId}
                className="flex min-h-[72px] cursor-pointer items-center gap-3 rounded-2xl border-2 px-3 py-2"
                style={{ borderColor: picked.has(product.supplyId) ? "var(--ui-brand)" : "var(--ui-line)", background: picked.has(product.supplyId) ? "var(--ui-brand-soft)" : "var(--ui-surface)" }}
              >
                <input type="checkbox" className="h-7 w-7 shrink-0" checked={picked.has(product.supplyId)} disabled={busy} onChange={() => toggle(product.supplyId)} />
                {product.photoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element -- product photo from Blob storage
                  <img src={product.photoUrl} alt="" className="h-14 w-14 shrink-0 rounded-lg bg-white object-contain" />
                ) : (
                  <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-2xl" aria-hidden="true">
                    📦
                  </span>
                )}
                <span className="min-w-0">
                  <span className="ui-strong" style={{ display: "block" }}>
                    {product.name}
                  </span>
                  <span className="ui-muted">{[product.brand, product.unit, product.code].filter(Boolean).join(" · ")}</span>
                </span>
              </label>
            ))}
            {list.length === 0 ? <p className="ui-muted">Nothing matches.</p> : null}
          </div>

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
          {error ? <p className="ui-field-error">{error}</p> : null}
        </div>
      </Sheet>
    </div>
  );
}
