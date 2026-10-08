// Shared fetch wrapper for calls to the external Apps Script backend
// (GOOGLE_SCRIPT_URL). Measured production latency has spiked as high as
// ~14s on a single call, on an already-warm instance — not a cold-start or
// concurrency artifact, just real upstream latency variance. A generous
// per-attempt timeout plus one retry gives a slow-but-working response a
// real chance to succeed instead of surfacing as a hard failure.

import { isOutboundDryRun, logDryRun } from "./outbound";

const DEFAULT_TIMEOUT_MS = 18_000; // comfortably above the ~14s spikes observed
const RETRY_DELAY_MS = 750;

export class AppsScriptFetchError extends Error {
  status: number;
  isTimeout: boolean;
  constructor(message: string, status: number, isTimeout = false) {
    super(message);
    this.status = status;
    this.isTimeout = isTimeout;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchOnce(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

// The Apps Script action of a call: the "action" query parameter, or the
// "action" field of a JSON body. "" when there is none.
function appsScriptAction(url: string, init: RequestInit): string {
  try {
    const fromQuery = new URL(url).searchParams.get("action");
    if (fromQuery) return fromQuery;
  } catch {
    // Not a parseable URL — fall through to the body.
  }
  if (typeof init.body === "string") {
    try {
      const parsed = JSON.parse(init.body) as { action?: unknown };
      if (typeof parsed.action === "string") return parsed.action;
    } catch {
      // Not JSON.
    }
  }
  return "";
}

// With OUTBOUND_DRY_RUN=1, only reads reach Apps Script: actions named
// "get…" (GET or POST), and GETs with no action at all. Everything else is a
// write or sends email/SMS (e.g. sendNewAccountPacket is called with GET), so
// it is logged and answered with a fake success instead of being sent.
function appsScriptDryRunResponse(url: string, init: RequestInit): Response | null {
  if (!isOutboundDryRun()) return null;
  const action = appsScriptAction(url, init);
  const method = (init.method ?? "GET").toUpperCase();
  const isRead = /^get/i.test(action) || (action === "" && method === "GET");
  if (isRead) return null;
  logDryRun("Apps Script request", `${method} action=${action || "(none)"}`);
  return new Response(JSON.stringify({ success: true, dryRun: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

// Plain fetch to Apps Script with no timeout or retry, for the call sites
// that never used fetchAppsScript's retry behavior. Only adds the dry-run
// check above.
export async function fetchAppsScriptDirect(url: string, init: RequestInit = {}): Promise<Response> {
  return appsScriptDryRunResponse(url, init) ?? fetch(url, init);
}

export type FetchAppsScriptRetryOptions = {
  // A >=500 response means the server explicitly rejected the request —
  // nothing was written, so retrying is safe regardless of the action's
  // idempotency. Default true.
  retryOn5xx?: boolean;
  // A thrown error (AbortError/timeout, or any other network-level failure)
  // is ambiguous — the request may have already reached the server and be
  // mid-processing. Safe to retry for idempotent calls (a read, or a write
  // that overwrites-by-id) but NOT for a non-idempotent write (e.g. a
  // row-append) where a blind retry risks duplicating the side effect.
  // Default true, matching every existing (read) call site's behavior.
  retryOnThrow?: boolean;
};

// Retries once on a >=500 response and/or a thrown error (timeout or other
// network failure) from the upstream, per the retryOn5xx/retryOnThrow flags
// (both default true) — a successful response with a "success: false" body
// (an actual Apps Script error, not a transient one) is left to the caller
// to handle, not retried here.
export async function fetchAppsScript(
  url: string,
  init: RequestInit = {},
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
  retryOptions: FetchAppsScriptRetryOptions = {}
): Promise<Response> {
  const dryRun = appsScriptDryRunResponse(url, init);
  if (dryRun) return dryRun;

  const retryOn5xx = retryOptions.retryOn5xx ?? true;
  const retryOnThrow = retryOptions.retryOnThrow ?? true;

  let lastError: AppsScriptFetchError = new AppsScriptFetchError("Unknown error contacting Apps Script.", 500);

  for (let attempt = 1; attempt <= 2; attempt++) {
    let retryableThisAttempt = true;

    try {
      const response = await fetchOnce(url, init, timeoutMs);
      if (response.status >= 500) {
        lastError = new AppsScriptFetchError(`Apps Script returned ${response.status}`, response.status);
        retryableThisAttempt = retryOn5xx;
      } else {
        return response;
      }
    } catch (err) {
      const isTimeout = err instanceof Error && err.name === "AbortError";
      lastError = isTimeout
        ? new AppsScriptFetchError("Request timed out, please retry.", 504, true)
        : new AppsScriptFetchError(err instanceof Error ? err.message : "Unknown error contacting Apps Script.", 500);
      retryableThisAttempt = retryOnThrow;
    }

    if (!retryableThisAttempt) break;
    if (attempt < 2) await sleep(RETRY_DELAY_MS);
  }

  throw lastError;
}
