// Server-only: syncs onboarding checklist items that map to a real Accounts
// field onto that field, silently (no account-updates history entry — see
// buildOnboardingNotesSummary's comment for why per-save history logging was
// removed). Kept out of lib/onboardingChecklist.ts because that file is
// imported by the client checklist component and must stay free of
// server-only imports (fetch to another route, the accounts cache).
import { fetchAccountsForAction } from "@/app/api/accounts/route";
import { getFreshAndCache } from "@/lib/serverCache";
import {
  ONBOARDING_COMBINED_FIELD,
  ONBOARDING_FIELD_WRITES,
  composeOnboardingFieldValue,
  type OnboardingChecklistItems,
} from "./onboardingChecklist";

type FieldSyncResult = {
  // Non-null only when a write happened AND it overwrote a different,
  // non-empty prior value — the caller re-saves the checklist item with
  // this attached so it surfaces in the eventual completion summary.
  overwriteNote: string | null;
};

function getAccountFieldValue(account: Record<string, unknown>, fieldNames: string[]): string {
  for (const name of fieldNames) {
    const value = account[name];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

async function findAccountById(accountId: string): Promise<Record<string, unknown> | null> {
  // Deliberately bypasses the TTL cache (getFreshAndCache, not getOrFetch)
  // — confirmed live that this app's serverCache module can have its
  // module-level cache Map split across more than one instance within the
  // same dev server process (serverCache.ts's own INSTANCE_ID
  // instrumentation exists for exactly this reason), so a write's
  // invalidateCached() call on one instance doesn't guarantee a get on
  // another sees it. Since this read decides whether an overwrite actually
  // happened, staleness here isn't just cosmetic — a stale "before" value
  // that happens to already equal the new value would suppress a real
  // overwrite notice entirely, confirmed live during this feature's smoke
  // test (see also app/api/accounts/route.ts's own updateAccountFields,
  // which bypasses the cache the same way for the same correctness reason).
  const accounts = (await getFreshAndCache("accounts:getAllAccounts", () =>
    fetchAccountsForAction("getAllAccounts")
  )) as Record<string, unknown>[];

  return (
    accounts.find(
      (a) => String(a.accountId ?? a.id ?? "") === accountId || String(a.rowNumber ?? "") === accountId
    ) ?? null
  );
}

// Reuses the exact same client-facing mechanism the "Change Status" button
// and the account edit page use — POSTs to this app's own /api/accounts
// route with action: "updateAccountFields" — rather than forking a second
// path to the Apps Script. requestOrigin comes from the caller's own
// NextRequest so this works in every environment without a hardcoded host.
//
// cookieHeader MUST be forwarded from the original incoming request: a
// server-to-server fetch() from inside a Route Handler does NOT carry the
// browser's session cookie automatically, and /api/accounts sits behind
// proxy.ts's admin-session check like every other non-public route.
// Confirmed live during this feature's smoke test — without this, the call
// silently 200'd into a redirect to /login instead of writing anything,
// and the missing await-on-.ok below meant that failure went unnoticed.
async function writeAccountFields(
  accountId: string,
  fields: Record<string, string>,
  requestOrigin: string,
  cookieHeader: string
): Promise<void> {
  const response = await fetch(`${requestOrigin}/api/accounts`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(cookieHeader ? { Cookie: cookieHeader } : {}),
    },
    body: JSON.stringify({ action: "updateAccountFields", accountId, fields }),
    redirect: "manual",
  });

  // redirect: "manual" turns proxy.ts's auth redirect into an opaque
  // (status 0) response instead of silently following it to the login
  // page's own 200 — treat anything that isn't a normal successful JSON
  // response as a failure so it surfaces in the route's catch block/log
  // instead of failing silently.
  if (response.type === "opaqueredirect" || !response.ok) {
    throw new Error(`updateAccountFields call failed (status ${response.status || "redirected"}).`);
  }

  const data = (await response.json()) as { success?: boolean; error?: string };
  if (data.success === false) {
    throw new Error(data.error || "updateAccountFields reported failure.");
  }
}

// Called once per setItem save. No-ops (returns { overwriteNote: null })
// for the 20 of 24 items with no field mapping, and for a mapped item whose
// composed value is currently empty (never blanks a real field just because
// a note was cleared/never filled in).
export async function syncOnboardingFieldWrite(input: {
  accountId: string;
  itemKey: string;
  items: OnboardingChecklistItems;
  requestOrigin: string;
  cookieHeader: string;
}): Promise<FieldSyncResult> {
  const direct = ONBOARDING_FIELD_WRITES[input.itemKey];
  const isCombinedMember = ONBOARDING_COMBINED_FIELD.items.some((entry) => entry.key === input.itemKey);

  if (!direct && !isCombinedMember) return { overwriteNote: null };

  const fieldNames = direct ? direct.fieldNames : ONBOARDING_COMBINED_FIELD.fieldNames;
  const fieldLabel = direct ? direct.fieldLabel : ONBOARDING_COMBINED_FIELD.fieldLabel;
  const newValue = direct
    ? (input.items[input.itemKey]?.note ?? "").trim()
    : composeOnboardingFieldValue(input.items);

  if (!newValue) return { overwriteNote: null };

  const account = await findAccountById(input.accountId);
  const currentValue = account ? getAccountFieldValue(account, fieldNames) : "";

  if (currentValue === newValue) return { overwriteNote: null };

  const fields: Record<string, string> = {};
  for (const name of fieldNames) fields[name] = newValue;

  await writeAccountFields(input.accountId, fields, input.requestOrigin, input.cookieHeader);

  if (currentValue) {
    return { overwriteNote: `${fieldLabel} changed from "${currentValue}" to "${newValue}".` };
  }
  return { overwriteNote: null };
}
