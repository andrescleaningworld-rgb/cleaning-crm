"use client";

// Settings → Customer Portal Access → Test accounts: try the customer portal
// on a phone exactly as a customer sees it, without touching a real
// customer (lib/pg/portal-test-accounts.ts, /api/admin/portal-test-accounts).
// A test account never shows in staff lists, reports, maps or totals, and
// works while the portal is closed to customers.

import { useCallback, useEffect, useState } from "react";
import { BigButton, Card, ConfirmSheet, ErrorBox, Field, StatusPill, showToast } from "@/app/ui";

type TestAccount = { accountId: string; accountName: string; email: string; hasLogin: boolean; lastLoginAt: string | null };

const day = (iso: string) => new Date(iso).toLocaleDateString("en-US", { timeZone: "America/New_York", month: "short", day: "numeric" });

export default function PortalTestAccounts() {
  const [accounts, setAccounts] = useState<TestAccount[] | null>(null);
  const [error, setError] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState("");
  const [removing, setRemoving] = useState<TestAccount | null>(null);
  const [removeBusy, setRemoveBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = (await fetch("/api/admin/portal-test-accounts", { cache: "no-store" }).then((res) => res.json())) as { success?: boolean; accounts?: TestAccount[]; error?: string };
      if (!data.success) throw new Error(data.error);
      setAccounts(data.accounts ?? []);
      setError("");
    } catch {
      setError("The test accounts did not load. Refresh the page to try again.");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function create() {
    setFormError("");
    if (!email.trim()) return setFormError("Type your own email.");
    setBusy(true);
    try {
      const res = await fetch("/api/admin/portal-test-accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "create", name, email }),
      });
      const data = (await res.json().catch(() => ({}))) as { success?: boolean; error?: string; emailed?: boolean };
      if (!data.success) return setFormError(data.error || "That did not work. Try again.");
      showToast(data.emailed ? `Made. Check ${email.trim()} for "Set your password".` : "Made, but the email did not go out. Use First time here? on the portal login.", data.emailed ? undefined : "bad");
      setName("");
      setEmail("");
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!removing) return;
    setRemoveBusy(true);
    try {
      const res = await fetch("/api/admin/portal-test-accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "remove", accountId: removing.accountId }),
      });
      const data = (await res.json().catch(() => ({}))) as { success?: boolean; error?: string };
      if (!data.success) {
        showToast(data.error || "It was not removed.", "bad");
        return;
      }
      showToast(`Removed ${removing.accountName}`);
      setRemoving(null);
      await load();
    } finally {
      setRemoveBusy(false);
    }
  }

  return (
    <Card title="Test accounts">
      <div className="ui-stack">
        <p className="ui-muted" style={{ margin: 0 }}>
          Try the portal on your phone as a customer sees it. A test account never shows in lists, reports, maps or totals. Use your own email, not a customer&apos;s.
        </p>
        {error ? <ErrorBox title={error} /> : null}
        {accounts && accounts.length > 0 ? (
          <ul className="ui-list-plain" style={{ gap: 8 }}>
            {accounts.map((account) => (
              <li key={account.accountId} className="ui-actions-row" style={{ alignItems: "center", flexWrap: "wrap", gap: 8 }}>
                <span style={{ flex: 1, minWidth: 200 }}>
                  <strong>{account.accountName}</strong>
                  <span className="ui-muted"> · {account.email}</span>
                </span>
                <StatusPill kind={account.hasLogin ? "done" : "waiting"}>
                  {account.hasLogin ? (account.lastLoginAt ? `Last login ${day(account.lastLoginAt)}` : "Password set") : "Password not set yet"}
                </StatusPill>
                <BigButton kind="quiet" onClick={() => setRemoving(account)}>
                  Remove
                </BigButton>
              </li>
            ))}
          </ul>
        ) : accounts ? (
          <p className="ui-muted" style={{ margin: 0 }}>
            No test accounts yet.
          </p>
        ) : null}
        <Field label="Name" optional placeholder="Andres phone test" value={name} onChange={(event) => setName(event.target.value)} hint='Shown as "TEST - <name>".' />
        <Field label="Your email" type="email" inputMode="email" autoComplete="off" value={email} onChange={(event) => setEmail(event.target.value)} hint="The Set your password email goes here. It works for 7 days." />
        {formError ? <ErrorBox title={formError} /> : null}
        <div>
          <BigButton busy={busy} busyLabel="Making it…" onClick={() => void create()}>
            Make test account
          </BigButton>
        </div>
      </div>
      <ConfirmSheet
        open={removing !== null}
        title="Remove this test account?"
        text={`${removing?.accountName ?? ""} stops working in the portal. Settings → Deleted accounts can bring it back.`}
        confirmLabel="Remove test account"
        busy={removeBusy}
        busyLabel="Removing…"
        onConfirm={() => void remove()}
        onCancel={() => setRemoving(null)}
      />
    </Card>
  );
}
