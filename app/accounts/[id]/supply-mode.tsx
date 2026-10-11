"use client";

// On an account's page (FEATURE_SUPPLY_CONTROL): "Order supplies" for this
// site, and whether its supplies are included in the price or billed to the
// customer. Draws nothing when supply control is off.

import { useEffect, useState } from "react";
import { BigButton, showToast } from "@/app/ui";
import SupplyOrderSheet from "../../components/supply-order-sheet";

export default function SupplyMode({ accountId, accountName }: { accountId: string; accountName: string }) {
  const [mode, setMode] = useState<"" | "included" | "billed">("");
  const [ordering, setOrdering] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!accountId) return;
    let alive = true;
    fetch(`/api/supply-control?view=account&accountId=${encodeURIComponent(accountId)}`, { cache: "no-store" })
      .then((response) => response.json())
      .then((data: { ready?: boolean; mode?: "included" | "billed" }) => alive && setMode(data.ready ? (data.mode ?? "included") : ""))
      .catch(() => alive && setMode(""));
    return () => {
      alive = false;
    };
  }, [accountId]);

  if (!mode) return null;

  async function change(next: "included" | "billed") {
    setSaving(true);
    try {
      const response = await fetch("/api/supply-control", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "setMode", accountId, accountName, mode: next }) });
      const data = (await response.json().catch(() => ({}))) as { success?: boolean; error?: string };
      if (!response.ok || data.success !== true) throw new Error(data.error || "That did not save. Try again.");
      setMode(next);
      showToast("Saved ✓");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "That did not save. Try again.", "bad");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="ui-stack" data-supply-mode={mode}>
      <BigButton kind="second" onClick={() => setOrdering(true)}>
        Order supplies
      </BigButton>
      <div className="ui-checks" role="radiogroup" aria-label="Supplies for this account">
        <label className="ui-check">
          <input type="radio" name="supply-mode" checked={mode === "included"} disabled={saving} onChange={() => void change("included")} />
          <span>Supplies included</span>
        </label>
        <label className="ui-check">
          <input type="radio" name="supply-mode" checked={mode === "billed"} disabled={saving} onChange={() => void change("billed")} />
          <span>Supplies billed to customer</span>
        </label>
      </div>
      <SupplyOrderSheet open={ordering} site={{ id: accountId, name: accountName }} onClose={() => setOrdering(false)} />
    </div>
  );
}
