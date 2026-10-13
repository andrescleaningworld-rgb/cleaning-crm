"use client";

// Supply control, at the top of the Supplies page (FEATURE_SUPPLY_CONTROL):
// the shelf with photos and counts, the red Reorder list, orders by step,
// and this month's spend per site. Few words, big buttons. When the feature
// is off or the database is not ready, this draws nothing and the Supplies
// page is exactly what it was.

import { useCallback, useEffect, useRef, useState } from "react";
import { BigButton, CHEER, Card, Counts, EmptyState, Field, Sheet, Tabs, showToast } from "@/app/ui";
import SupplyOrderSheet from "../components/supply-order-sheet";
import AccountLink from "../components/AccountLink";

type ShelfItem = { id: number; name: string; category: string; unit: string; photoUrl: string; unitCost: number | null; vendor: string; shelfLocation: string; minLevel: number | null; shelfCount: number | null; low: boolean };
type OrderLine = { rowNumber: number; orderId: string; groupId: string; day: string; accountName: string; item: string; quantity: number; unit: string; source: string; step: string; cost: number; orderedBy: string };
type SpendRow = { accountId: string; accountName: string; amount: number; items: number; mode: "included" | "billed"; invoiced: boolean };
type Move = { id: number; itemName: string; qty: number; kind: string; accountName: string; cost: number; staffName: string; note: string; at: string };
type Data = {
  shelf: ShelfItem[];
  reorder: ShelfItem[];
  orders: { open: OrderLine[]; done: OrderLine[] };
  spend: { month: string; rows: SpendRow[]; total: number };
  settings: { autoApproveAmount: number };
  moves: Move[];
  isOwner: boolean;
};

type Tab = "shelf" | "reorder" | "orders" | "spend";

const dollars = (value: number) => `$${value.toFixed(2)}`;
const STEP_WORD: Record<string, string> = { ordered: "Ordered", approved: "Approved", picked: "Picked", bought: "Bought", delivered: "Delivered" };
const MOVE_WORD: Record<string, string> = { take: "Took", return: "Returned", pick: "Picked", receive: "Received", count: "Count", set: "Count set" };

async function post(body: Record<string, unknown> | FormData): Promise<Record<string, unknown>> {
  const response = await fetch("/api/supply-control", body instanceof FormData ? { method: "POST", body } : { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok || data.success !== true) throw new Error(typeof data.error === "string" ? data.error : "That did not save. Try again.");
  return data;
}

/** The next step of an order line and the button that does it. */
function nextStep(line: OrderLine): { step: string; label: string } | null {
  if (line.step === "ordered") return { step: "approved", label: "Approve" };
  if (line.step === "approved") return line.source === "shelf" ? { step: "picked", label: "Picked" } : { step: "bought", label: "Bought" };
  if (line.step === "picked" || line.step === "bought") return { step: "delivered", label: "Delivered" };
  return null;
}

export default function SupplyControl() {
  const [data, setData] = useState<Data | null>(null);
  const [tab, setTab] = useState<Tab>("shelf");
  const [editing, setEditing] = useState<ShelfItem | null>(null);
  const [ordering, setOrdering] = useState(false);
  const [busy, setBusy] = useState("");
  const [problem, setProblem] = useState("");

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/supply-control", { cache: "no-store" });
      const body = (await response.json()) as { success?: boolean; ready?: boolean } & Partial<Data>;
      if (!response.ok || body.success !== true || body.ready !== true) return setData(null);
      setData(body as Data);
    } catch {
      setData(null);
    }
  }, []);

  useEffect(() => {
    // The first load: fetches, then sets state when the answer arrives.
    void load();
  }, [load]);

  async function run(key: string, body: Record<string, unknown>, done: string) {
    setProblem("");
    setBusy(key);
    try {
      await post(body);
      showToast(done);
      await load();
    } catch (err) {
      setProblem(err instanceof Error ? err.message : "That did not save. Try again.");
    } finally {
      setBusy("");
    }
  }

  // The same purchase order PDF the Supply Orders page makes, for one bought line.
  async function openPo(line: OrderLine) {
    setProblem("");
    setBusy(`po-${line.rowNumber}`);
    try {
      const response = await fetch("/api/supply-orders/po-pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          poNumber: line.orderId,
          orderDate: line.day,
          accountName: line.accountName,
          deliveryMode: "Buy / ship direct",
          orderIds: [line.orderId],
          items: [{ supplyItem: line.item, description: "", category: "", quantity: `${line.quantity}${line.unit ? ` ${line.unit}` : ""}`, notes: "" }],
        }),
      });
      if (!response.ok) throw new Error("The purchase order did not open. Try again.");
      window.open(URL.createObjectURL(await response.blob()), "_blank", "noopener");
    } catch (err) {
      setProblem(err instanceof Error ? err.message : "The purchase order did not open. Try again.");
    } finally {
      setBusy("");
    }
  }

  if (!data) return null;

  return (
    <section className="ui-stack" data-supply-control>
      <Counts
        items={[
          { label: "Reorder", value: data.reorder.length, tone: data.reorder.length > 0 ? "bad" : "good", pressed: tab === "reorder", onClick: () => setTab("reorder") },
          { label: "Open orders", value: data.orders.open.length, tone: "info", pressed: tab === "orders", onClick: () => setTab("orders") },
          { label: "This month", value: dollars(data.spend.total), tone: "info", pressed: tab === "spend", onClick: () => setTab("spend") },
        ]}
      />
      <div>
        <BigButton icon="plus" onClick={() => setOrdering(true)}>
          Order for a site
        </BigButton>
      </div>
      <Tabs
        label="Supply control"
        value={tab}
        onChange={setTab}
        tabs={[
          { value: "shelf", label: "Shelf" },
          { value: "reorder", label: `Reorder${data.reorder.length ? ` (${data.reorder.length})` : ""}` },
          { value: "orders", label: "Orders" },
          { value: "spend", label: "Spend" },
        ]}
      />
      {problem ? <p className="ui-field-error">{problem}</p> : null}

      {tab === "shelf" ? (
        <div className="ui-supply-grid" data-shelf>
          {data.shelf.length === 0 ? <EmptyState title="No supplies yet" text="Add one with Add Supply below." /> : null}
          {data.shelf.map((item) => (
            <button key={item.id} type="button" className={`ui-supply-tile ${item.low ? "ui-supply-tile-low" : ""}`} data-item={item.id} onClick={() => setEditing(item)}>
              {item.photoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- a stored photo, shown small
                <img src={item.photoUrl} alt="" className="ui-supply-photo" />
              ) : (
                <div className="ui-supply-photo ui-supply-nophoto" aria-hidden="true">
                  🧴
                </div>
              )}
              <p className="ui-strong">{item.name}</p>
              <p className="ui-supply-count">{item.shelfCount === null ? "–" : item.shelfCount}</p>
              <p className="ui-muted">
                {item.shelfCount === null ? "Not counted yet" : `on shelf${item.minLevel !== null ? ` · min ${item.minLevel}` : ""}`}
              </p>
              <p className="ui-muted">{[item.unitCost !== null ? `${dollars(item.unitCost)}${item.unit ? ` / ${item.unit}` : ""}` : "No cost yet", item.shelfLocation].filter(Boolean).join(" · ")}</p>
            </button>
          ))}
        </div>
      ) : null}

      {tab === "reorder" ? (
        <div className="ui-stack" data-reorder>
          {data.reorder.length === 0 ? <EmptyState icon="check" title="Nothing to reorder" text="Every counted item is above its minimum." /> : null}
          {data.reorder.map((item) => (
            <div key={item.id} className="ui-card ui-supply-low" data-item={item.id}>
              <div className="ui-card-row" style={{ justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
                <div>
                  <p className="ui-strong">{item.name}</p>
                  <p className="ui-field-error">
                    {item.shelfCount} on shelf, minimum {item.minLevel}
                  </p>
                  {item.vendor ? <p className="ui-muted">{item.vendor}</p> : null}
                </div>
                <BigButton busy={busy === `reorder-${item.id}`} busyLabel="Making…" onClick={() => void run(`reorder-${item.id}`, { action: "reorder", id: item.id }, "Purchase order made ✓")}>
                  Make purchase order
                </BigButton>
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {tab === "orders" ? (
        <div className="ui-stack" data-orders>
          {data.orders.open.length === 0 ? <EmptyState icon="check" title="No open orders" text="Tap Order for a site to make one." /> : null}
          {data.orders.open.map((line) => {
            const next = nextStep(line);
            return (
              <div key={line.rowNumber} className="ui-card" data-line={line.rowNumber} data-step={line.step}>
                <div className="ui-card-row" style={{ justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
                  <div>
                    <p className="ui-strong">
                      {line.quantity} × {line.item}
                    </p>
                    <p className="ui-card-text">
                      <AccountLink name={line.accountName} />
                    </p>
                    <p className="ui-muted">
                      {line.source === "shelf" ? "From shelf" : "Buy / ship direct"} · {STEP_WORD[line.step] ?? line.step} · {dollars(line.cost)}
                      {line.orderedBy ? ` · ${line.orderedBy}` : ""}
                    </p>
                  </div>
                  <div className="ui-actions-row">
                    {line.source === "buy" ? (
                      <BigButton kind="second" busy={busy === `po-${line.rowNumber}`} busyLabel="Making…" onClick={() => void openPo(line)}>
                        PO PDF
                      </BigButton>
                    ) : null}
                    {next && (next.step !== "approved" || data.isOwner) ? (
                      <BigButton busy={busy === `line-${line.rowNumber}`} busyLabel="Saving…" onClick={() => void run(`line-${line.rowNumber}`, { action: "advance", rowNumber: line.rowNumber, step: next.step }, CHEER.logged)}>
                        {next.label}
                      </BigButton>
                    ) : next ? (
                      <p className="ui-muted">Waiting for the owner to approve</p>
                    ) : null}
                  </div>
                </div>
              </div>
            );
          })}
          {data.orders.done.length > 0 ? <p className="ui-muted">Delivered lately: {data.orders.done.length}. They are on the Supply Orders page.</p> : null}
        </div>
      ) : null}

      {tab === "spend" ? (
        <div className="ui-stack" data-spend>
          <Card title={`This month: ${dollars(data.spend.total)}`}>
            {data.spend.rows.length === 0 ? <p className="ui-muted">Nothing has left the shelf this month.</p> : null}
            {data.spend.rows.map((row) => (
              <div key={`${row.accountId}|${row.accountName}`} className="ui-card-row" style={{ justifyContent: "space-between", flexWrap: "wrap", gap: 8, padding: "8px 0" }} data-spend-row={row.accountName}>
                <div>
                  <p className="ui-strong">
                    <AccountLink accountId={row.accountId} name={row.accountName} />
                  </p>
                  <p className="ui-muted">
                    {row.items} item{row.items === 1 ? "" : "s"}
                    {row.accountId ? ` · ${row.mode === "billed" ? "Billed to customer" : "Supplies included"}` : ""}
                  </p>
                </div>
                <div className="ui-actions-row">
                  <p className="ui-strong">{dollars(row.amount)}</p>
                  {row.mode === "billed" && row.accountId ? (
                    <BigButton
                      kind={row.invoiced ? "second" : "main"}
                      busy={busy === `inv-${row.accountId}`}
                      busyLabel="Saving…"
                      onClick={() => void run(`inv-${row.accountId}`, { action: "markInvoiced", accountId: row.accountId, month: data.spend.month, amount: row.amount, on: !row.invoiced }, row.invoiced ? "Mark taken off" : "Marked invoiced ✓")}
                    >
                      {row.invoiced ? "Invoiced ✓" : "Mark invoiced"}
                    </BigButton>
                  ) : null}
                </div>
              </div>
            ))}
          </Card>

          {data.isOwner ? <AutoApprove amount={data.settings.autoApproveAmount} onSaved={() => void load()} /> : null}

          <Card title="Who took what">
            {data.moves.length === 0 ? <p className="ui-muted">Nothing yet. It fills in from the Supply Check tablet.</p> : null}
            {data.moves.slice(0, 20).map((move) => (
              <p key={move.id} className="ui-card-text" style={{ padding: "4px 0" }}>
                <strong>
                  {MOVE_WORD[move.kind] ?? move.kind} {Math.abs(move.qty)} × {move.itemName}
                </strong>
                {move.accountName ? (
                  <>
                    {" · "}
                    <AccountLink name={move.accountName} />
                  </>
                ) : null}
                {move.staffName ? ` · ${move.staffName}` : ""} · {new Date(move.at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
              </p>
            ))}
          </Card>
        </div>
      ) : null}

      <ItemSheet item={editing} onClose={() => setEditing(null)} onSaved={() => void load()} />
      <SupplyOrderSheet
        open={ordering}
        onClose={() => setOrdering(false)}
        onOrdered={() => {
          setTab("orders");
          void load();
        }}
      />
    </section>
  );
}

/* ---------- one item's shelf facts ---------- */

function ItemSheet({ item, onClose, onSaved }: { item: ShelfItem | null; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({ unit: "", unitCost: "", vendor: "", shelfLocation: "", minLevel: "", shelfCount: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!item) return;
    setForm({
      unit: item.unit,
      unitCost: item.unitCost === null ? "" : String(item.unitCost),
      vendor: item.vendor,
      shelfLocation: item.shelfLocation,
      minLevel: item.minLevel === null ? "" : String(item.minLevel),
      shelfCount: item.shelfCount === null ? "" : String(item.shelfCount),
    });
    setError("");
  }, [item]);

  async function save() {
    if (!item) return;
    setSaving(true);
    setError("");
    try {
      await post({ action: "saveItem", id: item.id, ...form });
      const file = fileRef.current?.files?.[0];
      if (file) {
        const upload = new FormData();
        upload.append("id", String(item.id));
        upload.append("file", file);
        await post(upload);
      }
      showToast(CHEER.logged);
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "That did not save. Try again.");
    } finally {
      setSaving(false);
    }
  }

  const set = (key: keyof typeof form) => (event: { target: { value: string } }) => setForm((current) => ({ ...current, [key]: event.target.value }));

  return (
    <Sheet
      open={Boolean(item)}
      title={item?.name ?? ""}
      onClose={onClose}
      busy={saving}
      actions={
        <BigButton busy={saving} busyLabel="Saving…" onClick={() => void save()}>
          Save
        </BigButton>
      }
    >
      <div className="ui-stack" data-item-form>
        <Field label="On the shelf now" type="number" inputMode="numeric" min={0} value={form.shelfCount} onChange={set("shelfCount")} />
        <Field label="Minimum (reorder at or below)" type="number" inputMode="numeric" min={0} value={form.minLevel} onChange={set("minLevel")} />
        <Field label="Cost of one ($)" type="number" inputMode="decimal" min={0} step="0.01" value={form.unitCost} onChange={set("unitCost")} />
        <Field label="Unit" hint="Each, box, gallon…" value={form.unit} onChange={set("unit")} />
        <Field label="Vendor" value={form.vendor} onChange={set("vendor")} />
        <Field label="Shelf location" hint="Where it sits: A3, back wall…" value={form.shelfLocation} onChange={set("shelfLocation")} />
        <label className="ui-field">
          <span className="ui-label">Photo</span>
          <input ref={fileRef} type="file" accept="image/*" capture="environment" className="ui-input" />
        </label>
        {error ? <p className="ui-field-error">{error}</p> : null}
      </div>
    </Sheet>
  );
}

/* ---------- settings: small orders approve themselves ---------- */

function AutoApprove({ amount, onSaved }: { amount: number; onSaved: () => void }) {
  const [value, setValue] = useState(String(amount));
  const [state, setState] = useState<"" | "saved" | string>("");

  async function save() {
    if (Number(value) === amount) return;
    try {
      await post({ action: "saveSettings", autoApproveAmount: value });
      setState("saved");
      onSaved();
    } catch (err) {
      setState(err instanceof Error ? err.message : "That did not save.");
    }
  }

  return (
    <Card title="Small orders approve themselves">
      <Field label="Up to this amount ($)" hint="An order worth this much or less skips approval. It saves when you leave the box." type="number" inputMode="decimal" min={0} value={value} onChange={(event) => setValue(event.target.value)} onBlur={() => void save()} />
      <p className={`ui-savestatus ${state === "saved" ? "ui-savestatus-saved" : ""}`} role="status">
        {state === "saved" ? "Saved ✓" : state}
      </p>
    </Card>
  );
}
