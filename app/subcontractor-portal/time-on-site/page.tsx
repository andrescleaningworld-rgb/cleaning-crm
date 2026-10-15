"use client";

// Sub portal → "How long each cleaning takes": the sub's active accounts,
// each with big − / + and Save. The answer becomes the account's time on
// site; when the office already set one far from it (over 30 minutes
// apart), it goes to the office to check instead.

import { useEffect, useState } from "react";
import { BigButton, showToast } from "@/app/ui";
import PlusMinus from "@/app/components/plus-minus";
import { formatMinutes, MAX_MINUTES_ON_SITE, MIN_MINUTES_ON_SITE, MINUTES_ON_SITE_STEP, type TimeOnSiteSource } from "@/lib/time-on-site";

type Item = { accountId: string; accountName: string; minutes: number; source: TimeOnSiteSource; waiting: boolean };

export default function SubTimeOnSitePage() {
  const [items, setItems] = useState<Item[] | null>(null);
  const [drafts, setDrafts] = useState<Record<string, number>>({});
  const [saved, setSaved] = useState<Record<string, boolean>>({});
  const [savingId, setSavingId] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    fetch("/api/subcontractor-portal/time-on-site", { cache: "no-store" })
      .then((response) => response.json())
      .then((data: { success?: boolean; accounts?: Item[]; error?: string }) => {
        if (!alive) return;
        if (!data.success) setError(data.error || "Your accounts did not load.");
        else setItems(data.accounts ?? []);
      })
      .catch(() => alive && setError("Your accounts did not load."));
    return () => {
      alive = false;
    };
  }, []);

  async function save(item: Item) {
    const minutes = drafts[item.accountId] ?? item.minutes;
    setSavingId(item.accountId);
    try {
      const response = await fetch("/api/subcontractor-portal/time-on-site", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId: item.accountId, minutes }),
      });
      const data = (await response.json()) as { success?: boolean; minutes?: number; waiting?: boolean; error?: string };
      if (!data.success) throw new Error(data.error || "Not saved.");
      setItems((list) => (list ?? []).map((row) => (row.accountId === item.accountId ? { ...row, minutes: data.minutes ?? minutes, source: "sub", waiting: data.waiting === true } : row)));
      setSaved((done) => ({ ...done, [item.accountId]: true }));
      showToast(data.waiting ? "Sent to the office to check ✓" : "Saved ✓");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Not saved.", "bad");
    } finally {
      setSavingId("");
    }
  }

  return (
    <main className="ui-screen">
      <div className="ui-screen-body">
        <h1 className="ui-screen-title">How long each cleaning takes</h1>
        <p className="ui-muted">About how long your crew is at each place. Tap − or +, then Save.</p>

        {error ? <p className="ui-field-error">{error}</p> : null}
        {!items && !error ? <p className="ui-muted">Loading…</p> : null}
        {items && items.length === 0 ? <div className="ui-card">No accounts yet.</div> : null}

        <div className="grid gap-4" style={{ marginTop: 12 }}>
          {(items ?? []).map((item) => {
            const value = drafts[item.accountId] ?? item.minutes;
            return (
              <div key={item.accountId} className="ui-card">
                <p className="ui-strong" style={{ fontSize: 18 }}>
                  {item.accountName}
                </p>
                <p className="ui-muted">{item.source === "est" ? "Our guess. Is it right?" : item.waiting ? "The office will check your answer." : "Confirmed."}</p>
                <div className="my-3 flex justify-center">
                  <PlusMinus
                    value={value}
                    onChange={(next) => {
                      setDrafts((all) => ({ ...all, [item.accountId]: next }));
                      setSaved((done) => ({ ...done, [item.accountId]: false }));
                    }}
                    step={MINUTES_ON_SITE_STEP}
                    min={MIN_MINUTES_ON_SITE}
                    max={MAX_MINUTES_ON_SITE}
                    label={`Time at ${item.accountName}`}
                    format={formatMinutes}
                    disabled={savingId === item.accountId}
                  />
                </div>
                <BigButton busy={savingId === item.accountId} busyLabel="Saving…" disabled={savingId !== "" && savingId !== item.accountId} onClick={() => save(item)}>
                  {saved[item.accountId] ? "✓ Saved" : "Save"}
                </BigButton>
              </div>
            );
          })}
        </div>
      </div>
    </main>
  );
}
