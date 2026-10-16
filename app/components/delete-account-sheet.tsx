"use client";

// "Delete account" (account page → More): the account's name, how much it
// has (visits, complaints, supply orders, checklist items), a reason, and a
// big red Delete. A soft delete (app/api/accounts/[id]/delete): nothing is
// erased, and Settings → Deleted accounts can restore it.

import { useEffect, useState } from "react";
import { BigButton, ErrorBox, Sheet, TextAreaField } from "@/app/ui";

type Impact = {
  accountId: string;
  accountName: string;
  visits: number | null;
  complaints: number | null;
  supplyOrders: number | null;
  checklistItems: number | null;
};

function counted(n: number | null, one: string, many: string): string {
  if (n === null) return `${many}: not known`;
  return `${n} ${n === 1 ? one : many}`;
}

export default function DeleteAccountSheet({
  open,
  accountId,
  onClose,
  onDeleted,
}: {
  open: boolean;
  accountId: string;
  onClose: () => void;
  onDeleted: (accountName: string) => void;
}) {
  const [impact, setImpact] = useState<Impact | null>(null);
  const [loadError, setLoadError] = useState("");
  const [reason, setReason] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");

  // Each opening reads the numbers fresh.
  useEffect(() => {
    if (!open || !accountId) return;
    let alive = true;
    setImpact(null);
    setLoadError("");
    setReason("");
    setError("");
    fetch(`/api/accounts/${encodeURIComponent(accountId)}/delete`, { cache: "no-store" })
      .then((response) => response.json())
      .then((data: { success?: boolean; error?: string; impact?: Impact }) => {
        if (!alive) return;
        if (data.success && data.impact) setImpact(data.impact);
        else setLoadError(data.error || "Could not load this account.");
      })
      .catch(() => alive && setLoadError("Could not load this account."));
    return () => {
      alive = false;
    };
  }, [open, accountId]);

  async function remove() {
    if (!impact || !reason.trim()) return;
    setDeleting(true);
    setError("");
    try {
      const response = await fetch(`/api/accounts/${encodeURIComponent(accountId)}/delete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: reason.trim() }),
      });
      const data = (await response.json().catch(() => ({}))) as { success?: boolean; error?: string; accountName?: string };
      if (!response.ok || !data.success) throw new Error(data.error || "The account was not deleted. Try again.");
      onDeleted(data.accountName || impact.accountName);
    } catch (err) {
      setError(err instanceof Error ? err.message : "The account was not deleted. Try again.");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <Sheet
      open={open}
      title="Delete account"
      onClose={onClose}
      busy={deleting}
      actions={
        impact ? (
          <BigButton kind="danger" busy={deleting} busyLabel="Deleting…" disabled={!reason.trim()} onClick={() => void remove()}>
            Delete
          </BigButton>
        ) : undefined
      }
    >
      {loadError ? <ErrorBox title="Cannot delete" text={loadError} /> : null}
      {!impact && !loadError ? <p className="ui-muted">Loading…</p> : null}
      {impact ? (
        <div className="ui-stack">
          <p style={{ fontSize: 20, fontWeight: 800 }}>{impact.accountName}</p>
          <p>This account has:</p>
          <ul style={{ margin: 0, paddingLeft: 22, lineHeight: 1.7 }}>
            <li>{counted(impact.visits, "visit", "visits")}</li>
            <li>{counted(impact.complaints, "complaint", "complaints")}</li>
            <li>{counted(impact.supplyOrders, "supply order", "supply orders")}</li>
            <li>{counted(impact.checklistItems, "checklist item", "checklist items")}</li>
          </ul>
          <p className="ui-muted">
            It disappears everywhere: Accounts Center, Pin Board, Coverage, sub suggestions, the customer portal, the sub portal, and its Crew Link and Team
            Hub links stop working. Its visits, complaints, to-dos and orders are hidden with it. Nothing is erased: Settings → Deleted accounts can restore it.
          </p>
          <TextAreaField
            label="Why are you deleting it?"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="For example: duplicate of another account"
            maxLength={500}
            rows={3}
          />
          {error ? <ErrorBox title="Not deleted" text={error} /> : null}
        </div>
      ) : null}
    </Sheet>
  );
}
