"use client";

// A list opened for ONE account: /visits?accountId=<id>&account=<name>, the
// same two words in the address on every list page. The tiles on the account
// page ("Everything for this account") open the lists this way.
//
//   useAccountScope()    reads the address and says which records belong to
//                        that account.
//   <AccountScopeBar>    "Back to <account name>" at the top of the list.
//
// Which records belong to the account (the same rule as AccountLink, and as
// the counts on the tiles in lib/pg/account-summary.ts):
//   1. a record whose saved ID is a real account's ID belongs to that account;
//   2. a record with no usable ID belongs to the account with that exact
//      name, but only when exactly one account has that name;
//   3. anything else belongs to nobody.
// Staff screens only.

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { keyOf, loadAccountIndex, type AccountIndex } from "./AccountLink";

export type AccountScope = {
  /** True when the list was opened for one account. */
  active: boolean;
  accountId: string;
  accountName: string;
  /** Does a record with this saved account ID and account name belong to the account? Always true when not active. */
  matches: (recordAccountId: unknown, recordAccountName: unknown) => boolean;
};

export function useAccountScope(): AccountScope {
  const [asked, setAsked] = useState({ id: "", name: "" });
  const [index, setIndex] = useState<AccountIndex | null>(null);

  useEffect(() => {
    let alive = true;
    let id = "";
    let name = "";
    try {
      const params = new URLSearchParams(window.location.search);
      id = (params.get("accountId") ?? "").trim();
      name = (params.get("account") ?? "").trim();
    } catch {
      // No address to read: the list shows everything.
    }
    if (!id) return;
    // After the first paint, like every other load on these pages.
    void Promise.resolve().then(() => alive && setAsked({ id, name }));
    void loadAccountIndex().then((loaded) => alive && setIndex(loaded));
    return () => {
      alive = false;
    };
  }, []);

  return useMemo(() => {
    const idKey = keyOf(asked.id);
    if (!idKey) return { active: false, accountId: "", accountName: "", matches: () => true };
    const accountName = index?.names.get(idKey) || asked.name;
    const nameKey = keyOf(accountName);
    const matches = (recordAccountId: unknown, recordAccountName: unknown) => {
      const recordId = keyOf(recordAccountId);
      const recordName = keyOf(recordAccountName);
      // Until the account list is here: the plain reading, tightened a moment later.
      if (!index) return recordId === idKey || (recordId === "" && recordName !== "" && recordName === nameKey);
      if (recordId && index.ids.has(recordId)) return recordId === idKey;
      const sameName = recordName ? (index.idsByName.get(recordName) ?? []) : [];
      return sameName.length === 1 && keyOf(sameName[0]) === idKey;
    };
    return { active: true, accountId: asked.id, accountName, matches };
  }, [asked, index]);
}

/** "Back to <account name>" over a list that shows one account only. Nothing when the list shows everything. */
export function AccountScopeBar({ scope, what }: { scope: AccountScope; what: string }) {
  if (!scope.active) return null;
  const name = scope.accountName || "the account";
  return (
    <div className="ui-scopebar" data-account-scope={scope.accountId}>
      <Link href={`/accounts/${encodeURIComponent(scope.accountId)}`} className="ui-btn ui-btn-second">
        ← Back to {name}
      </Link>
      <p className="ui-scopebar-text">
        Only {what} for <span className="ui-strong">{name}</span>.
      </p>
    </div>
  );
}
