"use client";

// Account page -> "Everything for this account": one big tile for each kind
// of record (visits, updates, extra jobs, complaints, supply orders, photos,
// to-dos, sales), with how many there are and how many are still open. A tap
// opens that list showing this account only (app/components/account-scope.tsx);
// every one of those lists has "Back to <account name>" at the top.
//
// The numbers come from /api/admin/account-summary (read only). If they do
// not load, the tiles are still there and still open the lists.

import Link from "next/link";
import { useEffect, useState } from "react";
import { TileIconSvg, type TileIcon } from "@/app/ui";

type Count = { total: number; open: number } | null;
type Summary = { visits: Count; updates: Count; extraJobs: Count; complaints: Count; supplyOrders: Count; photos: Count; todos: Count; sales: Count };
type Kind = keyof Summary;

const TILES: { kind: Kind; label: string; icon: TileIcon; path: string; extra?: string; openWord?: string }[] = [
  { kind: "visits", label: "Visits", icon: "visit", path: "/visits" },
  { kind: "updates", label: "Updates", icon: "note", path: "/account-updates" },
  { kind: "extraJobs", label: "Extra jobs", icon: "money", path: "/extra-jobs", openWord: "open" },
  { kind: "complaints", label: "Complaints", icon: "problem", path: "/complaints", openWord: "open" },
  { kind: "supplyOrders", label: "Supply orders", icon: "box", path: "/supply-orders", openWord: "open" },
  { kind: "photos", label: "Photos", icon: "camera", path: "/photos" },
  { kind: "todos", label: "To-dos", icon: "todo", path: "/to-do", openWord: "open" },
  // The Sales page opened for an account is the "Add sale" form; view=list is its list.
  { kind: "sales", label: "Sales", icon: "status", path: "/sales", extra: "&view=list" },
];

export default function AccountEverything({ accountId, accountName }: { accountId: string; accountName: string }) {
  const [summary, setSummary] = useState<Summary | null>(null);

  useEffect(() => {
    if (!accountId) return;
    let alive = true;
    fetch(`/api/admin/account-summary?accountId=${encodeURIComponent(accountId)}`, { cache: "no-store" })
      .then((response) => response.json())
      .then((body: { success?: boolean; summary?: Summary | null }) => {
        if (alive && body.success === true) setSummary(body.summary ?? null);
      })
      .catch(() => null);
    return () => {
      alive = false;
    };
  }, [accountId]);

  if (!accountId) return null;
  const query = `accountId=${encodeURIComponent(accountId)}&account=${encodeURIComponent(accountName)}`;

  return (
    <section className="account-detail-print-hide" aria-label="Everything for this account" data-account-everything>
      <h2 className="ui-section-title">Everything for this account</h2>
      <div className="ui-acttiles">
        {TILES.map((tile) => {
          const count = summary ? summary[tile.kind] : null;
          const open = count && tile.openWord ? count.open : 0;
          return (
            <div key={tile.kind} className="ui-counttile" data-everything={tile.kind}>
              <Link
                href={`${tile.path}?${query}${tile.extra ?? ""}`}
                className="ui-acttile"
                aria-label={`${tile.label}${count ? `: ${count.total}` : ""}${open > 0 ? `, ${open} ${tile.openWord}` : ""}. Open the list for this account.`}
              >
                <TileIconSvg name={tile.icon} />
                <span className="ui-acttile-label">{tile.label}</span>
                <span className="ui-counttile-count">{count ? count.total : " "}</span>
                {open > 0 ? (
                  <span className="ui-counttile-open">
                    {open} {tile.openWord}
                  </span>
                ) : null}
              </Link>
              {tile.kind === "updates" ? (
                <Link href={`/account-updates?${query}&add=1`} className="ui-counttile-new">
                  + New update
                </Link>
              ) : null}
            </div>
          );
        })}
      </div>
    </section>
  );
}
