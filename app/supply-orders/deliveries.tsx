"use client";

// Supply Orders -> the two shelves (lib/pg/shelves.ts, migration 038):
//   ⚠️ Arrived short   what a crew confirmed short or missing
//   🚚 Ready to send   open orders (Crew Link and sub portal): one tap takes
//                      them off the office shelf and they wait for the crew
//   On the way         sent; the crew taps "Supplies arrived" when it comes
// Renders nothing where migration 038 is not in yet. `accountId` shows one
// account only (the page opened from an account); "" = every account.

import { useCallback, useEffect, useState } from "react";
import AccountLink from "../components/AccountLink";
import { Card, showToast } from "@/app/ui";
import { formatCrewDateTime } from "@/lib/crewDateTime";

type Line = { supplyId: number | null; name: string; unit: string; qty: number };
type Waiting = { key: string; source: "crew-order" | "sub-order" | "office"; accountId: string; accountName: string; at: string; sentAt: string; lines: Line[] };
type Short = { id: number; accountId: string; accountName: string; by: string; at: string; lines: string[] };

const SOURCE_LABEL: Record<Waiting["source"], string> = { "crew-order": "Crew Link order", "sub-order": "Sub portal order", office: "Sent by the office" };

export default function Deliveries({ accountId = "" }: { accountId?: string }) {
  const [data, setData] = useState<{ waiting: Waiting[]; short: Short[] } | null>(null);
  const [busyKey, setBusyKey] = useState("");

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/shelves", { cache: "no-store" });
      const body = (await response.json()) as { success?: boolean; ready?: boolean; waiting?: Waiting[]; short?: Short[] };
      setData(response.ok && body.success && body.ready ? { waiting: body.waiting ?? [], short: body.short ?? [] } : null);
    } catch {
      setData(null);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (!data) return null;
  const mine = (entry: { accountId: string }) => !accountId || entry.accountId.trim().toLowerCase() === accountId.trim().toLowerCase();
  const toSend = data.waiting.filter((entry) => !entry.sentAt && entry.source !== "office" && mine(entry));
  const onTheWay = data.waiting.filter((entry) => entry.sentAt && mine(entry));
  const short = data.short.filter(mine);
  if (toSend.length === 0 && onTheWay.length === 0 && short.length === 0) return null;

  async function send(entry: Waiting) {
    setBusyKey(entry.key);
    try {
      const response = await fetch("/api/shelves", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "send", key: entry.key }) });
      const body = (await response.json().catch(() => ({}))) as { success?: boolean; error?: string };
      if (!response.ok || !body.success) throw new Error(body.error || "That did not save. Try again.");
      showToast(`🚚 Sent to ${entry.accountName} ✓`);
      await load();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "That did not save. Try again.", "bad");
    } finally {
      setBusyKey("");
    }
  }

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

      {toSend.length > 0 ? (
        <Card title={`🚚 Ready to send (${toSend.length})`}>
          <div className="ui-stack">
            {toSend.map((entry) => (
              <div key={entry.key} className="ui-stat" data-to-send={entry.key}>
                <p className="ui-strong" style={{ margin: 0 }}>
                  <AccountLink accountId={entry.accountId} name={entry.accountName} />
                </p>
                {lineList(entry.lines)}
                <p className="ui-muted" style={{ margin: "0 0 8px" }}>
                  {SOURCE_LABEL[entry.source]} · {formatCrewDateTime(entry.at)}
                </p>
                <button
                  type="button"
                  disabled={busyKey !== ""}
                  onClick={() => void send(entry)}
                  className="flex min-h-[64px] w-full items-center justify-center gap-3 rounded-2xl bg-blue-700 px-4 text-xl font-black text-white shadow-sm active:scale-[0.98] disabled:opacity-50"
                >
                  {busyKey === entry.key ? "Sending…" : "🚚 Sent to site"}
                </button>
              </div>
            ))}
            <p className="ui-muted" style={{ margin: 0 }}>
              Sent to site takes the items off the office shelf. The crew confirms with Supplies arrived.
            </p>
          </div>
        </Card>
      ) : null}

      {onTheWay.length > 0 ? (
        <Card title={`On the way (${onTheWay.length})`}>
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
