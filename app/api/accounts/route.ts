import { NextRequest, NextResponse } from "next/server";
import { getOrFetch, getFreshAndCache, invalidateCached } from "@/lib/serverCache";
import { fetchAppsScript, AppsScriptFetchError } from "@/lib/appsScriptFetch";
import { findSubcontractorPhoneByName, getAccountAssignedSub } from "@/app/api/subcontractors/route";
import { sanitizeSmsText, sendSms } from "@/lib/sms";

const SCRIPT_URL = process.env.GOOGLE_SCRIPT_URL;

// Apps Script latency has been measured spiking to ~14s on a single call;
// this must comfortably exceed the per-attempt timeout in fetchAppsScript
// (18s) plus its one retry plus backoff, or Vercel would kill the function
// before our own retry/error-handling logic gets a chance to run.
export const maxDuration = 45;

const ALLOWED_GET_ACTIONS = new Set([
  "getAccounts",
  "accounts",
  "getAllAccounts",
  "allAccounts",
  "getMapAccounts",
  "mapAccounts",
]);

// Exported so app/api/accounts/[id]/pdf/route.ts can reuse the exact same
// fetch/cache/error-handling path (and the same getOrFetch cache key) rather
// than maintaining a second, possibly-drifting copy of "how to read accounts
// from the shared Apps Script backend."
export class AccountsFetchError extends Error {
  status: number;
  details: Record<string, unknown>;
  constructor(message: string, status: number, details: Record<string, unknown> = {}) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

// Fetches the raw (unfiltered) account list for a given action from the
// shared Apps Script backend. Wrapped in getOrFetch below so every distinct
// action is only fetched from Apps Script once per 60s, no matter how many
// different "q" searches hit this route in that window.
export async function fetchAccountsForAction(action: string): Promise<unknown[]> {
  let response: Response;
  try {
    response = await fetchAppsScript(`${SCRIPT_URL}?action=${encodeURIComponent(action)}`, {
      method: "GET",
      cache: "no-store",
    });
  } catch (err) {
    if (err instanceof AppsScriptFetchError) {
      throw new AccountsFetchError(err.message, err.status, { requestedAction: action });
    }
    throw new AccountsFetchError(
      err instanceof Error ? err.message : "Unknown error loading accounts.",
      500,
      { requestedAction: action }
    );
  }

  const text = await response.text();

  let data: { success?: boolean; error?: string; message?: string; accounts?: unknown[]; data?: unknown[] };
  try {
    data = JSON.parse(text);
  } catch {
    throw new AccountsFetchError(
      "Google Script did not return valid JSON while loading accounts.",
      500,
      { rawResponse: text, requestedAction: action }
    );
  }

  if (!response.ok || data.success === false) {
    throw new AccountsFetchError(
      data.error || data.message || "Failed to load accounts from Google Script.",
      500,
      { googleScriptResponse: data, googleScriptStatus: response.status, requestedAction: action }
    );
  }

  return (data.accounts ?? data.data ?? []) as unknown[];
}

export async function GET(request: NextRequest) {
  try {
    if (!SCRIPT_URL) {
      return NextResponse.json(
        { success: false, error: "Missing GOOGLE_SCRIPT_URL in .env.local" },
        { status: 500 }
      );
    }

    const { searchParams } = new URL(request.url);
    const requestedAction = searchParams.get("action") || "getAllAccounts";
    const action = ALLOWED_GET_ACTIONS.has(requestedAction)
      ? requestedAction
      : "getAllAccounts";
    const q = searchParams.get("q")?.toLowerCase().trim() ?? "";

    let accounts: unknown[];
    try {
      accounts = await getOrFetch(`accounts:${action}`, () => fetchAccountsForAction(action));
    } catch (err) {
      if (err instanceof AccountsFetchError) {
        return NextResponse.json(
          { success: false, error: err.message, ...err.details },
          { status: err.status }
        );
      }
      return NextResponse.json(
        { success: false, error: err instanceof Error ? err.message : "Unknown error loading accounts." },
        { status: 500 }
      );
    }

    if (q) {
      accounts = accounts.filter((account) => {
        return Object.values(account as Record<string, unknown>).some((value) =>
          String(value ?? "").toLowerCase().includes(q)
        );
      });
    }

    return NextResponse.json(
      {
        success: true,
        action,
        accounts,
      },
      {
        headers: {
          "Cache-Control": "public, max-age=60, stale-while-revalidate=120",
        },
      }
    );
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Unknown error loading accounts." },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    if (!SCRIPT_URL) {
      return NextResponse.json(
        { success: false, error: "Missing GOOGLE_SCRIPT_URL in .env.local" },
        { status: 500 }
      );
    }

    const body = await request.json();
    let action = String(body.action || "").trim();

    // Partial field update: merge the caller's changed fields onto a fresh
    // account record fetched right now, instead of trusting whatever full
    // record the caller's page loaded (possibly minutes or hours ago).
    // Without this, a stale tab submitting a full-record overwrite silently
    // reverts any other field someone else changed more recently — the
    // "lost update" bug where edits appear to save but don't persist.
    if (action === "updateAccountFields") {
      const accountId = String(body.accountId ?? "").trim();
      const fields =
        body.fields && typeof body.fields === "object" ? body.fields : {};

      if (!accountId) {
        return NextResponse.json(
          { success: false, error: "accountId is required." },
          { status: 400 }
        );
      }

      let freshAccounts: Record<string, unknown>[];
      try {
        freshAccounts = (await getFreshAndCache("accounts:getAllAccounts", () =>
          fetchAccountsForAction("getAllAccounts")
        )) as Record<string, unknown>[];
      } catch (err) {
        return NextResponse.json(
          {
            success: false,
            error:
              err instanceof Error
                ? err.message
                : "Failed to load current account data.",
          },
          { status: 500 }
        );
      }

      const freshAccount = freshAccounts.find(
        (a) => a.id === accountId || a.accountId === accountId
      );

      if (!freshAccount) {
        return NextResponse.json(
          { success: false, error: "Account not found." },
          { status: 404 }
        );
      }

      body.account = { ...freshAccount, ...fields };
      action = "updateAccount";
    }

    // === NEW: Handle Send New Account Packet ===
    if (action === "sendNewAccountPacket") {
      const response = await fetch(SCRIPT_URL, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify(body),
      });

      const text = await response.text();

      let data;
      try {
        data = JSON.parse(text);
      } catch {
        return NextResponse.json(
          { success: false, error: "Invalid response from Google Script for packet" },
          { status: 500 }
        );
      }

      return NextResponse.json(data);
    }

    // Handle other account actions (add / update)
    const accountPayload = body.account || body;

    // Sending a packet must NEVER create a new row in the sheet.
    // Call the Apps Script via GET so doGet() runs (not doPost which writes rows).
    if (body.action === "sendNewAccountPacket") {
      const params = new URLSearchParams({
        action: "sendNewAccountPacket",
        accountId:              String(body.accountId              ?? ""),
        accountName:            String(body.accountName            ?? ""),
        address:                String(body.address                ?? ""),
        startDate:              String(body.startDate              ?? ""),
        cleaningSchedule:       String(body.cleaningSchedule       ?? ""),
        subcontractor:          String(body.subcontractor          ?? ""),
        subcontractorEmail:     String(body.subcontractorEmail     ?? ""),
        monthlySubcontractorPay:String(body.monthlySubcontractorPay?? ""),
        hasKey:                 String(body.hasKey                 ?? ""),
        alarmInfo:              String(body.alarmInfo              ?? ""),
        scope:                  String(body.scope                  ?? ""),
        notes:                  String(body.notes                  ?? ""),
        manager:                String(body.manager                ?? ""),
      });

      const response = await fetch(`${SCRIPT_URL}?${params.toString()}`, {
        method: "GET",
        cache: "no-store",
      });

      const text = await response.text();
      let data: Record<string, unknown> = { success: true };
      try { data = JSON.parse(text); } catch { /* Apps Script may return plain text */ }

      if (data.success === false) {
        return NextResponse.json(
          { success: false, error: String(data.error ?? "Apps Script returned failure.") },
          { status: 500 }
        );
      }

      return NextResponse.json({
        success: true,
        message: String(data.message ?? "New account packet sent successfully."),
      });
    }

    // All other actions (addAccount, updateAccount, etc.) go through doPost as before.
    const resolvedAction =
      action === "updateAccount" || action === "editAccount" ? "updateAccount" : "addAccount";

    // Captured before the write below so the SMS step (after a successful
    // save, near the bottom of this function) can tell "sub freshly
    // assigned/changed" apart from "account saved, sub field untouched" —
    // without this, every unrelated edit to an already-assigned account
    // would re-text the subcontractor. Read straight off the write payload's
    // own "subcontractor" field (what app/accounts/[id]/edit/page.tsx
    // actually submits), not the broader alias list getAccountAssignedSub
    // uses for Apps-Script-shaped read rows, to avoid matching an unrelated
    // field on this payload.
    const newSubcontractorName = String(
      (accountPayload as Record<string, unknown>).subcontractor ??
        (accountPayload as Record<string, unknown>).Subcontractor ??
        ""
    ).trim();
    const accountIdForSmsCheck = String(
      (accountPayload as Record<string, unknown>).accountId ??
        (accountPayload as Record<string, unknown>).id ??
        (accountPayload as Record<string, unknown>)["Account ID"] ??
        ""
    ).trim();

    let previousSubcontractorName = "";
    if (newSubcontractorName && resolvedAction === "updateAccount" && accountIdForSmsCheck) {
      try {
        const priorAccounts = (await getOrFetch("accounts:getAllAccounts", () =>
          fetchAccountsForAction("getAllAccounts")
        )) as Record<string, unknown>[];
        const priorAccount = priorAccounts.find(
          (a) => a.id === accountIdForSmsCheck || a.accountId === accountIdForSmsCheck
        );
        if (priorAccount) {
          previousSubcontractorName = getAccountAssignedSub(
            priorAccount as Record<string, string | number | boolean | null | undefined>
          );
        }
      } catch {
        // Best-effort only — if this lookup fails, fall through and treat
        // it as a change so the sub still gets notified rather than missed.
      }
    }

    // updateAccount overwrites the full record by accountId, so retrying after
    // an ambiguous timeout/network failure converges to the same end state
    // (safe). addAccount's Apps Script handler isn't in this repo, so we can't
    // confirm it upserts by id rather than appending a row — treat a blind
    // retry-on-timeout as a duplicate-account risk and fail fast instead. A
    // confirmed 5xx is safe to retry either way, since the server explicitly
    // rejected the request and nothing was written.
    const response = await fetchAppsScript(
      SCRIPT_URL,
      {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({
          action: resolvedAction,
          account: accountPayload,
        }),
        cache: "no-store",
      },
      undefined,
      { retryOn5xx: true, retryOnThrow: resolvedAction === "updateAccount" }
    );

    const text = await response.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      return NextResponse.json(
        {
          success: false,
          error: "Google Script did not return valid JSON while saving account.",
          rawResponse: text,
        },
        { status: 500 }
      );
    }

    if (!response.ok || data.success === false) {
      return NextResponse.json(
        {
          success: false,
          error: data.error || data.message || "Failed to save account.",
        },
        { status: 500 }
      );
    }

    // A successful add/update means every cached GET action key is now
    // stale — without this, the accounts list/detail/edit pages keep
    // serving the pre-write data for up to the getOrFetch TTL (60s).
    for (const cachedAction of ALLOWED_GET_ACTIONS) {
      invalidateCached(`accounts:${cachedAction}`);
    }

    // Fire-and-forget: only when the sub is newly set or actually changed
    // (see newSubcontractorName/previousSubcontractorName above) — not
    // awaited, so a Textbelt hiccup never delays this response.
    if (
      newSubcontractorName &&
      newSubcontractorName.toLowerCase() !== previousSubcontractorName.trim().toLowerCase()
    ) {
      const accountName = String(
        (accountPayload as Record<string, unknown>).accountName ??
          (accountPayload as Record<string, unknown>)["Account Name"] ??
          ""
      ).trim();
      const address = String(
        (accountPayload as Record<string, unknown>).address ??
          (accountPayload as Record<string, unknown>).Address ??
          ""
      ).trim();

      findSubcontractorPhoneByName(newSubcontractorName)
        .then((phone) => {
          if (!phone) {
            console.debug(
              `[sms] skip account-assignment notify: no phone on file for subcontractor "${newSubcontractorName}"`
            );
            return;
          }
          const message = sanitizeSmsText(
            `New account assigned: ${accountName}${address ? `, ${address}` : ""}`
          );
          void sendSms(phone, message, "accounts/updateAccount");
        })
        .catch((error) => {
          console.error(
            "[sms] account-assignment notify lookup failed:",
            error instanceof Error ? error.message : error
          );
        });
    }

    return NextResponse.json({
      success: true,
      message: data.message || "Account saved successfully.",
      account: data.account || null,
      accountId: data.accountId || data.id || null,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error saving account.",
      },
      { status: 500 }
    );
  }
}