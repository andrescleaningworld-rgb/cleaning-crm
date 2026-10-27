"use client";

// Supplies home: the everyday supply jobs as a few giant tiles, in the
// Equipment Check style. Everything else is behind More, nothing removed.
//
//   📥 New orders          OK or No, then how it gets there (/supplies/new)
//   🚚 On the way          It came ✓ (/supplies/on-the-way)
//   📦 Stock               the warehouse and the sites (/supplies/stock, the
//                          page that was here before, with Products)
//   ✅ What a site can order   for now the Crew Link page (pick a site ->
//                          Pick supplies for this account)
//   📞 Order for a site    an order from a call or text (supply-order-sheet)
//   ⋯ More                 All orders (the Supply Orders page), wrong amounts
//                          and still coming, products, stock came in and
//                          history, crew requests
//
// The counts come from the same orders as the Supply Orders page
// (orders-data.ts). Nothing new is stored.

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ErrorBox, Screen, Sheet } from "@/app/ui";
import { fetchWithTimeout } from "@/lib/fetchWithTimeout";
import SupplyOrderSheet from "../components/supply-order-sheet";
import { useSupplyCards } from "./orders-data";
import styles from "./simple.module.css";

const MORE: { href: string; icon: string; label: string; detail: string }[] = [
  { href: "/supply-orders", icon: "📋", label: "All orders", detail: "Search, filters, print, pin, delete, many at once" },
  { href: "/supply-orders", icon: "⚠️", label: "Wrong amounts and still coming", detail: "At the top of All orders" },
  { href: "/supplies/stock?tab=products", icon: "🏷", label: "Products", detail: "Add or change a product" },
  { href: "/supplies/stock", icon: "📥", label: "Stock came in, reorder, history", detail: "Also kept for customers and this month" },
  { href: "/porter-checklist/submissions", icon: "💬", label: "Crew requests", detail: "Everything crews sent on Crew Link" },
];

/** How many warehouse items are at or below their minimum. null = not known. */
function useReorderCount(): number | null {
  const [count, setCount] = useState<number | null>(null);
  useEffect(() => {
    let alive = true;
    fetchWithTimeout("/api/supply-control", { cache: "no-store" })
      .then((response) => response.json())
      .then((body: { success?: boolean; ready?: boolean; reorder?: unknown[] }) => {
        if (alive && body.success && body.ready && Array.isArray(body.reorder)) setCount(body.reorder.length);
      })
      // The tile still works without its number.
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);
  return count;
}

function Tile({ icon, label, detail, count, calm, href, onClick, more }: { icon: string; label: string; detail?: string; count?: number | null; calm?: boolean; href?: string; onClick?: () => void; more?: boolean }) {
  const inner = (
    <>
      {count ? <span className={`${styles.count} ${calm ? styles.countCalm : ""}`}>{count}</span> : null}
      <span className={styles.tileIcon} aria-hidden="true">
        {icon}
      </span>
      <span className={styles.tileLabel}>{label}</span>
      {detail ? <span className={styles.tileDetail}>{detail}</span> : null}
    </>
  );
  const className = `${styles.tile} ${more ? styles.more : ""}`;
  return href ? (
    <Link href={href} className={className} data-supplies-tile={label}>
      {inner}
    </Link>
  ) : (
    <button type="button" className={className} onClick={onClick} data-supplies-tile={label}>
      {inner}
    </button>
  );
}

export default function SuppliesHome() {
  const router = useRouter();
  const { newOrders, onTheWay, loading, error, reload } = useSupplyCards();
  const reorder = useReorderCount();
  const [ordering, setOrdering] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);

  // Old links to the products and stock page (/supplies?tab=...) land where it moved.
  useEffect(() => {
    const tab = new URLSearchParams(window.location.search).get("tab");
    if (tab) router.replace(`/supplies/stock?tab=${encodeURIComponent(tab)}`);
  }, [router]);

  const counted = (n: number) => (loading ? null : n);

  return (
    <Screen title="Supplies" backHref="/">
      {error ? <ErrorBox title="Some orders did not load." text={error} onRetry={() => void reload()} /> : null}

      <div className={styles.tiles}>
        <Tile icon="📥" label="New orders" detail={loading ? "…" : newOrders.length === 0 ? "None ✓" : "OK or No"} count={counted(newOrders.length)} href="/supplies/new" />
        <Tile icon="🚚" label="On the way" detail={loading ? "…" : onTheWay.length === 0 ? "None" : "Tap when it came"} count={counted(onTheWay.length)} calm href="/supplies/on-the-way" />
        <Tile icon="📦" label="Stock" detail={reorder ? `${reorder} to reorder` : "Warehouse and sites"} href="/supplies/stock" />
        <Tile icon="✅" label="What a site can order" detail="Pick the site on Crew Link" href="/crew-link" />
        <Tile icon="📞" label="Order for a site" detail="From a call or text" onClick={() => setOrdering(true)} />
        <Tile icon="⋯" label="More" detail="Everything else" onClick={() => setMoreOpen(true)} more />
      </div>

      <SupplyOrderSheet
        open={ordering}
        onClose={() => setOrdering(false)}
        onOrdered={() => {
          setOrdering(false);
          void reload();
        }}
      />

      <Sheet open={moreOpen} title="More" onClose={() => setMoreOpen(false)} closeLabel="Close">
        <nav className={styles.moreList} aria-label="More supply screens">
          {MORE.map((entry) => (
            <Link key={entry.label} href={entry.href} className={styles.moreItem}>
              <span aria-hidden="true">{entry.icon}</span>
              <span>
                {entry.label}
                <small>{entry.detail}</small>
              </span>
            </Link>
          ))}
        </nav>
      </Sheet>
    </Screen>
  );
}
