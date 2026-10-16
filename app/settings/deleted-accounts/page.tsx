"use client";

// Settings → Deleted accounts: every account deleted from its page (name,
// who deleted it, when, why) and "Restore", which brings it back everywhere
// with everything it had (app/api/admin/deleted-accounts). Owner and
// managers only.

import { useCallback, useEffect, useState } from "react";
import { BigButton, Card, EmptyState, ErrorBox, Screen, SkeletonList, showToast } from "@/app/ui";
import { formatCrewDateTime } from "@/lib/crewDateTime";

type DeletedAccount = { accountId: string; accountName: string; address: string; deletedBy: string; deletedAt: string; reason: string };

export default function DeletedAccountsPage() {
  const [accounts, setAccounts] = useState<DeletedAccount[] | null>(null);
  const [ready, setReady] = useState(true);
  const [error, setError] = useState("");
  const [restoring, setRestoring] = useState("");

  const load = useCallback(async () => {
    setError("");
    try {
      const response = await fetch("/api/admin/deleted-accounts", { cache: "no-store" });
      const data = (await response.json().catch(() => ({}))) as { success?: boolean; ready?: boolean; accounts?: DeletedAccount[]; error?: string };
      if (!response.ok || !data.success) throw new Error(data.error || "Could not load the deleted accounts.");
      setReady(data.ready !== false);
      setAccounts(data.accounts ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load the deleted accounts.");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function restore(account: DeletedAccount) {
    setRestoring(account.accountId);
    try {
      const response = await fetch("/api/admin/deleted-accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId: account.accountId }),
      });
      const data = (await response.json().catch(() => ({}))) as { success?: boolean; error?: string };
      if (!response.ok || !data.success) throw new Error(data.error || "The account was not restored. Try again.");
      showToast(`${account.accountName} is back ✓`);
      setAccounts((list) => (list ?? []).filter((row) => row.accountId !== account.accountId));
    } catch (err) {
      showToast(err instanceof Error ? err.message : "The account was not restored. Try again.", "bad");
    } finally {
      setRestoring("");
    }
  }

  return (
    <Screen title="Deleted accounts" subtitle="Restore brings an account back everywhere, with everything it had." backHref="/settings">
      {error ? <ErrorBox title="Could not load" text={error} onRetry={() => void load()} /> : null}
      {!error && accounts === null ? <SkeletonList /> : null}
      {!ready ? <p className="ui-muted">Deleting accounts is not set up on this database yet.</p> : null}
      {ready && accounts && accounts.length === 0 ? <EmptyState title="No deleted accounts" text="An account deleted from its page shows up here." /> : null}
      {accounts && accounts.length > 0 ? (
        <div className="ui-stack">
          {accounts.map((account) => (
            <Card key={account.accountId} title={account.accountName || account.accountId}>
              <div className="ui-stack">
                {account.address ? <p className="ui-muted">{account.address}</p> : null}
                <p>
                  Deleted by <strong>{account.deletedBy || "someone"}</strong> on {formatCrewDateTime(account.deletedAt)}
                </p>
                <p>
                  <strong>Reason:</strong> {account.reason || "(none given)"}
                </p>
                <div>
                  <BigButton
                    kind="second"
                    busy={restoring === account.accountId}
                    busyLabel="Restoring…"
                    disabled={Boolean(restoring)}
                    onClick={() => void restore(account)}
                  >
                    Restore
                  </BigButton>
                </div>
              </div>
            </Card>
          ))}
        </div>
      ) : null}
    </Screen>
  );
}
