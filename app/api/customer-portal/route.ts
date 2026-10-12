// The old customer portal's API (phone login, requests, complaints, history).
// CLOSED. This path is public (proxy.ts: no login), and it used to pass
// whatever "action" it was sent straight to Apps Script. So anyone, without
// logging in, could ask it for getAllAccounts, getSales, getSubcontractors…
// and get the whole list back: alarm codes, contacts, revenue, pay.
//
// No customer ever used the old portal, so nothing is kept open: every
// method answers 404 with an empty body. Nothing here reads Google Sheets,
// calls Apps Script, or touches the database. The new portal (/portal,
// /api/portal) is separate and is not affected.

const closed = () => new Response(null, { status: 404, headers: { "Cache-Control": "no-store" } });

export const GET = closed;
export const HEAD = closed;
export const POST = closed;
export const PUT = closed;
export const PATCH = closed;
export const DELETE = closed;
export const OPTIONS = closed;
