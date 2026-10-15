"use client";

// Supply Orders -> the two shelves (lib/pg/shelves.ts, migrations 038, 039):
//   ⚠️ Arrived different   what a crew confirmed short or extra (also red on
//                          the order's own card)
//   On the way             what the office sent with no order, and its back
//                          orders (Cancel per item); orders show theirs on
//                          their own card (order-cards.tsx)
// Renders nothing where migrations 038 and 039 are not in yet. `accountId` shows one
// account only (the page opened from an account); "" = every account.

import { useEffect, useState } from "react";
import AccountLink from "../components/AccountLink";
import { Card } from "@/app/ui";
import { formatCrewDateTime } from "@/lib/crewDateTime";
import { BackOrderBox } from "./back-order";

type Line = { supplyId: number | null; name: string; unit: string; qty: number };
type Waiting = { key: string; source: "crew-order" | "sub-order" | "office"; backOrder?: boolean; accountId: string; accountName: string; at: string; sentAt: string; lines: Line[] };
type Different = { id: number; accountId: string; accountName: string; by: string; at: string; title: string; lines: string[] };

export default function Deliveries({ accountId = "" }: { accountId?: string }) {
  const [data, setData] = useState<{ waiting: Waiting[]; different: Different[] } | null>(null);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let alive = true;
    fetch("/api/shelves", { cache: "no-store" })
      .then((response) => response.json().then((body: { success?: boolean; ready?: boolean; waiting?: Waiting[]; different?: Different[] }) => ({ ok: response.ok, body })))
      .then(({ ok, body }) => alive && setData(ok && body.success && body.ready ? { waiting: body.waiting ?? [], different: body.different ?? [] } : null))
      .catch(() => alive && setData(null));
    return () => {
      alive = false;
    };
  }, [reload]);

  if (!data) return null;
  const mine = (entry: { accountId: string }) => !accountId || entry.accountId.trim().toLowerCase() === accountId.trim().toLowerCase();
  const onTheWay = data.waiting.filter((entry) => entry.sentAt && entry.source === "office" && mine(entry));
  const different = data.different.filter(mine);
  if (onTheWay.length === 0 && different.length === 0) return null;

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
      {different.length > 0 ? (
        <Card title={`⚠️ Arrived different from the order (${different.length})`}>
          <div className="ui-stack">
            {different.map((entry) => (
              <div key={entry.id} className="rounded-2xl border-2 border-red-400 bg-red-50 p-3" data-different-delivery={entry.id}>
                <p className="ui-strong" style={{ margin: 0 }}>
                  <AccountLink accountId={entry.accountId} name={entry.accountName} />
                </p>
                <p className="font-black text-red-800" style={{ margin: 0 }}>
                  {entry.title}
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
                {entry.backOrder ? <BackOrderBox entryKey={entry.key} lines={entry.lines} onChanged={() => setReload((n) => n + 1)} /> : lineList(entry.lines)}
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
