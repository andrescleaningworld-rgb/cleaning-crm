"use client";

// An account name that opens the account's page. Staff screens only: never
// use it in the subcontractor portal, customer portal, Crew Link, Team Hub,
// the Equipment Check tablet or the Pin Board TV.
//
// It links by account ID. The ID kept on a record (a visit, a complaint, a
// to-do...) is not always the account's own ID, so it is checked against the
// account list first. A record with no usable ID links only when its name is
// the name of exactly one account; with no match, or more than one, the name
// stays plain text.

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";

type AccountRow = { accountId?: string | number; id?: string | number; accountName?: string };
type AccountsResponse = { success?: boolean; accounts?: AccountRow[]; data?: AccountRow[] };
/** Every account: its ID (by the ID in small letters), its name, and which IDs carry each name. */
export type AccountIndex = { ids: Map<string, string>; names: Map<string, string>; idsByName: Map<string, string[]> };

const CACHE_TTL_MS = 60_000;
export const keyOf = (value: unknown) => String(value ?? "").trim().toLowerCase();

// One account list for every name on the screen, fetched only when a name
// that needs checking is shown.
let indexCache: { index: AccountIndex; expiresAt: number } | null = null;
let indexPromise: Promise<AccountIndex> | null = null;

/** Also used by account-scope.tsx, so a list shown for one account follows the same rule as the links. */
export function loadAccountIndex(): Promise<AccountIndex> {
  if (indexCache && Date.now() <= indexCache.expiresAt) return Promise.resolve(indexCache.index);
  if (indexPromise) return indexPromise;

  indexPromise = (async () => {
    const index: AccountIndex = { ids: new Map(), names: new Map(), idsByName: new Map() };
    try {
      const response = await fetch("/api/accounts");
      const data = (await response.json()) as AccountsResponse;
      if (!response.ok || data.success === false) return index;
      for (const account of data.accounts ?? data.data ?? []) {
        const id = String(account.accountId ?? account.id ?? "").trim();
        if (!id) continue;
        index.ids.set(keyOf(id), id);
        index.names.set(keyOf(id), String(account.accountName ?? "").trim());
        const name = keyOf(account.accountName);
        if (!name) continue;
        const ids = index.idsByName.get(name) ?? [];
        if (!ids.includes(id)) ids.push(id);
        index.idsByName.set(name, ids);
      }
      indexCache = { index, expiresAt: Date.now() + CACHE_TTL_MS };
      return index;
    } catch {
      return index;
    } finally {
      indexPromise = null;
    }
  })();

  return indexPromise;
}

/** The account this ID or name belongs to. Empty when there is none, or the name fits several. */
function useCheckedAccountId(accountId: string, name: string, skip: boolean): string {
  const idKey = keyOf(accountId);
  const nameKey = keyOf(name);
  const key = `${idKey}|${nameKey}`;
  const [found, setFound] = useState({ key: "", id: "" });
  useEffect(() => {
    if (skip || (!idKey && !nameKey)) return;
    let cancelled = false;
    void loadAccountIndex().then((index) => {
      if (cancelled) return;
      const sameName = index.idsByName.get(nameKey) ?? [];
      setFound({ key, id: index.ids.get(idKey) ?? (sameName.length === 1 ? sameName[0] : "") });
    });
    return () => {
      cancelled = true;
    };
  }, [idKey, nameKey, key, skip]);
  return found.key === key ? found.id : "";
}

export default function AccountLink({
  accountId,
  name,
  known = false,
  className = "ui-account-link",
  nested = false,
  children,
}: {
  accountId?: string | number | null;
  /** The account name. Shown as the text unless children are given. */
  name?: string | null;
  /** Set when the ID comes from the account itself, not from a record about it: no check is needed. */
  known?: boolean;
  className?: string;
  /** Set when the name sits inside another link or a button: only the name opens the account. */
  nested?: boolean;
  children?: ReactNode;
}) {
  const router = useRouter();
  const givenId = String(accountId ?? "").trim();
  const trusted = known && Boolean(givenId);
  const checkedId = useCheckedAccountId(givenId, name ?? "", trusted);
  const id = trusted ? givenId : checkedId;
  const text = children ?? name;

  if (!id) return <>{text}</>;
  const href = `/accounts/${encodeURIComponent(id)}`;

  if (nested) {
    const open = (event: { preventDefault: () => void; stopPropagation: () => void }) => {
      event.preventDefault();
      event.stopPropagation();
      router.push(href);
    };
    return (
      <span
        role="link"
        tabIndex={0}
        className={className}
        onClick={open}
        onKeyDown={(event) => {
          if (event.key === "Enter") open(event);
        }}
      >
        {text}
      </span>
    );
  }

  return (
    <Link href={href} className={className} onClick={(event) => event.stopPropagation()}>
      {text}
    </Link>
  );
}
