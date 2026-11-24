"use client";

// The account page's "Customer check-ins" card: "Send check-in" (a preview
// first, then Send), the last answer, and every check-in sent to this
// account: when, by whom, Sent → 👁 Viewed → ✅ / ⚠️ Responded, the answer
// with the comment, best way to reach them and photos, and "View email"
// (the saved copy). Staff only (the account page is).

import { useCallback, useEffect, useMemo, useState } from "react";
import { BigButton, Card } from "@/app/ui";
import { CheckinAnswer, CheckinEmailSheet, CheckinProgress, CheckinSendSheet, whenText } from "@/app/components/checkins";
import { BATCH_KIND_TEXT, CHECKIN_VIEWED_NOTE, checkinComplaintHref, ratingOf, type CheckinRow } from "@/lib/customerCheckin";
import Link from "next/link";

type Data = { ready: boolean; optedOut: boolean; rows: CheckinRow[] };

export default function AccountCheckins({ accountId, cancelled }: { accountId: string; cancelled: boolean }) {
  const [data, setData] = useState<Data | null>(null);
  const [sendOpen, setSendOpen] = useState(false);
  const [viewId, setViewId] = useState<number | null>(null);
  const [showAll, setShowAll] = useState(false);
  const ids = useMemo(() => [accountId], [accountId]);

  const load = useCallback(async () => {
    try {
      const response = await fetch(`/api/customer-checkin?accountId=${encodeURIComponent(accountId)}`, { cache: "no-store" });
      const reply = (await response.json()) as { success?: boolean } & Data;
      setData(reply.success ? reply : null);
    } catch {
      setData(null);
    }
  }, [accountId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- load once the account is known
    void load();
  }, [load]);

  if (!accountId || !data) return null;
  const last = data.rows.find((row) => row.status === "sent" || row.status === "queued");
  const rows = showAll ? data.rows : data.rows.slice(0, 5);

  return (
    <Card
      title="Customer check-ins"
      right={
        data.ready ? (
          <BigButton kind="second" disabled={cancelled} onClick={() => setSendOpen(true)}>
            😀 Send check-in
          </BigButton>
        ) : null
      }
    >
      <div className="ui-stack">
        {!data.ready ? <p className="ui-muted">Check-ins need migration 079 first.</p> : null}
        {cancelled ? <p className="ui-muted">Cancelled accounts do not get check-ins.</p> : null}
        {data.optedOut ? <p className="ui-muted">The customer stopped these emails. They are skipped.</p> : null}
        {last ? (
          <div className="ui-stack" style={{ gap: 4 }}>
            <p className="ui-strong">Last check-in: {last.status === "queued" ? `queued ${whenText(last.createdAt)}` : whenText(last.sentAt)}</p>
            <CheckinAnswer row={last} />
          </div>
        ) : data.ready ? (
          <p className="ui-muted">No check-in sent yet.</p>
        ) : null}

        {data.rows.length > 0 ? (
          <ul className="ui-stack" style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {rows.map((row) => (
              <li key={row.id} style={{ borderTop: "1px solid #dbeafe", paddingTop: 10 }}>
                <div className="ui-actions-row" style={{ justifyContent: "space-between" }}>
                  <span>
                    <span className="ui-strong">{row.sentAt ? whenText(row.sentAt) : `Queued ${whenText(row.createdAt)}`}</span>
                    <span className="ui-muted">
                      {" "}
                      · by {row.sentBy || "Office"}
                      {row.batchKind ? ` · ${row.batchKind === "list" && row.listName ? `List: ${row.listName}` : BATCH_KIND_TEXT[row.batchKind]}` : ""}
                      {row.sentTo ? ` · to ${row.sentTo}` : ""}
                    </span>
                  </span>
                  <CheckinProgress row={row} />
                </div>
                {row.error ? <p className="ui-muted">{row.error}</p> : null}
                {row.status === "sent" ? (
                  <div style={{ marginTop: 6 }}>
                    <CheckinAnswer row={row} history />
                  </div>
                ) : null}
                {/* Needs attention / OK: make a complaint from it by hand (never automatic). */}
                {row.complaintKey ? (
                  <p className="ui-card-text" style={{ marginTop: 6 }}>
                    Turned into complaint{" "}
                    <Link className="ui-link" href={`/complaints/${encodeURIComponent(row.complaintKey)}`}>
                      {row.complaintKey}
                    </Link>
                  </p>
                ) : ratingOf(row.answer) === "attention" || ratingOf(row.answer) === "ok" ? (
                  <div style={{ marginTop: 6 }}>
                    <Link className="ui-btn ui-btn-second" href={checkinComplaintHref({ checkinId: row.id, accountId, accountName: row.accountName })}>
                      Turn into complaint
                    </Link>
                  </div>
                ) : null}
                {row.hasCopy ? (
                  <div style={{ marginTop: 6 }}>
                    <BigButton kind="quiet" onClick={() => setViewId(row.id)}>
                      View email
                    </BigButton>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        ) : null}
        {data.rows.some((row) => row.status === "sent") ? <p className="ui-muted">{CHECKIN_VIEWED_NOTE}</p> : null}
        {data.rows.length > 5 ? (
          <div>
            <BigButton kind="quiet" onClick={() => setShowAll((v) => !v)}>
              {showAll ? "Show fewer" : `Show all ${data.rows.length}`}
            </BigButton>
          </div>
        ) : null}
      </div>

      <CheckinSendSheet
        open={sendOpen}
        accountIds={ids}
        kind="single"
        onClose={() => setSendOpen(false)}
        onSent={() => {
          setSendOpen(false);
          void load();
        }}
      />
      <CheckinEmailSheet checkinId={viewId} onClose={() => setViewId(null)} />
    </Card>
  );
}
