"use client";

// "Edit order" for a supply order a crew already sent (Crew Link, and the
// Team Hub crews). Used on the Supply Orders page, in the Accounts Center
// queue and on the account's own list.
//
//   <CrewOrderEdit>   the "Edit order" button with its sheet, and under it
//                     "Edited by <name>, <when>" with a way to see what the
//                     crew first asked for.
//   useEditMarks()    who edited which of the orders on a screen.
//
// An order can be changed while it is Sent (New) or Ordered. Delivered and
// Cancelled orders are read-only: the button is not there. Where migration
// 033 is not in the database yet, nothing renders.

import { useCallback, useEffect, useMemo, useState } from "react";
import { BigButton, SelectField, Sheet, TextAreaField, showToast } from "@/app/ui";
import { formatCrewDateTime } from "@/lib/crewDateTime";

export type EditMark = { editedBy: string; editedAt: string };

type Line = { itemId: number; itemName: string; unit: string; qty: number };
type CatalogItem = { id: number; name: string; brand: string; productLine: string; unit: string };
type OrderDetail = {
  id: number;
  accountName: string;
  status: string;
  otherItems: string;
  lines: Line[];
  canEdit: boolean;
  original: { lines: Line[]; otherItems: string } | null;
  edits: { editedBy: string; editedAt: string; changes: string[] }[];
  addable: CatalogItem[];
};

const isOpen = (status: string) => status === "new" || status === "ordered";

async function getJson(url: string): Promise<Record<string, unknown>> {
  const response = await fetch(url, { cache: "no-store" });
  const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok || body.success !== true) throw new Error(typeof body.error === "string" ? body.error : "That did not load.");
  return body;
}

/** Who edited which of these orders. `version` changes to ask again (after a save). {} where the feature is not on. */
export function useEditMarks(orderIds: number[], version = 0): Record<number, EditMark> {
  const [marks, setMarks] = useState<Record<number, EditMark>>({});
  const key = [...orderIds].sort((a, b) => a - b).join(",");
  useEffect(() => {
    if (!key) return;
    let alive = true;
    getJson(`/api/admin/crew-supplies?view=marks&ids=${key}`)
      .then((body) => alive && setMarks((body.marks as Record<number, EditMark>) ?? {}))
      .catch(() => null);
    return () => {
      alive = false;
    };
  }, [key, version]);
  return marks;
}

const itemLabel = (item: CatalogItem) => [item.name, [item.brand, item.productLine].filter(Boolean).join(" "), item.unit].filter(Boolean).join(" · ");

export function CrewOrderEdit({ orderId, status, mark, onSaved }: { orderId: number; status: string; mark?: EditMark; onSaved?: () => void }) {
  const [open, setOpen] = useState<"" | "edit" | "original">("");
  const [detail, setDetail] = useState<OrderDetail | null>(null);
  const [lines, setLines] = useState<Line[]>([]);
  const [other, setOther] = useState("");
  const [adding, setAdding] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setError("");
    setDetail(null);
    try {
      const body = await getJson(`/api/admin/crew-supplies?view=order&id=${orderId}`);
      if (body.ready !== true) throw new Error("This is not turned on here yet.");
      const order = body.order as OrderDetail;
      setDetail(order);
      setLines(order.lines);
      setOther(order.otherItems);
      setAdding("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "That did not load.");
    }
  }, [orderId]);

  const show = (what: "edit" | "original") => {
    setOpen(what);
    void load();
  };

  // What can still be added: the account's items that are not on the order yet.
  const addable = useMemo(() => (detail ? detail.addable.filter((item) => !lines.some((line) => line.itemId === item.id)) : []), [detail, lines]);

  const setQty = (itemId: number, qty: number) => setLines((current) => current.map((line) => (line.itemId === itemId ? { ...line, qty: Math.max(1, Math.min(999, qty)) } : line)));
  const remove = (itemId: number) => setLines((current) => current.filter((line) => line.itemId !== itemId));
  const add = () => {
    const item = addable.find((entry) => String(entry.id) === adding);
    if (!item) return;
    setLines((current) => [...current, { itemId: item.id, itemName: item.name, unit: item.unit, qty: 1 }]);
    setAdding("");
  };

  async function save() {
    setError("");
    setBusy(true);
    try {
      const response = await fetch("/api/admin/crew-supplies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "editOrder", id: orderId, lines: lines.map((line) => ({ itemId: line.itemId, qty: line.qty })), otherItems: other }),
      });
      const body = (await response.json().catch(() => ({}))) as { success?: boolean; error?: string; changes?: string[] };
      if (!response.ok || body.success !== true) throw new Error(body.error ?? "The order was not changed.");
      showToast((body.changes ?? []).length > 0 ? "Order changed ✓" : "Nothing was changed.");
      setOpen("");
      onSaved?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "The order was not changed.");
    } finally {
      setBusy(false);
    }
  }

  const canEdit = isOpen(status);
  if (!canEdit && !mark) return null;

  return (
    <>
      {canEdit ? (
        <BigButton kind="second" data-edit-order={orderId} onClick={() => show("edit")}>
          Edit order
        </BigButton>
      ) : null}
      {mark ? (
        <p className="ui-muted" style={{ flexBasis: "100%", margin: 0 }} data-order-edited={orderId}>
          Edited by {mark.editedBy || "staff"}, {formatCrewDateTime(mark.editedAt)}.{" "}
          <button type="button" className="ui-link" onClick={() => show("original")}>
            See what the crew sent
          </button>
        </p>
      ) : null}

      <Sheet
        open={open === "edit"}
        title="Edit order"
        text={detail ? detail.accountName : undefined}
        onClose={() => setOpen("")}
        busy={busy}
        actions={
          detail?.canEdit ? (
            <BigButton busy={busy} busyLabel="Saving…" onClick={() => void save()}>
              Save changes
            </BigButton>
          ) : undefined
        }
      >
        <div className="ui-stack">
          {!detail && !error ? <p className="ui-muted">Loading…</p> : null}
          {detail && !detail.canEdit ? <p className="ui-strong">This order is closed, so it cannot be changed.</p> : null}
          {detail?.canEdit ? (
            <>
              {lines.length === 0 ? <p className="ui-muted">No items from the list.</p> : null}
              {lines.map((line) => (
                <div key={line.itemId} className="ui-stat" data-order-line={line.itemId}>
                  <p className="ui-strong" style={{ margin: 0 }}>
                    {line.itemName} <span className="ui-muted">({line.unit})</span>
                  </p>
                  <div className="ui-actions-row" style={{ marginTop: 8, alignItems: "center" }}>
                    <BigButton kind="second" disabled={busy || line.qty <= 1} aria-label={`One less ${line.itemName}`} onClick={() => setQty(line.itemId, line.qty - 1)}>
                      −
                    </BigButton>
                    <span className="ui-stat-value" style={{ minWidth: 48, textAlign: "center" }} aria-live="polite">
                      {line.qty}
                    </span>
                    <BigButton kind="second" disabled={busy || line.qty >= 999} aria-label={`One more ${line.itemName}`} onClick={() => setQty(line.itemId, line.qty + 1)}>
                      +
                    </BigButton>
                    <BigButton kind="quiet" disabled={busy} aria-label={`Remove ${line.itemName}`} onClick={() => remove(line.itemId)}>
                      Remove
                    </BigButton>
                  </div>
                </div>
              ))}

              {addable.length > 0 ? (
                <div className="ui-stack">
                  <SelectField label="Add an item" value={adding} disabled={busy} onChange={(event) => setAdding(event.target.value)}>
                    <option value="">Pick an item</option>
                    {addable.map((item) => (
                      <option key={item.id} value={item.id}>
                        {itemLabel(item)}
                      </option>
                    ))}
                  </SelectField>
                  <div>
                    <BigButton kind="second" icon="plus" disabled={busy || !adding} onClick={add}>
                      Add
                    </BigButton>
                  </div>
                </div>
              ) : null}

              <TextAreaField label="Other supplies" optional rows={3} maxLength={1000} value={other} disabled={busy} onChange={(event) => setOther(event.target.value)} />
            </>
          ) : null}
          {error ? <p className="ui-field-error">{error}</p> : null}
        </div>
      </Sheet>

      <Sheet open={open === "original"} title="What the crew sent" text={detail ? detail.accountName : undefined} onClose={() => setOpen("")} closeLabel="Close">
        <div className="ui-stack">
          {!detail && !error ? <p className="ui-muted">Loading…</p> : null}
          {detail?.original ? (
            <>
              <ul className="ui-list-plain">
                {detail.original.lines.map((line) => (
                  <li key={line.itemId}>
                    {line.qty} × {line.itemName} ({line.unit})
                  </li>
                ))}
                {detail.original.lines.length === 0 ? <li>No items from the list.</li> : null}
              </ul>
              <p style={{ margin: 0 }}>
                <span className="ui-strong">Other supplies:</span> {detail.original.otherItems || "None"}
              </p>
            </>
          ) : null}
          {detail && !detail.original ? <p className="ui-muted">Nobody has changed this order.</p> : null}
          {detail && detail.edits.length > 0 ? (
            <>
              <p className="ui-strong" style={{ margin: 0 }}>
                Changes
              </p>
              {detail.edits.map((edit, index) => (
                <div key={index} className="ui-stat">
                  <p className="ui-muted" style={{ margin: 0 }}>
                    {edit.editedBy || "Staff"}, {formatCrewDateTime(edit.editedAt)}
                  </p>
                  <ul className="ui-list-plain" style={{ marginTop: 4 }}>
                    {edit.changes.map((change, line) => (
                      <li key={line}>{change}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </>
          ) : null}
          {error ? <p className="ui-field-error">{error}</p> : null}
        </div>
      </Sheet>
    </>
  );
}
