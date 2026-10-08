"use client";

import { useCallback, useEffect, useState } from "react";
import { BigButton, Card, EmptyState, ErrorBox, Field, Screen, SearchBar, SkeletonList, StatusPill, showToast } from "@/app/ui";

type MissingAccount = {
  accountId: string;
  accountName: string;
  status: string;
  contactName: string;
  phone: string;
  manager: string;
  portalAccess: boolean;
};

type Answer = { available: boolean; missing: MissingAccount[]; counts: { missing: number; total: number } };

/**
 * Accounts with no customer email, so managers can fill them in fast: type
 * the email on the card and save. Customers log in to the portal with this
 * email, so an account without one cannot log in.
 */
export default function MissingEmails() {
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({});
  const [savingId, setSavingId] = useState("");
  const [savedCount, setSavedCount] = useState(0);

  const load = useCallback(async () => {
    setError("");
    try {
      const res = await fetch("/api/admin/account-emails", { cache: "no-store" });
      const data = (await res.json()) as Answer & { error?: string };
      if (!res.ok) throw new Error(data.error || "Failed to load the list.");
      setAnswer(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load the list.");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function save(account: MissingAccount) {
    const email = (drafts[account.accountId] ?? "").trim();
    if (!email) {
      setRowErrors((current) => ({ ...current, [account.accountId]: "Type the customer's email." }));
      return;
    }
    setSavingId(account.accountId);
    setRowErrors((current) => ({ ...current, [account.accountId]: "" }));
    try {
      const res = await fetch("/api/admin/account-emails", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId: account.accountId, email }),
      });
      const data = (await res.json().catch(() => ({}))) as { success?: boolean; error?: string };
      if (!res.ok || !data.success) throw new Error(data.error || "Failed to save the email.");
      // The account now has an email, so it leaves this list.
      setAnswer((current) =>
        current
          ? { ...current, missing: current.missing.filter((m) => m.accountId !== account.accountId), counts: { ...current.counts, missing: current.counts.missing - 1 } }
          : current
      );
      setSavedCount((n) => n + 1);
      showToast(`Email saved for ${account.accountName}.`);
    } catch (err) {
      setRowErrors((current) => ({ ...current, [account.accountId]: err instanceof Error ? err.message : "Failed to save the email." }));
    } finally {
      setSavingId("");
    }
  }

  const q = search.trim().toLowerCase();
  const shown = (answer?.missing ?? []).filter((m) => !q || [m.accountName, m.contactName, m.manager, m.phone].join(" ").toLowerCase().includes(q));

  return (
    <Screen title="Missing emails" subtitle="Customers log in to the portal with the email on their account. These accounts have none yet.">
      {error ? <ErrorBox title={error} onRetry={() => void load()} /> : null}

      {!answer && !error ? <SkeletonList rows={4} /> : null}

      {answer && !answer.available ? (
        <EmptyState
          icon="clock"
          title="This list works once accounts are on the new database."
          text="Until then, type a customer's email on the account's Edit page (Accounts → open the account → Edit)."
        />
      ) : null}

      {answer?.available ? (
        <>
          <div className="ui-stats">
            <div className="ui-stat">
              <p className="ui-stat-label">Without an email</p>
              <p className="ui-stat-value">{answer.counts.missing}</p>
            </div>
            <div className="ui-stat">
              <p className="ui-stat-label">Active accounts</p>
              <p className="ui-stat-value">{answer.counts.total}</p>
            </div>
            <div className="ui-stat">
              <p className="ui-stat-label">Saved just now</p>
              <p className="ui-stat-value">{savedCount}</p>
            </div>
          </div>

          <SearchBar value={search} onChange={setSearch} label="Search accounts without an email" placeholder="Search by account, contact or manager" />
          <p className="ui-muted">
            {shown.length} of {answer.counts.missing}
          </p>

          {answer.counts.missing === 0 ? (
            <EmptyState icon="check" title="Every active account has an email." />
          ) : shown.length === 0 ? (
            <EmptyState icon="search" title="No account matches your search." />
          ) : (
            <ul className="ui-cardlist" aria-label="Accounts without an email">
              {shown.slice(0, 60).map((account) => (
                <li key={account.accountId}>
                  <Card title={account.accountName} right={<StatusPill kind={account.portalAccess ? "waiting" : "off"}>{account.portalAccess ? "Portal access on" : "No portal access"}</StatusPill>}>
                    <p className="ui-muted">
                      {[account.contactName, account.phone, account.manager ? `Manager: ${account.manager}` : ""].filter(Boolean).join(" · ") || "No contact on file"}
                    </p>
                    <form
                      className="ui-stack"
                      noValidate
                      onSubmit={(e) => {
                        e.preventDefault();
                        void save(account);
                      }}
                    >
                      <Field
                        label="Customer email"
                        type="email"
                        inputMode="email"
                        autoComplete="off"
                        autoCapitalize="none"
                        spellCheck={false}
                        value={drafts[account.accountId] ?? ""}
                        onChange={(e) => setDrafts((current) => ({ ...current, [account.accountId]: e.target.value }))}
                        placeholder="name@example.com"
                        error={rowErrors[account.accountId] || undefined}
                      />
                      <div className="ui-actions-row">
                        <BigButton type="submit" kind="second" busy={savingId === account.accountId} busyLabel="Saving…">
                          Save email
                        </BigButton>
                        <BigButton kind="quiet" href={`/accounts/${encodeURIComponent(account.accountId)}`}>
                          Open account
                        </BigButton>
                      </div>
                    </form>
                  </Card>
                </li>
              ))}
            </ul>
          )}
          {shown.length > 60 ? <p className="ui-muted">Showing the first 60. Search to find a specific account, or keep saving: the list refills as it shrinks.</p> : null}
        </>
      ) : null}
    </Screen>
  );
}
