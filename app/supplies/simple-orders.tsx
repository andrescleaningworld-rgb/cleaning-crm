"use client";

// Supplies -> 📥 New orders and 🚚 On the way: one big card per order, two
// giant buttons, few words. The same orders and the same saving as the
// Supply Orders page (app/supply-orders/order-cards.tsx: cardAction,
// deliverCard, syncCardsTracking), which stays as More -> All orders for
// everything else (search, filters, print, pin, delete, many at once).
//
//   New orders   ✓ OK -> "How does it get there?" (Ships to site / Sub picks
//                up / We bring it). When the sub already said how, OK does
//                that in one tap ("OK, another way" for the others).
//                ✗ No declines it, with Undo. "Change amounts first" opens
//                the Approve sheet.
//   On the way   It came ✓ (everything as ordered), with Undo. "Some
//                missing?" opens the − / + sheet; what is short stays as
//                Still coming.

import { useState } from "react";
import { EmptyState, ErrorBox, Screen, SkeletonList, showToast, undoable } from "@/app/ui";
import ApproveSheet, { FILL_WORDS, type FillChoice } from "../supply-orders/approve-sheet";
import { DeliveredSheet, cardAction, deliverCard, onTheWayText, syncCardsTracking, type Card } from "../supply-orders/order-cards";
import { downloadSupplyOrderPdf } from "../supply-orders/order-pdf";
import { useSupplyCards } from "./orders-data";
import styles from "./simple.module.css";

export type SimpleView = "new" | "on-the-way";

const FILLS: FillChoice[] = ["vendor", "pickup", "deliver"];
const fillLabel = (fill: FillChoice) => `${FILL_WORDS[fill].icon} ${FILL_WORDS[fill].label}`;
const placeOf = (card: Card) => card.accountName || "No account";
const errorText = (error: unknown) => (error instanceof Error ? error.message : "That did not save. Try again.");

export default function SimpleOrders({ view }: { view: SimpleView }) {
  const { newOrders, onTheWay, loading, error, reload } = useSupplyCards();
  // Cards waiting out their Undo: hidden at once, back on Undo.
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState("");
  const [approving, setApproving] = useState<Card | null>(null);
  const [checking, setChecking] = useState<Card | null>(null);

  const hide = (key: string, on: boolean) =>
    setHidden((current) => {
      const next = new Set(current);
      if (on) next.add(key);
      else next.delete(key);
      return next;
    });

  /** After a change: the step tracking moves (My work, Late), then everything loads again. */
  async function after(card: Card, step: string) {
    await syncCardsTracking([card], step);
    await reload();
  }

  async function fill(card: Card, how: FillChoice) {
    setBusy(card.key);
    try {
      await cardAction(card, how);
      showToast(`${placeOf(card)}: OK ✓ ${fillLabel(how)}`);
      await after(card, "bought");
    } catch (err) {
      showToast(`${placeOf(card)}: ${errorText(err)}`, "bad");
    } finally {
      setBusy("");
    }
  }

  function decline(card: Card) {
    hide(card.key, true);
    undoable({
      message: `No: ${placeOf(card)}. The order is declined.`,
      run: async () => {
        try {
          await cardAction(card, "decline");
          await after(card, "");
        } catch (err) {
          showToast(`${placeOf(card)}: ${errorText(err)}`, "bad");
          await reload();
        } finally {
          hide(card.key, false);
        }
      },
      onUndo: () => hide(card.key, false),
    });
  }

  function itCame(card: Card) {
    hide(card.key, true);
    undoable({
      message: `It came ✓ ${placeOf(card)}`,
      run: async () => {
        try {
          await deliverCard(card);
          await after(card, "delivered");
        } catch (err) {
          showToast(`${placeOf(card)}: ${errorText(err)}`, "bad");
          await reload();
        } finally {
          hide(card.key, false);
        }
      },
      onUndo: () => hide(card.key, false),
    });
  }

  async function someMissing(card: Card, got: number[][]) {
    setBusy(card.key);
    try {
      const { short } = await deliverCard(card, got);
      setChecking(null);
      showToast(short ? `${placeOf(card)}: ✓ Saved. The rest is still coming.` : `It came ✓ ${placeOf(card)}`);
      await after(card, short ? "bought" : "delivered");
    } catch (err) {
      showToast(errorText(err), "bad");
      await reload();
    } finally {
      setBusy("");
    }
  }

  const list = (view === "new" ? newOrders : onTheWay).filter((card) => !hidden.has(card.key));
  const title = view === "new" ? "New orders" : "On the way";

  return (
    <Screen title={title} backHref="/supplies">
      {error ? <ErrorBox title="Some orders did not load." text={error} onRetry={() => void reload()} /> : null}
      {loading ? (
        <SkeletonList rows={3} />
      ) : list.length === 0 ? (
        <EmptyState icon="check" title={view === "new" ? "No new orders ✓" : "Nothing on the way ✓"} text={view === "new" ? "New orders from crews and subs show up here." : "Orders show up here once they are on their way."} />
      ) : (
        <div className={styles.cards}>
          {list.map((card) =>
            view === "new" ? (
              <NewOrderCard key={card.key} card={card} busy={busy === card.key} locked={busy !== ""} onFill={(how) => void fill(card, how)} onNo={() => decline(card)} onChange={() => setApproving(card)} />
            ) : (
              <OnTheWayCard key={card.key} card={card} locked={busy !== ""} onCame={() => itCame(card)} onMissing={() => setChecking(card)} />
            )
          )}
        </div>
      )}

      <ApproveSheet
        order={approving?.order ?? null}
        title={approving ? placeOf(approving) : "Supply order"}
        suggested={approving?.suggested ?? ""}
        onClose={() => setApproving(null)}
        onDone={(result) => {
          const card = approving;
          setApproving(null);
          if (card) void after(card, result === "approved" ? "approved" : "bought");
        }}
      />
      <DeliveredSheet card={checking} busy={checking !== null && busy === checking.key} onCancel={() => setChecking(null)} onConfirm={(got) => checking && void someMissing(checking, got)} />
    </Screen>
  );
}

/** 🖨 Print and ⬇ Download PDF, the same as on All orders: small, under the big buttons. */
function ShareRow({ card }: { card: Card }) {
  const [downloading, setDownloading] = useState(false);
  async function download() {
    setDownloading(true);
    try {
      await downloadSupplyOrderPdf([card.key]);
    } catch (err) {
      showToast(errorText(err), "bad");
    } finally {
      setDownloading(false);
    }
  }
  return (
    <div className={styles.links}>
      <a className={styles.link} href={`/supply-orders/print?o=${encodeURIComponent(card.key)}`} target="_blank" rel="noopener" data-simple-print>
        🖨 Print
      </a>
      <button type="button" className={styles.link} disabled={downloading} onClick={() => void download()} data-simple-download>
        {downloading ? "Making the PDF…" : "⬇ Download PDF"}
      </button>
    </div>
  );
}

/** The top of every card: where, who and when, and what. */
function CardTop({ card }: { card: Card }) {
  return (
    <>
      <p className={styles.place}>{placeOf(card)}</p>
      <p className={styles.who}>
        {card.late ? <span className={styles.late}>Late</span> : null}
        {card.source === "crew" ? "Crew Link" : "Sub"} · {card.orderedBy || "Unknown"} · {card.atText || "No date"}
      </p>
      <ul className={styles.items}>
        {card.items.map((item, index) => (
          <li key={`${item.itemId}-${index}`}>{item.text}</li>
        ))}
      </ul>
      {card.different.map((entry) => (
        <p key={entry.id} className={styles.wrong}>
          ⚠️ Wrong amount: {entry.lines.join(", ")}
        </p>
      ))}
    </>
  );
}

function NewOrderCard({ card, busy, locked, onFill, onNo, onChange }: { card: Card; busy: boolean; locked: boolean; onFill: (how: FillChoice) => void; onNo: () => void; onChange: () => void }) {
  // OK'd earlier (a sub order filled later): straight to how it gets there.
  const [choosing, setChoosing] = useState(card.step === "approved");
  const suggested = card.suggested;
  return (
    <article className={styles.card} data-simple-order={card.key}>
      <CardTop card={card} />
      {busy ? (
        <p className={styles.saving}>Saving…</p>
      ) : choosing ? (
        <div className={styles.stack}>
          <p className={styles.ask}>How does it get there?</p>
          <div className={styles.fills}>
            {FILLS.map((fill) => (
              <button key={fill} type="button" disabled={locked} className={`${styles.big} ${styles.blue} ${fill === suggested ? styles.suggested : ""}`} onClick={() => onFill(fill)} data-simple-fill={fill}>
                {fillLabel(fill)}
                {fill === suggested ? <span className={styles.small}>The sub asked for this</span> : null}
              </button>
            ))}
          </div>
          {card.step === "approved" ? (
            <button type="button" disabled={locked} className={styles.link} onClick={onNo}>
              ✗ No, decline it
            </button>
          ) : (
            <button type="button" disabled={locked} className={styles.link} onClick={() => setChoosing(false)}>
              ← Back
            </button>
          )}
        </div>
      ) : (
        <div className={styles.stack}>
          <div className={styles.pair}>
            <button type="button" disabled={locked} className={`${styles.big} ${styles.green}`} onClick={() => (suggested ? onFill(suggested) : setChoosing(true))} data-simple-ok>
              ✓ OK
              {suggested ? <span className={styles.small}>{fillLabel(suggested)}</span> : null}
            </button>
            <button type="button" disabled={locked} className={`${styles.big} ${styles.no}`} onClick={onNo} data-simple-no>
              ✗ No
            </button>
          </div>
          <div className={styles.links}>
            {suggested ? (
              <button type="button" disabled={locked} className={styles.link} onClick={() => setChoosing(true)}>
                OK, another way
              </button>
            ) : null}
            <button type="button" disabled={locked} className={styles.link} onClick={onChange}>
              Change amounts first
            </button>
          </div>
        </div>
      )}
      <ShareRow card={card} />
    </article>
  );
}

function OnTheWayCard({ card, locked, onCame, onMissing }: { card: Card; locked: boolean; onCame: () => void; onMissing: () => void }) {
  return (
    <article className={styles.card} data-simple-order={card.key}>
      <CardTop card={card} />
      {card.backOrders.length > 0 ? (
        <p className={styles.coming}>⏳ Still coming: {card.backOrders.flatMap((entry) => entry.lines.map((line) => `${line.qty} ${line.name}`)).join(", ")}</p>
      ) : (
        <p className={styles.hint}>{onTheWayText(card)}</p>
      )}
      <div className={styles.stack}>
        <button type="button" disabled={locked} className={`${styles.big} ${styles.green}`} onClick={onCame} data-simple-came>
          It came ✓
        </button>
        <button type="button" disabled={locked} className={styles.link} onClick={onMissing}>
          Some missing?
        </button>
      </div>
      <ShareRow card={card} />
    </article>
  );
}
