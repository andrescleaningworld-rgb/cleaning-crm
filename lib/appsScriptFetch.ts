// Shared fetch wrapper for calls to the external Apps Script backend
// (GOOGLE_SCRIPT_URL). Measured production latency has spiked as high as
// ~14s on a single call, on an already-warm instance — not a cold-start or
// concurrency artifact, just real upstream latency variance. A generous
// per-attempt timeout plus one retry gives a slow-but-working response a
// real chance to succeed instead of surfacing as a hard failure.

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

// Retries once, only on a timeout or a 5xx from the upstream — a successful
// response with a "success: false" body (an actual Apps Script error, not a
// transient one) is left to the caller to handle, not retried here.
export async function fetchAppsScript(
  url: string,
  init: RequestInit = {},
  timeoutMs: number = DEFAULT_TIMEOUT_MS
): Promise<Response> {
  let lastError: AppsScriptFetchError = new AppsScriptFetchError("Unknown error contacting Apps Script.", 500);

  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const response = await fetchOnce(url, init, timeoutMs);
      if (response.status >= 500) {
        lastError = new AppsScriptFetchError(`Apps Script returned ${response.status}`, response.status);
      } else {
        return response;
      }
    } catch (err) {
      const isTimeout = err instanceof Error && err.name === "AbortError";
      lastError = isTimeout
        ? new AppsScriptFetchError("Request timed out, please retry.", 504, true)
        : new AppsScriptFetchError(err instanceof Error ? err.message : "Unknown error contacting Apps Script.", 500);
    }

    if (attempt < 2) await sleep(RETRY_DELAY_MS);
  }

  throw lastError;
}
