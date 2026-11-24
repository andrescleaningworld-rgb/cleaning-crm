// The customer check-in answer page: /checkin/<token>?a=great|ok|attention|stop,
// from the check-in email. No login: the signed link is the key (30 days,
// lib/checkinLink.ts; public in proxy.ts). Plain HTML, huge buttons, phone first.
//
// Opening the link only shows the page with the answer and a big "Tap to
// send" button (and the other two answers, in case of a wrong tap). Nothing
// is saved until the customer taps it, so an email security scanner that
// opens every link (and runs the page's scripts) does not answer for them.
// Scanners can press buttons too, so a tap (or "Stop") only counts when it
// looks like a person: the page's script ran and the button was on screen a
// second first (tapForm), it came 2 minutes or more after the email went
// out, and not seconds after another tap. Otherwise it is kept in the
// history as "scanner, not a person" and saves nothing; the customer still
// sees the normal page, and a note they write makes their tap count.
// The FIRST answer sent is final. Any tap after that shows "Thanks! We
// already got your answer: …" with the feedback box, and is only kept in
// the history (lib/pg/customer-checkin.ts). Notes always add on.
//   great / ok / attention, tapped → the first one is saved (the office gets
//       an email; Needs attention also puts a paper in the manager's square),
//       then the feedback box:
//         😀 Great            "Anything we can do even better?" (optional)
//         😐 OK               "What can we do better?" + best way to reach you
//         😟 Needs attention  "We're sorry — tell us what went wrong…", in a
//                             red box, + best way to reach you
//       with photos.
//   stop → "Stop these emails?" → Yes
// The old monthly links (?a=up / down) still work as Great / Needs attention.
// The test link (id 0, "Send me a test") shows the same pages and saves nothing.
//   better → the feedback box for the saved answer; saves nothing (the OK reply email).
// Rate-limited per link. The page shows nothing about the account, except the
// account manager's name and phone under the OK message.
// Customer-facing: never "sub", always "your cleaning team".

import { NextRequest } from "next/server";
import { put } from "@/lib/files";
import { checkinPageAge, checkinPageStamp, readCheckinToken } from "@/lib/checkinLink";
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

const ratingInfo = (rating: CheckinRating) => CHECKIN_RATINGS.find((entry) => entry.value === rating)!;

/** A person's tap: the button was on screen this long first (simple scanners press it at once, or without running the page). */
const MIN_SHOWN_MS = 1000;

/**
 * The tap form ("Tap to send", "Yes, stop them"): a signed stamp of when the
 * page was made (p), and how long the button was on screen (h), filled in by
 * the page's script. A tap under a second is not sent (a person just taps
 * again); a tap without the script sends h empty, and the server keeps it
 * only in the history (lib/pg/customer-checkin.ts, "ignored").
 */
function tapForm(id: number, action: string, button: string, color?: string): string {
  return (
    `<form id="tap" method="post"><input type="hidden" name="a" value="${action}" />` +
    `<input type="hidden" name="p" value="${escHtml(checkinPageStamp(id))}" /><input type="hidden" name="h" value="" />` +
    `<button class="btn"${color ? ` style="background:${color}"` : ""} type="submit">${escHtml(button)}</button></form>` +
    `<script>(function(){var f=document.getElementById("tap");if(!f)return;var b=f.querySelector("button"),h=f.querySelector("input[name=h]"),t0=0;` +
    `function seen(){if(!t0)t0=Date.now();}` +
    `if(window.IntersectionObserver){new IntersectionObserver(function(e){if(e[0]&&e[0].isIntersecting)seen();},{threshold:0.5}).observe(b);}else seen();` +
    `f.addEventListener("submit",function(e){var ms=t0?Date.now()-t0:0;if(ms<${MIN_SHOWN_MS}){e.preventDefault();return;}h.value=String(ms);});})();</script>`
  );
}

/** Why the tap does not look like a person, from the tap form ("" = it does). */
function pageProblem(form: FormData | null, id: number): string {
  const shown = String(form?.get("h") ?? "").trim();
  const age = checkinPageAge(String(form?.get("p") ?? ""), id);
  if (age === null) return "it did not come from the answer page";
  if (shown === "" || !Number.isFinite(Number(shown))) return "the page's script did not run";
  if (Number(shown) < MIN_SHOWN_MS || age < MIN_SHOWN_MS) return "tapped less than a second after the button showed";
  return "";
}

const stopPage = (id: number, again = false) =>
  page(
    `<h1>${escHtml(W.stopTitle)}</h1>${testNote(id === 0)}${again ? `<p>${escHtml(W.stopAgain)}</p>` : ""}${tapForm(id, "stop", W.stopButton)}`
  );

/**
 * The page a link in the email opens: the answer and one big button. Nothing
 * is sent by itself: the customer taps. The other two answers are small
 * links (they only change this page).
 */
function confirmPage(id: number, rating: CheckinRating): Response {
  const r = ratingInfo(rating);
  const others = CHECKIN_RATINGS.filter((c) => c.value !== rating)
    .map((c) => `<a href="?a=${c.value}" style="color:${c.color};font-weight:700;margin:0 10px;white-space:nowrap">${escHtml(c.customer)}</a>`)
    .join(" ");
  return page(
    `<h1>${escHtml(W.confirmTitle)}</h1><p style="font-size:26px;font-weight:700;color:${r.color};margin:6px 0 0">${escHtml(r.customer)}</p>${testNote(id === 0)}` +
      tapForm(id, rating, W.confirmButton, r.color) +
      `<p class="note" style="margin-top:22px">${escHtml(W.confirmOther)}<br>${others}</p>`
  );
}

// Photos are made smaller on the phone before they are sent (big phone photos
// would not fit in one upload), then the page the server answers replaces this one.
const PAGE_SCRIPT = `<script>
(function(){var f=document.getElementById("better");if(!f||!window.FormData||!window.fetch)return;
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

/**
 * The answer is saved: the feedback box for it. already = the customer tapped
 * again after the first answer: "Thanks! We already got your answer: …" (the
 * first answer stays; notes still add on).
 */
function feedbackPage(rating: CheckinRating, test: boolean, signature: string[] = [], already = false): Response {
  const r = ratingInfo(rating);
  const boxClass = rating === "attention" ? "bad" : rating === "great" ? "light" : "";
  const heading = already
    ? `<h1>${escHtml(W.already)}</h1><p style="font-size:26px;font-weight:700;color:${r.color};margin:6px 0 4px">${escHtml(r.customer)}</p>` +
      `<p class="note" style="margin:0 0 14px">${escHtml(W.alreadyMore)}</p>`
    : `<h1>${escHtml(`${customerEmoji(r)} ${W.got}`)}</h1>`;
  return page(
    `${heading}${testNote(test)}` +
      `<form id="better" method="post" enctype="multipart/form-data"><input type="hidden" name="shown" value="${rating}" />` +
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
  if (rating) {
    // Already answered: say so (the first answer is final). Opening a link saves nothing.
    const saved = id === 0 ? "" : await currentRating(id);
    if (saved) return feedbackPage(saved, false, await checkinSignature(id).catch(() => []), true);
    return confirmPage(id, rating);
  }
  if (action === "better") {
    if (id === 0) return feedbackPage("ok", true);
    const saved = await currentRating(id);
    return saved ? feedbackPage(saved, false, await checkinSignature(id).catch(() => [])) : gone();
  }
  if (action === "stop") return stopPage(id);
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
    const agent = request.headers.get("user-agent") ?? "";

    const rating = ratingFrom(action);
    if (rating) {
      if (test) return feedbackPage(rating, true);
      const result = await answerCheckin(id, rating, origin, { agent, pageProblem: pageProblem(form, id) });
      if (!result.found) return gone();
      // Ignored (looked like a scanner): the same "Got it" page, so a person can still write a
      // note; a note makes their tap count (lib/pg/customer-checkin.ts). Already answered: say so.
      const saved = result.ignored ? await currentRating(id) : result.rating;
      return feedbackPage(saved || rating, false, await checkinSignature(id).catch(() => []), result.ignored ? saved !== "" : !result.first);
    }
    if (action === "comment" || action === "skip") {
      if (!test && form) {
        const accountId = await checkinAccountId(id);
        if (!accountId) return gone();
        const skip = action === "skip";
        const photos = skip ? [] : await savePhotos(form, accountId);
        await submitFeedback(
          id,
          { comment: skip ? "" : String(form.get("comment") ?? ""), reach: skip ? "" : String(form.get("reach") ?? ""), photos, shown: ratingFrom(form.get("shown")) },
          origin,
          agent
        );
      }
      const now = test ? "" : await currentRating(id);
      if (action === "skip") {
        return now === "great"
          ? page(`<h1>${escHtml(W.thanksGreat)}</h1><p>${escHtml(W.thanksGreatText)}</p>${testNote(test)}`)
          : page(`<h1>${escHtml(W.thanksNoted)}</h1>${testNote(test)}`);
      }
      return page(`<h1>${escHtml(W.thanksSent)}</h1>${testNote(test)}`);
    }
    if (action === "stop") {
      if (!test) {
        const stopped = await optOutCheckin(id, { agent, pageProblem: pageProblem(form, id) });
        if (stopped === "gone") return gone();
        // Looked like a scanner: nothing saved, the button again (a person just taps once more).
        if (stopped === "ignored") return stopPage(id, true);
      }
      return page(`<h1>${escHtml(W.stopped)}</h1>${testNote(test)}`);
    }
    return gone();
  } catch (error) {
    console.error("[checkin POST]", error instanceof Error ? error.message : error);
    return page(`<h1>Something went wrong.</h1><p>Please try again.</p>`, 500);
  }
}
