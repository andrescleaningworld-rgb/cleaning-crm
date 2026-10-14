"use client";

// Supply Orders -> the two shelves (lib/pg/shelves.ts, migration 038):
//   ⚠️ Arrived short   what a crew confirmed short or missing (also red on
//                      the order's own card)
//   On the way         what the office sent with no order; orders show it on
//                      their own card (order-cards.tsx), with 🚚 Sent to site
// Renders nothing where migration 038 is not in yet. `accountId` shows one
// account only (the page opened from an account); "" = every account.

import { useEffect, useState } from "react";
import AccountLink from "../components/AccountLink";
import { Card } from "@/app/ui";
import { formatCrewDateTime } from "@/lib/crewDateTime";

type Line = { supplyId: number | null; name: string; unit: string; qty: number };
type Waiting = { key: string; source: "crew-order" | "sub-order" | "office"; accountId: string; accountName: string; at: string; sentAt: string; lines: Line[] };
type Short = { id: number; accountId: string; accountName: string; by: string; at: string; lines: string[] };

export default function Deliveries({ accountId = "" }: { accountId?: string }) {
  const [data, setData] = useState<{ waiting: Waiting[]; short: Short[] } | null>(null);

  useEffect(() => {
    let alive = true;
    fetch("/api/shelves", { cache: "no-store" })
      .then((response) => response.json().then((body: { success?: boolean; ready?: boolean; waiting?: Waiting[]; short?: Short[] }) => ({ ok: response.ok, body })))
      .then(({ ok, body }) => alive && setData(ok && body.success && body.ready ? { waiting: body.waiting ?? [], short: body.short ?? [] } : null))
      .catch(() => alive && setData(null));
    return () => {
      alive = false;
    };
  }, []);

  if (!data) return null;
  const mine = (entry: { accountId: string }) => !accountId || entry.accountId.trim().toLowerCase() === accountId.trim().toLowerCase();
  const onTheWay = data.waiting.filter((entry) => entry.sentAt && entry.source === "office" && mine(entry));
  const short = data.short.filter(mine);
  if (onTheWay.length === 0 && short.length === 0) return null;

  const lineList = (lines: Line[]) => (
    <ul className="ui-list-plain" style={{ marginTop: 4 }}>
      {lines.map((line, index) => (
        <li key={`${line.name}-${index}`}>
          {line.qty} × {line.name}
          {line.unit ? ` (${line.unit})` : ""}
        </li>
      ))}
    </ul>
  );

  return (
    <div className="print:hidden ui-stack" data-deliveries style={{ marginBottom: 16 }}>
      {short.length > 0 ? (
        <Card title={`⚠️ Arrived short (${short.length})`}>
          <div className="ui-stack">
            {short.map((entry) => (
              <div key={entry.id} className="rounded-2xl border-2 border-red-400 bg-red-50 p-3" data-short-delivery={entry.id}>
                <p className="ui-strong" style={{ margin: 0 }}>
                  <AccountLink accountId={entry.accountId} name={entry.accountName} />
                </p>
                <ul className="ui-list-plain" style={{ marginTop: 4 }}>
                  {entry.lines.map((line) => (
                    <li key={line} className="font-bold text-red-800">
                      {line}
                    </li>
                  ))}
                </ul>
                <p className="ui-muted" style={{ margin: 0 }}>
                  {entry.by} · {formatCrewDateTime(entry.at)}
                </p>
              </div>
            ))}
          </div>
        </Card>
      ) : null}

      {onTheWay.length > 0 ? (
        <Card title={`🚚 Sent by the office, on the way (${onTheWay.length})`}>
          <div className="ui-stack">
            {onTheWay.map((entry) => (
              <div key={entry.key} className="ui-stat" data-on-the-way={entry.key}>
                <p className="ui-strong" style={{ margin: 0 }}>
                  <AccountLink accountId={entry.accountId} name={entry.accountName} />
                </p>
                {lineList(entry.lines)}
                <p className="ui-muted" style={{ margin: 0 }}>
                  Sent {formatCrewDateTime(entry.sentAt)} · waiting for the crew to confirm
                </p>
              </div>
            ))}
          </div>
        </Card>
      ) : null}
    </div>
  );
}
