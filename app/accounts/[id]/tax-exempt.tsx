"use client";

// Account page -> More -> "Tax exempt: ON / OFF" (lib/pg/tax-exempt.ts,
// migration 065). Every price is before sales tax: the customer sees
// "$X / month + sales tax", or "$X / month" when this is ON. Display only.

import { useEffect, useState } from "react";
import { BigButton, showToast } from "@/app/ui";

export default function TaxExemptButton({ accountId }: { accountId: string }) {
  const [exempt, setExempt] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const api = `/api/accounts/${encodeURIComponent(accountId)}/tax-exempt`;

  useEffect(() => {
    let alive = true;
    fetch(api, { cache: "no-store" })
      .then((response) => response.json())
      .then((data: { success?: boolean; exempt?: boolean }) => {
        if (alive && data.success) setExempt(data.exempt === true);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [api]);

  if (exempt === null) return null;

  async function toggle() {
    setBusy(true);
    try {
      const response = await fetch(api, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ on: !exempt }) });
      const data = (await response.json().catch(() => ({}))) as { success?: boolean; error?: string; exempt?: boolean };
      if (!response.ok || !data.success) throw new Error(data.error || "That did not save. Try again.");
      setExempt(data.exempt === true);
      showToast(data.exempt ? "Tax exempt: ON. The customer sees the price with no tax note." : "Tax exempt: OFF. The customer sees the price + sales tax.");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "That did not save. Try again.", "bad");
    } finally {
      setBusy(false);
    }
  }

  return (
    <BigButton kind="second" icon={exempt ? "check" : "off"} busy={busy} busyLabel="Saving…" onClick={() => void toggle()}>
      {`Tax exempt: ${exempt ? "ON" : "OFF"}`}
    </BigButton>
  );
}
