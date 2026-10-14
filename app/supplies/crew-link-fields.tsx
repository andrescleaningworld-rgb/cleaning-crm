"use client";

// Supplies -> Edit a product -> "Crew Link": what crews see of this product
// (one list, migration 038). The name they read starts from the description;
// the office can change it. Brand, and "On the default list" (what a crew at
// an account with nothing picked can order). Saved by itself, with its own
// button. Renders nothing where migration 038 is not in yet.

import { useEffect, useState } from "react";
import { BigButton, Field, showToast } from "@/app/ui";

type Crew = { crewName: string; brand: string; inDefaultList: boolean };

export default function CrewLinkFields({ rowNumber }: { rowNumber: number }) {
  const [crew, setCrew] = useState<Crew | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    fetch(`/api/admin/supply-list?view=product&rowNumber=${rowNumber}`, { cache: "no-store" })
      .then((response) => response.json())
      .then((body: { success?: boolean; ready?: boolean; product?: Crew }) => {
        if (alive && body.success && body.ready && body.product) setCrew(body.product);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [rowNumber]);

  if (!crew) return null;

  async function save() {
    if (!crew) return;
    setError("");
    setBusy(true);
    try {
      const response = await fetch("/api/admin/supply-list", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "saveCrew", rowNumber, ...crew }) });
      const body = (await response.json().catch(() => ({}))) as { success?: boolean; error?: string };
      if (!response.ok || body.success !== true) throw new Error(body.error ?? "That did not save. Try again.");
      showToast("Crew Link saved ✓");
    } catch (err) {
      setError(err instanceof Error ? err.message : "That did not save. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="ui-card" data-crew-link-fields>
      <p className="ui-card-title" style={{ margin: 0 }}>
        Crew Link
      </p>
      <p className="ui-card-text">What crews see when they order this.</p>
      <div className="ui-stack">
        <Field label="Name crews read" maxLength={120} value={crew.crewName} disabled={busy} onChange={(event) => setCrew({ ...crew, crewName: event.target.value })} />
        <Field label="Brand" optional maxLength={80} value={crew.brand} disabled={busy} onChange={(event) => setCrew({ ...crew, brand: event.target.value })} />
        <label className="ui-check">
          <input type="checkbox" checked={crew.inDefaultList} disabled={busy} onChange={(event) => setCrew({ ...crew, inDefaultList: event.target.checked })} />
          <span>On the default list (crews at accounts with nothing picked can order it)</span>
        </label>
        {error ? <p className="ui-field-error">{error}</p> : null}
        <div>
          <BigButton kind="second" busy={busy} busyLabel="Saving…" onClick={() => void save()}>
            Save Crew Link
          </BigButton>
        </div>
      </div>
    </div>
  );
}
