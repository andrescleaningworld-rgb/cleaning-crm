// The customer check-in answer page: /checkin/<token>?a=great|ok|attention|stop,
// from the check-in email. No login: the signed link is the key (30 days,
// lib/checkinLink.ts; public in proxy.ts). Plain HTML, huge buttons, phone first.
//
// Opening the link only shows the page; the answer is sent from it (by
// itself, or with the button), so a mail program that "opens" links to scan
// them does not answer for the customer.
//   great / ok / attention → the answer is saved at once (the office gets an
//       email; Needs attention also puts a paper in the manager's square),
//       then the feedback box:
//         😀 Great            "Anything we can do even better?" (optional)
//         😐 OK               "What can we do better?" + best way to reach you
//         😟 Needs attention  "We're sorry — tell us what went wrong…", in a
//                             red box, + best way to reach you
//       with photos, and the three answers to change it before Submit.
//   stop → "Stop these emails?" → Yes
// The old monthly links (?a=up / down) still work as Great / Needs attention.
// The test link (id 0, "Send me a test") shows the same pages and saves nothing.
//   better → the feedback box for the saved answer; saves nothing (the OK reply email).
// Rate-limited per link. The page shows nothing about the account, except the
// account manager's name and phone under the OK message.
// Customer-facing: never "sub", always "your cleaning team".

import { NextRequest } from "next/server";
import { put } from "@/lib/files";
import { readCheckinToken } from "@/lib/checkinLink";
import { CHECKIN_PAGE as W, CHECKIN_RATINGS, customerEmoji, type CheckinRating } from "@/lib/customerCheckin";
import { escHtml } from "@/lib/simpleEmail";
import { checkRateLimit } from "@/lib/siteLinkRateLimit";
import { WELCOME_COLORS as C, WELCOME_LOGO_URL } from "@/lib/welcomePacket";
import { answerCheckin, checkinAccountId, checkinSignature, currentRating, optOutCheckin, submitFeedback } from "@/lib/pg/customer-checkin";

type RouteContext = { params: Promise<{ token: string }> };

const HEADERS = { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "private, no-store", "X-Robots-Tag": "noindex, nofollow", "Referrer-Policy": "no-referrer" };
const MAX_PHOTOS = 3;
const MAX_PHOTO_BYTES = 4 * 1024 * 1024;
const PHOTO_TYPES = /^image\/(jpeg|png|webp|heic|heif)$/i;
/** Page loads and sends per link per minute. */
const PER_MINUTE = 30;

function page(inner: string, status = 200): Response {
  const html =
    `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" />` +
    `<meta name="color-scheme" content="light only" /><title>Cleaning World</title><style>` +
    `body{margin:0;background:#fff;color:${C.text};font:18px/1.5 Arial,Helvetica,sans-serif}` +
    `main{max-width:520px;margin:0 auto;padding:20px 16px;text-align:center}` +
    `img.logo{width:200px;max-width:70%;height:auto}h1{font-size:28px;margin:18px 0 8px;color:${C.header}}` +
    `h2{font-size:22px;margin:0 0 6px;color:${C.header}}` +
    `.btn{display:block;width:100%;box-sizing:border-box;border:0;border-radius:16px;padding:20px;font-size:24px;font-weight:700;color:#fff;background:${C.bar};cursor:pointer;margin-top:14px}` +
    `.btn.quiet{background:#fff;color:${C.header};border:2px solid ${C.border}}.btn[disabled]{opacity:.6}` +
    `textarea{width:100%;box-sizing:border-box;min-height:140px;font:18px Arial,Helvetica,sans-serif;padding:12px;border:2px solid ${C.border};border-radius:12px;background:#fff}` +
    `input[type=text]{width:100%;box-sizing:border-box;font:18px Arial,Helvetica,sans-serif;padding:12px;border:2px solid ${C.border};border-radius:12px}` +
    `input[type=file]{width:100%;font-size:16px;padding:10px 0}` +
    `label{display:block;text-align:left;font-weight:700;margin:18px 0 6px}.note{color:${C.muted};font-size:15px}` +
    `.choices{display:flex;gap:8px;margin:8px 0 18px}.choice{flex:1;margin:0;border:2px solid ${C.border};border-radius:14px;padding:10px 4px;text-align:center;font-weight:700;font-size:16px;cursor:pointer;background:#fff}` +
    `.choice .e{display:block;font-size:30px;line-height:1.2}.choice input{margin:4px auto 0;display:block;width:20px;height:20px}` +
    `.choice:has(input:checked){border-width:3px;background:#eff6ff}` +
    `.box{text-align:left;border-radius:16px;padding:14px;border:2px solid ${C.border}}` +
    `.box.bad{border:3px solid #b91c1c;background:#fef2f2}.box.bad h2{color:#b91c1c}.box.light textarea{min-height:90px}` +
    `.sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}` +
    `</style></head><body><main><img class="logo" src="${WELCOME_LOGO_URL}" alt="Cleaning World Inc." />${inner}` +
    `<p class="note" style="margin-top:28px">Cleaning World Inc. · 201-487-1313</p></main></body></html>`;
  return new Response(html, { status, headers: HEADERS });
}

const testNote = (test: boolean) => (test ? `<p class="note">${escHtml(W.test)}</p>` : "");
const gone = () => page(`<h1>${escHtml(W.gone)}</h1><p>${escHtml(W.goneText)}</p>`, 404);
const tooMany = () => page(`<h1>Please wait a minute.</h1><p>Then try again.</p>`, 429);

function ratingFrom(value: unknown): CheckinRating | null {
  if (value === "great" || value === "up") return "great";
  if (value === "ok") return "ok";
  if (value === "attention" || value === "down") return "attention";
  return null;
}

/** A form that sends itself (the button is there too, in case it does not). */
function sendNow(rating: CheckinRating): string {
  const r = CHECKIN_RATINGS.find((entry) => entry.value === rating)!;
  return (
    `<form id="send" method="post"><input type="hidden" name="a" value="${rating}" />` +
    `<button class="btn" style="background:${r.color}" type="submit">${escHtml(r.customer)}</button></form>` +
    `<script>document.getElementById("send").submit()</script>`
  );
}

// The words per answer, for changing the answer on the page.
const PROMPTS = JSON.stringify(Object.fromEntries(CHECKIN_RATINGS.map((r) => [r.value, { prompt: W.prompt[r.value], hint: W.hint[r.value] }]))).replace(/</g, "\\u003c");

// Changing the answer swaps the box's words. Photos are made smaller on the
// phone before they are sent (big phone photos would not fit in one upload),
// then the page the server answers replaces this one.
const PAGE_SCRIPT = `<script>
(function(){var f=document.getElementById("better");if(!f)return;var P=${PROMPTS};
function show(v){var p=P[v];if(!p)return;var box=document.getElementById("box");box.className="box "+(v==="attention"?"bad":v==="great"?"light":"");
document.getElementById("prompt").textContent=p.prompt;document.getElementById("hint").textContent=p.hint;
document.getElementById("reachBox").style.display=v==="great"?"none":"";
var s=document.getElementById("okSign");if(s)s.style.display=v==="ok"?"":"none";}
[].forEach.call(f.querySelectorAll("input[name=rating]"),function(r){r.addEventListener("change",function(){show(r.value);});});
if(!window.FormData||!window.fetch)return;
function shrink(file){return new Promise(function(done){if(!/^image\\//.test(file.type)){done(file);return;}
var img=new Image(),url=URL.createObjectURL(file);img.onload=function(){var s=Math.min(1,1600/Math.max(img.width,img.height));
var c=document.createElement("canvas");c.width=Math.round(img.width*s);c.height=Math.round(img.height*s);
c.getContext("2d").drawImage(img,0,0,c.width,c.height);URL.revokeObjectURL(url);c.toBlob(function(b){done(b?new File([b],"photo.jpg",{type:"image/jpeg"}):file);},"image/jpeg",0.82);};
img.onerror=function(){URL.revokeObjectURL(url);done(file);};img.src=url;});}
f.addEventListener("submit",function(e){e.preventDefault();var b=e.submitter||f.querySelector("button[value=comment]");var all=f.querySelectorAll("button");
[].forEach.call(all,function(x){x.disabled=true;});var label=b.textContent;b.textContent="Sending…";
var d=new FormData(f),files=[].slice.call(f.querySelector("input[type=file]").files||[],0,${MAX_PHOTOS});d.delete("photos");d.set("a",b.value||"comment");
Promise.all(files.map(shrink)).then(function(list){list.forEach(function(x){d.append("photos",x);});
return fetch(location.href,{method:"POST",body:d});}).then(function(r){return r.text();}).then(function(t){document.open();document.write(t);document.close();})
.catch(function(){[].forEach.call(all,function(x){x.disabled=false;});b.textContent=label;alert("It did not send. Please try again.");});});})();
</script>`;

/** The answer is saved: the feedback box, with the three answers to change it. */
function feedbackPage(rating: CheckinRating, test: boolean, signature: string[] = []): Response {
  const r = CHECKIN_RATINGS.find((entry) => entry.value === rating)!;
  const choices = CHECKIN_RATINGS.map(
    (c) =>
      `<label class="choice" style="color:${c.color}"><span class="e">${customerEmoji(c)}</span>${escHtml(c.customer.slice(customerEmoji(c).length).trim())}` +
      `<input type="radio" name="rating" value="${c.value}"${c.value === rating ? " checked" : ""} /></label>`
  ).join("");
  const boxClass = rating === "attention" ? "bad" : rating === "great" ? "light" : "";
  return page(
    `<h1>${escHtml(`${customerEmoji(r)} ${W.got}`)}</h1>${testNote(test)}` +
      `<form id="better" method="post" enctype="multipart/form-data">` +
      `<p class="note" style="margin:0">${escHtml(W.change)}</p><div class="choices" role="radiogroup" aria-label="${escHtml(W.change)}">${choices}</div>` +
      `<div id="box" class="box ${boxClass}"><h2 id="prompt">${escHtml(W.prompt[rating])}</h2><p class="note" id="hint" style="margin:0">${escHtml(W.hint[rating])}</p>` +
      (signature.length ? `<p class="note" id="okSign" style="margin:8px 0 0${rating === "ok" ? "" : ";display:none"}">${signature.map(escHtml).join("<br>")}</p>` : "") +
      `<label for="c" class="sr">Your comment</label><textarea id="c" name="comment" maxlength="2000"></textarea>` +
      `<div id="reachBox"${rating === "great" ? ' style="display:none"' : ""}><label for="r">${escHtml(W.reach)}</label>` +
      `<input id="r" type="text" name="reach" maxlength="200" autocomplete="tel" placeholder="${escHtml(W.reachHint)}" /></div>` +
      `<label for="p">${escHtml(W.photos)}</label><input id="p" type="file" name="photos" accept="image/*" multiple /></div>` +
      `<button class="btn" type="submit" name="a" value="comment">${escHtml(W.send)}</button>` +
      `<button class="btn quiet" type="submit" name="a" value="skip">${escHtml(W.skip)}</button></form>` +
      PAGE_SCRIPT
  );
}

/** The customer's photos, stored like portal photos (Blob, under checkin/<account>/). */
async function savePhotos(form: FormData, accountId: string): Promise<string[]> {
  if (!process.env.BLOB_READ_WRITE_TOKEN) return [];
  const files = form.getAll("photos").filter((entry): entry is File => entry instanceof File && entry.size > 0).slice(0, MAX_PHOTOS);
  const folder = accountId.replace(/[^A-Za-z0-9_-]/g, "_") || "account";
  const urls: string[] = [];
  for (const file of files) {
    const byName = /\.(jpe?g|png|webp|heic|heif)$/i.test(file.name);
    if (file.size > MAX_PHOTO_BYTES || (!PHOTO_TYPES.test(file.type) && !byName)) continue;
    try {
      const extension = byName ? file.name.slice(file.name.lastIndexOf(".")).toLowerCase() : ".jpg";
      const blob = await put(`checkin/${folder}/${crypto.randomUUID()}${extension}`, file, { access: "public", contentType: file.type || "image/jpeg", addRandomSuffix: false });
      urls.push(blob.url);
    } catch (error) {
      console.error("[checkin] photo:", error instanceof Error ? error.message : error);
    }
  }
  return urls;
}

export async function GET(request: NextRequest, context: RouteContext) {
  const id = readCheckinToken((await context.params).token);
  if (id === null) return gone();
  if (!(await checkRateLimit(`checkin:${id}`, PER_MINUTE))) return tooMany();
  const action = request.nextUrl.searchParams.get("a");
  const rating = ratingFrom(action);
  if (rating) return page(`<h1>${escHtml(customerEmoji(CHECKIN_RATINGS.find((r) => r.value === rating)!))}</h1>${sendNow(rating)}`);
  if (action === "better") {
    if (id === 0) return feedbackPage("ok", true);
    const saved = await currentRating(id);
    return saved ? feedbackPage(saved, false, await checkinSignature(id).catch(() => [])) : gone();
  }
  if (action === "stop") {
    return page(
      `<h1>${escHtml(W.stopTitle)}</h1>${testNote(id === 0)}<form method="post"><input type="hidden" name="a" value="stop" />` +
        `<button class="btn" type="submit">${escHtml(W.stopButton)}</button></form>`
    );
  }
  return gone();
}

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const id = readCheckinToken((await context.params).token);
    if (id === null) return gone();
    if (!(await checkRateLimit(`checkin:${id}`, PER_MINUTE))) return tooMany();
    const form = await request.formData().catch(() => null);
    const action = String(form?.get("a") ?? "");
    const test = id === 0;
    const origin = request.nextUrl.origin;

    const rating = ratingFrom(action);
    if (rating) {
      if (!test && !(await answerCheckin(id, rating, origin))) return gone();
      return feedbackPage(rating, test, test ? [] : await checkinSignature(id).catch(() => []));
    }
    if (action === "comment" || action === "skip") {
      const chosen = ratingFrom(form?.get("rating"));
      if (!test && form) {
        const accountId = await checkinAccountId(id);
        if (!accountId) return gone();
        const skip = action === "skip";
        const photos = skip ? [] : await savePhotos(form, accountId);
        await submitFeedback(
          id,
          { rating: chosen, comment: skip ? "" : String(form.get("comment") ?? ""), reach: skip ? "" : String(form.get("reach") ?? ""), photos },
          origin
        );
      }
      const now = test ? chosen : (await currentRating(id)) || chosen;
      if (action === "skip") {
        return now === "great"
          ? page(`<h1>${escHtml(W.thanksGreat)}</h1><p>${escHtml(W.thanksGreatText)}</p>${testNote(test)}`)
          : page(`<h1>${escHtml(W.thanksNoted)}</h1>${testNote(test)}`);
      }
      return page(`<h1>${escHtml(W.thanksSent)}</h1>${testNote(test)}`);
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
