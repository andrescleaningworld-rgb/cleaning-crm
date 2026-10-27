// fetch() for the browser with a time limit, so a request that never answers
// shows a message instead of a spinner or a grey button that stays forever.
//
// The whole answer (headers and body) has to arrive within the limit. It is
// read here and handed back as a normal Response, so callers keep using
// .json() / .text() as before.
//
// A caller can still pass its own signal (to cancel an old request when a
// newer one starts). That cancel comes back as the usual AbortError; use
// isAbortError() to ignore it.

export const TOO_LONG_MESSAGE = "That took too long, try again.";
export const DEFAULT_FETCH_TIMEOUT_MS = 15_000;

export class FetchTimeoutError extends Error {
  constructor() {
    super(TOO_LONG_MESSAGE);
    this.name = "FetchTimeoutError";
  }
}

/** True when the request was cancelled by the caller's own signal (not by the time limit). */
export function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

// Statuses that may not carry a body in a Response.
const NO_BODY = new Set([101, 103, 204, 205, 304]);

export async function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit = {},
  timeoutMs: number = DEFAULT_FETCH_TIMEOUT_MS
): Promise<Response> {
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  const outer = init.signal;
  const passAbort = () => controller.abort();
  if (outer) {
    if (outer.aborted) controller.abort();
    else outer.addEventListener("abort", passAbort, { once: true });
  }

  try {
    const response = await fetch(input, { ...init, signal: controller.signal });
    const text = await response.text();
    return new Response(NO_BODY.has(response.status) ? null : text, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    });
  } catch (error) {
    if (timedOut) throw new FetchTimeoutError();
    throw error;
  } finally {
    clearTimeout(timer);
    outer?.removeEventListener("abort", passAbort);
  }
}
