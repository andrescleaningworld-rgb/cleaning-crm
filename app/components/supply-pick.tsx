"use client";

// Picking Supplies products on the office's supply screens: the Approve
// sheet, "+ Stock came in", "Order for a sub" and an account's Site stock.
//
//   useSupplyProducts()  every product in use (GET /api/admin/supply-list?view=products)
//   <Stepper>            a small − / + for a number
//   <ProductSelect>      one product from the list, by name, brand or code
//   <PickLines>          "+ Add an item": products and how many, each with − / +

import { useEffect, useState } from "react";

export type PickProduct = { supplyId: number; name: string; brand: string; type: string; code: string; unit: string; photoUrl: string };
export type PickLine = { supplyId: number; qty: number };

let cache: PickProduct[] | null = null;

export function useSupplyProducts(): PickProduct[] | null {
  const [products, setProducts] = useState<PickProduct[] | null>(cache);
  useEffect(() => {
    if (cache) return;
    let alive = true;
    fetch("/api/admin/supply-list?view=products", { cache: "no-store" })
      .then((response) => response.json())
      .then((body: { success?: boolean; products?: PickProduct[] }) => {
        const list = body.success ? [...(body.products ?? [])].sort((a, b) => a.name.localeCompare(b.name)) : [];
        cache = list;
        if (alive) setProducts(list);
      })
      .catch(() => alive && setProducts([]));
    return () => {
      alive = false;
    };
  }, []);
  return products;
}

export const productLabel = (product: PickProduct) => `${product.name}${product.brand ? ` · ${product.brand}` : ""}${product.unit ? ` (${product.unit})` : ""}`;

export function Stepper({ value, onChange, max = 999, label }: { value: number; onChange: (n: number) => void; max?: number; label: string }) {
  const button = "flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-slate-200 text-2xl font-black active:bg-slate-300 disabled:opacity-40";
  return (
    <span className="flex items-center gap-2" role="group" aria-label={label}>
      <button type="button" className={button} disabled={value <= 0} onClick={() => onChange(Math.max(0, value - 1))} aria-label={`${label}: one less`}>
        −
      </button>
      <span className="min-w-[2.5ch] text-center text-2xl font-black">{value}</span>
      <button type="button" className={button} disabled={value >= max} onClick={() => onChange(Math.min(max, value + 1))} aria-label={`${label}: one more`}>
        +
      </button>
    </span>
  );
}

export function ProductSelect({ products, value, onChange, placeholder = "Pick a product…" }: { products: PickProduct[]; value: number | null; onChange: (supplyId: number | null) => void; placeholder?: string }) {
  return (
    <select className="ui-input w-full" value={value ?? ""} onChange={(event) => onChange(event.target.value ? Number(event.target.value) : null)}>
      <option value="">{placeholder}</option>
      {products.map((product) => (
        <option key={product.supplyId} value={product.supplyId}>
          {productLabel(product)}
        </option>
      ))}
    </select>
  );
}

/** Products and how many. Picking one adds it with 1; − to 0 takes it off. */
export function PickLines({ products, lines, onChange, addLabel = "+ Add an item" }: { products: PickProduct[]; lines: PickLine[]; onChange: (lines: PickLine[]) => void; addLabel?: string }) {
  const byId = new Map(products.map((product) => [product.supplyId, product]));
  const left = products.filter((product) => !lines.some((line) => line.supplyId === product.supplyId));
  return (
    <div className="ui-stack" data-pick-lines>
      {lines.map((line) => {
        const product = byId.get(line.supplyId);
        return (
          <div key={line.supplyId} className="flex items-center justify-between gap-3 rounded-2xl bg-slate-50 p-3">
            <span className="min-w-0 font-bold">{product ? productLabel(product) : `#${line.supplyId}`}</span>
            <Stepper
              value={line.qty}
              max={9999}
              label={product?.name ?? "Item"}
              onChange={(qty) => onChange(qty === 0 ? lines.filter((entry) => entry.supplyId !== line.supplyId) : lines.map((entry) => (entry.supplyId === line.supplyId ? { ...entry, qty } : entry)))}
            />
          </div>
        );
      })}
      <ProductSelect products={left} value={null} placeholder={addLabel} onChange={(supplyId) => supplyId !== null && onChange([...lines, { supplyId, qty: 1 }])} />
    </div>
  );
}
