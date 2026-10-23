// The customer check-in answer page: /checkin/<token>?a=up|down|stop, from
// the monthly email. No login: the signed link is the key
// (lib/checkinLink.ts; public in proxy.ts). Plain HTML, huge buttons.
//
// Opening the link only shows the page; the answer is sent from it (by
// itself, or with the button), so a mail program that "opens" links to scan
// them does not answer for the customer.
//   up      → "Thank you! 👍"
//   down    → "We are sorry 👎" + "What went wrong?" (can be skipped); a
//             paper goes to the account manager's square at once
//   stop    → "Stop these emails?" → Yes
// The test link (id 0, "Send me a test" in Settings) shows the same pages
// and saves nothing.

import { NextRequest } from "next/server";
import { readCheckinToken } from "@/lib/checkinLink";
import { CHECKIN_PAGE as W } from "@/lib/customerCheckin";
import { BRAND_GREEN, escHtml } from "@/lib/simpleEmail";
import { WELCOME_COLORS as C, WELCOME_LOGO_URL } from "@/lib/welcomePacket";
import { answerCheckin, commentCheckin, optOutCheckin } from "@/lib/pg/customer-checkin";

type RouteContext = { params: Promise<{ token: string }> };

const HEADERS = { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "private, no-store", "X-Robots-Tag": "noindex, nofollow", "Referrer-Policy": "no-referrer" };

function page(inner: string, status = 200): Response {
  const html =
    `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" />` +
    `<meta name="color-scheme" content="light only" /><title>Cleaning World</title><style>` +
    `body{margin:0;background:#fff;color:${C.text};font:18px/1.5 Arial,Helvetica,sans-serif}` +
    `main{max-width:520px;margin:0 auto;padding:20px 16px;text-align:center}` +
    `img{width:200px;max-width:70%;height:auto}h1{font-size:28px;margin:18px 0 8px;color:${C.header}}` +
    `.btn{display:block;width:100%;box-sizing:border-box;border:0;border-radius:16px;padding:20px;font-size:24px;font-weight:700;color:#fff;background:${BRAND_GREEN};cursor:pointer;margin-top:14px}` +
    `.btn.red{background:#b91c1c}textarea{width:100%;box-sizing:border-box;min-height:120px;font:18px Arial,Helvetica,sans-serif;padding:12px;border:2px solid ${C.border};border-radius:12px}` +
    `label{display:block;text-align:left;font-weight:700;margin:18px 0 6px}.note{color:${C.muted};font-size:15px}` +
    `</style></head><body><main><img src="${WELCOME_LOGO_URL}" alt="Cleaning World Inc." />${inner}` +
    `<p class="note" style="margin-top:28px">Cleaning World Inc. · 201-487-1313</p></main></body></html>`;
  return new Response(html, { status, headers: HEADERS });
}

const testNote = (test: boolean) => (test ? `<p class="note">${escHtml(W.test)}</p>` : "");
const gone = () => page(`<h1>${escHtml(W.gone)}</h1>`, 404);

/** A form that sends itself (the button is there too, in case it does not). */
function sendNow(answer: "up" | "down"): string {
  return (
    `<form id="send" method="post"><input type="hidden" name="a" value="${answer}" />` +
    `<button class="btn${answer === "down" ? " red" : ""}" type="submit">${answer === "up" ? "👍 Send" : "👎 Send"}</button></form>` +
    `<script>document.getElementById("send").submit()</script>`
  );
}

function sorryPage(test: boolean): Response {
  return page(
    `<h1>${escHtml(W.sorry)}</h1>${testNote(test)}` +
      `<form method="post"><input type="hidden" name="a" value="comment" />` +
      `<label for="c">${escHtml(W.whatWrong)}</label><textarea id="c" name="comment" maxlength="1000"></textarea>` +
      `<button class="btn" type="submit">${escHtml(W.send)}</button></form>`
  );
}

export async function GET(request: NextRequest, context: RouteContext) {
  const id = readCheckinToken((await context.params).token);
  if (id === null) return gone();
  const action = request.nextUrl.searchParams.get("a");
  if (action === "up" || action === "down") return page(`<h1>${action === "up" ? "👍" : "👎"}</h1>${sendNow(action)}`);
  if (action === "stop") {
    return page(
      `<h1>${escHtml(W.stopTitle)}</h1>${testNote(id === 0)}<form method="post"><input type="hidden" name="a" value="stop" />` +
        `<button class="btn red" type="submit">${escHtml(W.stopButton)}</button></form>`
    );
  }
  return gone();
}

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const id = readCheckinToken((await context.params).token);
    if (id === null) return gone();
    const form = await request.formData().catch(() => null);
    const action = String(form?.get("a") ?? "");
    const test = id === 0;

    if (action === "up") {
      if (!test && !(await answerCheckin(id, "up"))) return gone();
      return page(`<h1>${escHtml(W.thanksUp)}</h1><p>${escHtml(W.thanksUpText)}</p>${testNote(test)}`);
    }
    if (action === "down") {
      if (!test && !(await answerCheckin(id, "down"))) return gone();
      return sorryPage(test);
    }
    if (action === "comment") {
      if (!test) await commentCheckin(id, String(form?.get("comment") ?? ""));
      return page(`<h1>${escHtml(W.thanksDown)}</h1>${testNote(test)}`);
    }
    if (action === "stop") {
      if (!test && !(await optOutCheckin(id))) return gone();
      return page(`<h1>${escHtml(W.stopped)}</h1>${testNote(test)}`);
    }
    return gone();
  } catch (error) {
    console.error("[checkin POST]", error instanceof Error ? error.message : error);
    return page(`<h1>Something went wrong.</h1><p>Please try again.</p>`, 500);
  }
}
