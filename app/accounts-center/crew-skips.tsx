"use client";

// Accounts Center -> Crew Link, at the top: what the crews could not do
// ("Rose Brand: couldn't do Cardboard (No time) · 2 nights"), red when the
// same item was skipped 3 nights in a row. The same papers as the Pin Board
// (lib/pg/crew-skips.ts); "Handled" takes it down there too.

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { BigButton, Card, friendlyDate, showToast } from "@/app/ui";

type Skip = { accountId: string; accountName: string; title: string; nights: number; red: boolean; since: string };

export default function CrewSkips() {
  const [skips, setSkips] = useState<Skip[]>([]);
  const [busy, setBusy] = useState("");

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/crew-skips", { cache: "no-store" });
      const data = (await response.json().catch(() => ({}))) as { success?: boolean; skips?: Skip[] };
      if (data.success) setSkips(data.skips ?? []);
    } catch {
      // The list is extra: the problems below still show.
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function handled(skip: Skip) {
    setBusy(skip.accountId);
    try {
      const response = await fetch("/api/crew-skips", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "handled", accountId: skip.accountId }) });
      const data = (await response.json().catch(() => ({}))) as { success?: boolean; error?: string };
      if (!data.success) throw new Error(data.error || "That did not save. Try again.");
      showToast("Handled ✓");
      await load();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "That did not save. Try again.", "bad");
    } finally {
      setBusy("");
    }
  }

  if (skips.length === 0) return null;
  return (
    <section className="ui-stack" aria-label="Couldn't do">
      <h2 className="ui-card-title">Couldn&apos;t do ({skips.length})</h2>
      {skips.map((skip) => (
        <Card key={skip.accountId}>
          <div className="ui-stack" style={skip.red ? { borderLeft: "6px solid #dc2626", paddingLeft: 12 } : undefined}>
            <p className="ui-strong" style={skip.red ? { color: "#b91c1c" } : undefined}>
              {skip.red ? "🔴 " : ""}
              {skip.title}
            </p>
            <p className="ui-muted">
              {skip.red ? "Same item skipped 3 nights in a row. " : ""}Since {friendlyDate(skip.since)} ·{" "}
              <Link className="ui-link" href={`/accounts/${encodeURIComponent(skip.accountId)}`}>
                Open {skip.accountName || "the account"}
              </Link>
            </p>
            <BigButton kind="second" busy={busy === skip.accountId} busyLabel="Saving…" onClick={() => void handled(skip)}>
              Handled
            </BigButton>
          </div>
        </Card>
      ))}
    </section>
  );
}
