"use client";

// "Find emails in Markate" on Accounts Center → Missing emails. Reads every
// Markate customer (read only, GET /api/admin/account-emails/markate) and
// lists the accounts it found an email for, with why it matched. The sure
// ones (the name matches, one email) start ticked; the rest are for a look
// first. "Save" saves the ticked ones one by one with the usual Missing emails
// save; the ones that do not match are typed in by hand below, as before.

import { useState } from "react";
import { BigButton, Card, ErrorBox, StatusPill, showToast } from "@/app/ui";
import AccountLink from "@/app/components/AccountLink";

type Match = {
  accountId: string;
  accountName: string;
  accountAddress: string;
  email: string;
  markateName: string;
  markateAddress: string;
  why: "name and address" | "name" | "address";
  sure: boolean;
  note: string;
};

type Lookup = { markateCustomers: number; missingAccounts: number; matches: Match[]; notFound: number };

export default function MarkateEmails({ onSaved }: { onSaved: (accountId: string) => void }) {
  const [lookup, setLookup] = useState<Lookup | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [ticked, setTicked] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState<Record<string, string>>({});

  async function find() {
    setBusy(true);
    setError("");
    setLookup(null);
    try {
      const response = await fetch("/api/admin/account-emails/markate", { cache: "no-store" });
      const data = (await response.json().catch(() => ({}))) as { success?: boolean; error?: string } & Lookup;
      if (!response.ok || !data.success) throw new Error(data.error || "Markate did not answer.");
      setLookup(data);
      setTicked(new Set(data.matches.filter((m) => m.sure).map((m) => m.accountId)));
      setFailed({});
    } catch (err) {
      setError(err instanceof Error ? err.message : "Markate did not answer.");
    } finally {
      setBusy(false);
    }
  }

  function toggle(id: string) {
    setTicked((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function saveTicked() {
    if (!lookup) return;
    setSaving(true);
    let saved = 0;
    const errors: Record<string, string> = {};
    for (const match of lookup.matches.filter((m) => ticked.has(m.accountId))) {
      try {
        const response = await fetch("/api/admin/account-emails", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ accountId: match.accountId, email: match.email }),
        });
        const data = (await response.json().catch(() => ({}))) as { success?: boolean; error?: string };
        if (!response.ok || !data.success) throw new Error(data.error || "Not saved.");
        saved += 1;
        onSaved(match.accountId);
      } catch (err) {
        errors[match.accountId] = err instanceof Error ? err.message : "Not saved.";
      }
    }
    // The saved ones leave the list; the ones that failed stay, with why.
    setLookup((current) => (current ? { ...current, matches: current.matches.filter((m) => !ticked.has(m.accountId) || errors[m.accountId]) } : current));
    setTicked(new Set(Object.keys(errors)));
    setFailed(errors);
    setSaving(false);
    const failedCount = Object.keys(errors).length;
    showToast(failedCount ? `Saved ${saved}. ${failedCount} did not save.` : `Saved ${saved} email${saved === 1 ? "" : "s"} ✓`, failedCount ? "bad" : undefined);
  }

  const matches = lookup?.matches ?? [];
  const sureCount = matches.filter((m) => m.sure).length;

  return (
    <Card title="Find emails in Markate">
      <div className="ui-stack">
        <p className="ui-card-text">
          Looks up every account below in Markate by its name and address. Nothing is saved until you tick and press Save. Nothing changes in Markate.
        </p>
        {!lookup ? (
          <div>
            <BigButton kind="second" busy={busy} busyLabel="Reading Markate… (up to a few minutes)" onClick={() => void find()}>
              Find emails in Markate
            </BigButton>
          </div>
        ) : null}
        {error ? <ErrorBox title="Markate lookup did not work" text={error} /> : null}

        {lookup ? (
          <>
            <p className="ui-strong" role="status">
              Found {matches.length} of {lookup.missingAccounts} · {sureCount} sure · {lookup.notFound} not in Markate (type those by hand below)
            </p>
            <p className="ui-muted">Read {lookup.markateCustomers} Markate customers.</p>
            {matches.length > 0 ? (
              <>
                <div className="ui-actions-row">
                  <BigButton busy={saving} busyLabel="Saving…" disabled={ticked.size === 0} onClick={() => void saveTicked()}>
                    {`Save ${ticked.size} email${ticked.size === 1 ? "" : "s"}`}
                  </BigButton>
                  <BigButton kind="quiet" disabled={saving} onClick={() => setTicked(new Set(matches.map((m) => m.accountId)))}>
                    Tick all
                  </BigButton>
                  <BigButton kind="quiet" disabled={saving} onClick={() => setTicked(new Set())}>
                    Untick all
                  </BigButton>
                </div>
                <ul className="ui-stack" style={{ listStyle: "none", margin: 0, padding: 0 }}>
                  {matches.map((m) => (
                    <li key={m.accountId} style={{ borderTop: "1px solid #dbeafe", paddingTop: 10 }}>
                      <label style={{ display: "flex", gap: 12, alignItems: "flex-start", cursor: "pointer" }}>
                        <input type="checkbox" className="h-7 w-7 shrink-0" checked={ticked.has(m.accountId)} disabled={saving} onChange={() => toggle(m.accountId)} />
                        <span className="ui-stack" style={{ gap: 2 }}>
                          <span>
                            <AccountLink known accountId={m.accountId} name={m.accountName} />{" "}
                            <StatusPill kind={m.sure ? "done" : "waiting"}>{m.sure ? `Sure · ${m.why}` : `Check · ${m.why}`}</StatusPill>
                          </span>
                          <span className="ui-strong">{m.email}</span>
                          <span className="ui-muted">CRM: {m.accountAddress || "no address"}</span>
                          <span className="ui-muted">
                            Markate: {m.markateName || "no name"}
                            {m.markateAddress ? ` · ${m.markateAddress}` : ""}
                          </span>
                          {m.note ? <span className="ui-muted">⚠ {m.note}</span> : null}
                          {failed[m.accountId] ? <span className="ui-field-error">{failed[m.accountId]}</span> : null}
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <p className="ui-muted">Markate has no email for these accounts.</p>
            )}
            <div>
              <BigButton kind="quiet" busy={busy} busyLabel="Reading Markate…" disabled={saving} onClick={() => void find()}>
                Look again
              </BigButton>
            </div>
          </>
        ) : null}
      </div>
    </Card>
  );
}
