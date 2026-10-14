"use client";

// Supplies -> Catalog: the one list crews order from in Crew Link. Each item
// has a name, a brand, a product line, a unit and, if wanted, a photo. It
// also has a type ("Toilet paper", "Hand soap"...), which the list is grouped
// by, and our product code; the code is for staff only. An item that is
// removed is only hidden: crews stop seeing it and past orders keep it.
// "Default list" on an item means a crew at an account with no list of its
// own can order it; with it off, only the accounts it was picked for see it. Which of these a given account's crew sees is picked on that
// account's Crew Link setup ("Pick supplies for this account").

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BigButton, EmptyState, ErrorBox, Field, FilterChips, SearchBar, SelectField, Sheet, SkeletonList, showToast } from "@/app/ui";

type Item = { id: number; name: string; brand: string; productLine: string; unit: string; photoUrl: string; category: string; sku: string; inDefaultList: boolean; active: boolean };
type Draft = { id?: number; name: string; brand: string; productLine: string; unit: string; photoUrl: string; category: string; sku: string };

const UNITS = ["case", "box", "each", "gallon", "pack", "bag", "roll", "bottle"];
const EMPTY: Draft = { name: "", brand: "", productLine: "", unit: "case", photoUrl: "", category: "", sku: "" };
/** The heading over the items that have no type. Always the last group. */
const NO_TYPE = "No type yet";

async function post(body: Record<string, unknown> | FormData): Promise<Record<string, unknown>> {
  const response = await fetch("/api/admin/crew-supplies", body instanceof FormData ? { method: "POST", body } : { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const answer = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok || answer.success !== true) throw new Error(typeof answer.error === "string" ? answer.error : "That did not save. Try again.");
  return answer;
}

export default function SupplyCatalog() {
  const [state, setState] = useState<"loading" | "ready" | "off" | "failed">("loading");
  const [items, setItems] = useState<Item[]>([]);
  // The catalog has types and product codes here (migration 035). Until then it is one plain list, as before.
  const [typesOn, setTypesOn] = useState(false);
  const [search, setSearch] = useState("");
  const [shown, setShown] = useState<"active" | "default" | "removed">("active");
  // The catalog has its default list here (migration 036). Until then the switch and the filter are not shown.
  const [defaultOn, setDefaultOn] = useState(false);
  const [brand, setBrand] = useState("");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [photo, setPhoto] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/admin/crew-supplies?view=catalog", { cache: "no-store" });
      const body = (await response.json()) as { success?: boolean; ready?: boolean; items?: Item[]; typesOn?: boolean; defaultOn?: boolean };
      if (!response.ok || body.success !== true) throw new Error("failed");
      if (body.ready !== true) return setState("off");
      setItems(body.items ?? []);
      setTypesOn(body.typesOn === true);
      setDefaultOn(body.defaultOn === true);
      setState("ready");
    } catch {
      setState("failed");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const brands = useMemo(() => [...new Set(items.map((item) => item.brand).filter(Boolean))].sort((a, b) => a.localeCompare(b)), [items]);
  const list = useMemo(() => {
    const words = search.trim().toLowerCase();
    return items.filter((item) => {
      // "Default" = what a crew with no list of its own sees: in the catalog and on the default list.
      if (item.active !== (shown !== "removed")) return false;
      if (shown === "default" && !item.inDefaultList) return false;
      if (brand && item.brand !== brand) return false;
      return !words || [item.name, item.brand, item.productLine, item.category, item.sku].join(" ").toLowerCase().includes(words);
    });
  }, [items, search, shown, brand]);
  // Every type in use, for the form's suggestions, so the same type is not spelled two ways.
  const types = useMemo(() => [...new Set(items.map((item) => item.category).filter(Boolean))].sort((a, b) => a.localeCompare(b)), [items]);
  // The list under its types, in ABC order; items with no type come last. One group with no heading where types are not on.
  const groups = useMemo(() => {
    if (!typesOn) return [{ type: "", items: list }];
    const byType = new Map<string, Item[]>();
    for (const item of list) {
      const type = item.category || NO_TYPE;
      byType.set(type, [...(byType.get(type) ?? []), item]);
    }
    return [...byType.entries()]
      .sort(([a], [b]) => Number(a === NO_TYPE) - Number(b === NO_TYPE) || a.localeCompare(b))
      .map(([type, entries]) => ({ type, items: entries }));
  }, [list, typesOn]);
  const removedCount = items.filter((item) => !item.active).length;
  const defaultCount = items.filter((item) => item.active && item.inDefaultList).length;

  const startAdd = () => {
    setError("");
    setPhoto(null);
    setDraft({ ...EMPTY });
  };
  const startEdit = (item: Item) => {
    setError("");
    setPhoto(null);
    setDraft({ id: item.id, name: item.name, brand: item.brand, productLine: item.productLine, unit: item.unit, photoUrl: item.photoUrl, category: item.category, sku: item.sku });
  };

  async function save() {
    if (!draft) return;
    if (!draft.name.trim()) return setError("Write the item's name.");
    setError("");
    setBusy(true);
    try {
      let photoUrl = "";
      if (photo) {
        const upload = new FormData();
        upload.append("file", photo);
        photoUrl = String((await post(upload)).photoUrl ?? "");
      }
      await post({ action: "saveItem", id: draft.id, name: draft.name, brand: draft.brand, productLine: draft.productLine, unit: draft.unit, photoUrl, category: draft.category, sku: draft.sku });
      showToast(draft.id === undefined ? "Added to the catalog ✓" : "Saved ✓");
      setDraft(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "That did not save. Try again.");
    } finally {
      setBusy(false);
    }
  }

  async function setDefault(item: Item, on: boolean) {
    // The switch moves at once; it goes back if the save fails.
    setItems((current) => current.map((entry) => (entry.id === item.id ? { ...entry, inDefaultList: on } : entry)));
    try {
      await post({ action: "setDefault", id: item.id, on });
      showToast(on ? "On the default list ✓" : "Off the default list. Only the accounts it is picked for see it.");
    } catch (err) {
      setItems((current) => current.map((entry) => (entry.id === item.id ? { ...entry, inDefaultList: !on } : entry)));
      showToast(err instanceof Error ? err.message : "That did not save. Try again.", "bad");
    }
  }

  async function setActive(item: Item, active: boolean) {
    try {
      await post({ action: "setActive", id: item.id, active });
      showToast(active ? "Back in the catalog ✓" : "Removed. Crews no longer see it; past orders keep it.");
      await load();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "That did not save. Try again.", "bad");
    }
  }

  if (state === "loading") return <SkeletonList rows={3} />;
  if (state === "off") return <EmptyState title="The catalog is not turned on here yet" text="It works once this database has the catalog update." />;
  if (state === "failed") return <ErrorBox title="The catalog did not load." onRetry={() => void load()} />;

  const unitOptions = draft && draft.unit && !UNITS.includes(draft.unit) ? [draft.unit, ...UNITS] : UNITS;

  return (
    <div className="ui-stack" data-supply-catalog>
      <p className="ui-muted" style={{ margin: 0 }}>
        The items crews can order in Crew Link. Pick which ones each account sees on that account&apos;s Crew Link setup.
      </p>
      <div>
        <BigButton icon="plus" onClick={startAdd}>
          Add item
        </BigButton>
      </div>

      <SearchBar value={search} onChange={setSearch} label="Search the catalog" placeholder={typesOn ? "Name, brand, type or product code" : "Name, brand or product line"} />
      <FilterChips
        label="Show"
        value={shown}
        onChange={setShown}
        options={[
          { value: "active", label: `In the catalog (${items.length - removedCount})` },
          ...(defaultOn ? [{ value: "default" as const, label: `Default (${defaultCount})` }] : []),
          { value: "removed", label: `Removed (${removedCount})` },
        ]}
      />
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

      {defaultOn && shown === "default" ? (
        <p className="ui-muted" style={{ margin: 0 }}>
          What a crew sees at an account with no list of its own.
        </p>
      ) : null}
      {list.length === 0 ? <EmptyState title={shown === "removed" ? "Nothing has been removed" : "Nothing here"} text={shown === "removed" ? undefined : "Tap Add item, or change the search."} /> : null}
      {groups.map((group) => (
        <section key={group.type || "all"} className="ui-stack" aria-label={group.type || "Items"} data-catalog-type={group.type}>
          {group.type ? (
            <h2 className="ui-section-title" style={{ margin: 0 }}>
              {group.type} <span className="ui-muted">({group.items.length})</span>
            </h2>
          ) : null}
          {group.items.map((item) => (
        <div key={item.id} className="ui-card" data-catalog-item={item.id}>
          <div className="ui-card-row" style={{ justifyContent: "flex-start", gap: 12 }}>
            {item.photoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- a stored photo, shown small
              <img src={item.photoUrl} alt="" className="ui-supply-photo" />
            ) : (
              <div className="ui-supply-photo ui-supply-nophoto" aria-hidden="true">
                📦
              </div>
            )}
            <div style={{ minWidth: 0 }}>
              <p className="ui-card-title" style={{ margin: 0 }}>
                {item.name}
              </p>
              <p className="ui-card-text" style={{ margin: 0 }}>
                {[item.brand, item.productLine].filter(Boolean).join(" · ") || "No brand"}
              </p>
              <p className="ui-muted" style={{ margin: 0 }}>
                Unit: {item.unit}
                {item.sku ? ` · Code: ${item.sku}` : ""}
              </p>
            </div>
          </div>
          {defaultOn ? (
            <label className="ui-toggle" style={{ marginTop: 12 }}>
              <input type="checkbox" role="switch" checked={item.inDefaultList} onChange={(event) => void setDefault(item, event.target.checked)} />
              <span>Default list</span>
            </label>
          ) : null}
          <div className="ui-actions-row" style={{ marginTop: 12 }}>
            <BigButton kind="second" onClick={() => startEdit(item)}>
              Edit
            </BigButton>
            {item.active ? (
              <BigButton kind="quiet" onClick={() => void setActive(item, false)}>
                Remove
              </BigButton>
            ) : (
              <BigButton kind="second" onClick={() => void setActive(item, true)}>
                Put back
              </BigButton>
            )}
          </div>
        </div>
          ))}
        </section>
      ))}

      <Sheet
        open={draft !== null}
        title={draft?.id === undefined ? "Add item" : "Edit item"}
        onClose={() => setDraft(null)}
        busy={busy}
        actions={
          <BigButton busy={busy} busyLabel="Saving…" onClick={() => void save()}>
            Save
          </BigButton>
        }
      >
        {draft ? (
          <div className="ui-stack">
            <Field label="Name" maxLength={120} value={draft.name} disabled={busy} onChange={(event) => setDraft({ ...draft, name: event.target.value })} placeholder="Toilet paper" />
            {typesOn ? (
              <>
                <Field
                  label="Type"
                  optional
                  hint="What kind of supply it is. Items of the same type are listed together."
                  maxLength={60}
                  list="supply-catalog-types"
                  value={draft.category}
                  disabled={busy}
                  onChange={(event) => setDraft({ ...draft, category: event.target.value })}
                  placeholder="Toilet paper"
                />
                <datalist id="supply-catalog-types">
                  {types.map((type) => (
                    <option key={type} value={type} />
                  ))}
                </datalist>
                <Field label="Product code" optional hint="Our code for it. Crews never see this." maxLength={60} value={draft.sku} disabled={busy} onChange={(event) => setDraft({ ...draft, sku: event.target.value })} />
              </>
            ) : null}
            <Field label="Brand" optional maxLength={80} value={draft.brand} disabled={busy} onChange={(event) => setDraft({ ...draft, brand: event.target.value })} />
            <Field label="Product line" optional maxLength={80} value={draft.productLine} disabled={busy} onChange={(event) => setDraft({ ...draft, productLine: event.target.value })} />
            <SelectField label="Unit" value={draft.unit} disabled={busy} onChange={(event) => setDraft({ ...draft, unit: event.target.value })}>
              {unitOptions.map((unit) => (
                <option key={unit} value={unit}>
                  {unit}
                </option>
              ))}
            </SelectField>
            <div className="ui-stack">
              <p className="ui-strong" style={{ margin: 0 }}>
                Photo <span className="ui-muted">(optional)</span>
              </p>
              {draft.photoUrl && !photo ? (
                // eslint-disable-next-line @next/next/no-img-element -- a stored photo, shown small
                <img src={draft.photoUrl} alt="" className="ui-supply-photo" />
              ) : null}
              <input ref={fileInput} type="file" accept="image/*" hidden onChange={(event) => setPhoto(event.target.files?.[0] ?? null)} />
              <div>
                <BigButton kind="second" disabled={busy} onClick={() => fileInput.current?.click()}>
                  {photo ? `Photo chosen: ${photo.name}` : draft.photoUrl ? "Change photo" : "Add photo"}
                </BigButton>
              </div>
            </div>
            {error ? <p className="ui-field-error">{error}</p> : null}
          </div>
        ) : null}
      </Sheet>
    </div>
  );
}
