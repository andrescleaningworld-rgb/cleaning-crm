"use client";

// The simple sub portal home. Built for a phone in one hand, with almost no
// typing: today's sites, four giant buttons (Photos, Problem, Extra job,
// Supplies), "My requests", and "More" for everything the portal did before.
// Every action is three taps or fewer and ends on a big green "Sent ✓".
// English, Spanish and Portuguese; the choice is remembered on the phone.
// All words come from app/ui/words.ts (SUB_WORDS, MOTTO).

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { MOTTO, SUB_WORDS, type UiLang } from "@/app/ui/words";
import { ShellTitle, TileIconSvg, type TileIcon } from "@/app/ui";

export type HomeAccount = { accountId?: string; id?: string; accountName?: string; address?: string };
export type HomeSupply = { supplyItem?: string; name?: string; category?: string; unit?: string };
type TodaySite = { accountId: string; accountName: string; address: string; timeWindow: string; done: boolean };
type SubRequest = { kind: string; title: string; detail: string; status: "received" | "approved" | "done"; date: string };
type HomeData = { on: boolean; firstName: string; today: TodaySite[]; requests: SubRequest[]; waiting: number };
type View = "home" | "photos" | "problem" | "extra" | "supplies" | "requests" | "sent";
type Site = { accountId: string; accountName: string; address: string };

const LANG_KEY = "cwSubLang";
const LANGS: UiLang[] = ["en", "es", "pt"];
const SPEECH_LANG: Record<UiLang, string> = { en: "en-US", es: "es-US", pt: "pt-BR" };

export function useSubLang(): [UiLang, () => void] {
  const [lang, setLang] = useState<UiLang>("en");
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(LANG_KEY) as UiLang | null;
      // First visit: follow the phone's own language.
      const guess = (navigator.language || "en").slice(0, 2).toLowerCase() as UiLang;
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setLang(saved && LANGS.includes(saved) ? saved : LANGS.includes(guess) ? guess : "en");
    } catch {
      // Stays English.
    }
  }, []);
  const next = useCallback(() => {
    setLang((current) => {
      const following = LANGS[(LANGS.indexOf(current) + 1) % LANGS.length];
      try {
        window.localStorage.setItem(LANG_KEY, following);
      } catch {
        // Not remembered, still switched for now.
      }
      return following;
    });
  }, []);
  return [lang, next];
}

export function LangButton({ lang, onNext }: { lang: UiLang; onNext: () => void }) {
  return (
    <button type="button" className="ui-btn ui-btn-second sub-lang" onClick={onNext} aria-label="Language / Idioma / Idioma">
      {lang.toUpperCase()}
    </button>
  );
}

/* ---------- helpers ---------- */

/** Shrinks a photo on the phone (longest side 1600px, JPEG) so it sends on a weak signal. */
async function shrinkPhoto(file: File): Promise<Blob> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.8));
    return blob ?? file;
  } catch {
    return file;
  }
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Tries up to 4 times, waiting longer each time: a weak signal should not lose the send. */
async function withRetry<T>(run: () => Promise<T>, onRetry: () => void): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      return await run();
    } catch (error) {
      lastError = error;
      if (attempt < 3) {
        onRetry();
        await wait(1500 * (attempt + 1));
      }
    }
  }
  throw lastError;
}

async function postJson(url: string, body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok || data.success === false) throw new Error(String(data.error ?? data.message ?? "failed"));
  return data;
}

async function uploadPhoto(file: File, fields: Record<string, string>): Promise<string> {
  const small = await shrinkPhoto(file);
  const form = new FormData();
  form.append("file", new File([small], "photo.jpg", { type: "image/jpeg" }));
  for (const [key, value] of Object.entries(fields)) form.append(key, value);
  const response = await fetch("/api/subcontractor-portal/home/photo", { method: "POST", body: form });
  const data = (await response.json().catch(() => ({}))) as { success?: boolean; url?: string };
  if (!response.ok || !data.success || !data.url) throw new Error("photo");
  return data.url;
}

type SpeechRecognitionLike = { lang: string; interimResults: boolean; continuous: boolean; start: () => void; stop: () => void; onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null; onend: (() => void) | null; onerror: (() => void) | null };

function speechSupport(): (new () => SpeechRecognitionLike) | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: new () => SpeechRecognitionLike; webkitSpeechRecognition?: new () => SpeechRecognitionLike };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

const SUPPLY_EMOJI: [RegExp, string][] = [
  [/paper|towel|tissue|toilet/i, "🧻"],
  [/bag|liner|trash/i, "🗑️"],
  [/soap|sanit|hand/i, "🧴"],
  [/glove/i, "🧤"],
  [/mop|broom|brush/i, "🧹"],
  [/spray|clean|chem|glass|bleach|disinfect/i, "🧽"],
  [/vac|machine|equip/i, "🔌"],
];
const supplyEmoji = (name: string, category: string) => SUPPLY_EMOJI.find(([pattern]) => pattern.test(`${name} ${category}`))?.[1] ?? "📦";

/* ---------- small pieces ---------- */

function BigTile({ icon, label, tone, onClick }: { icon: TileIcon; label: string; tone: "green" | "red" | "light"; onClick: () => void }) {
  return (
    <button type="button" className={`sub-big sub-big-${tone}`} onClick={onClick}>
      <TileIconSvg name={icon} />
      <span>{label}</span>
    </button>
  );
}

function SitePicker({ sites, value, onPick, label }: { sites: Site[]; value: Site | null; onPick: (site: Site) => void; label: string }) {
  return (
    <div className="ui-stack">
      <p className="ui-strong">{label}</p>
      <div className="sub-sites" role="group" aria-label={label}>
        {sites.map((site) => (
          <button key={site.accountId || site.accountName} type="button" className="ui-chip" aria-pressed={value?.accountName === site.accountName} onClick={() => onPick(site)}>
            {site.accountName}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Photo + Talk (+ a small box to type), for a problem or an extra job. */
function PhotoAndTalk({
  words,
  lang,
  photo,
  onPhoto,
  notes,
  onNotes,
}: {
  words: (typeof SUB_WORDS)["en"];
  lang: UiLang;
  photo: File | null;
  onPhoto: (file: File | null) => void;
  notes: string;
  onNotes: (text: string) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const recognition = useRef<SpeechRecognitionLike | null>(null);
  const [listening, setListening] = useState(false);
  const canTalk = speechSupport() !== null;

  function toggleTalk() {
    if (listening) {
      recognition.current?.stop();
      return;
    }
    const Speech = speechSupport();
    if (!Speech) return;
    const session = new Speech();
    session.lang = SPEECH_LANG[lang];
    session.interimResults = false;
    session.continuous = false;
    session.onresult = (event) => {
      const said = Array.from(event.results)
        .map((result) => result[0]?.transcript ?? "")
        .join(" ")
        .trim();
      if (said) onNotes(notes ? `${notes} ${said}` : said);
    };
    session.onend = () => setListening(false);
    session.onerror = () => setListening(false);
    recognition.current = session;
    setListening(true);
    session.start();
  }

  return (
    <div className="ui-stack">
      <div className="sub-two">
        <button type="button" className={`sub-mid ${photo ? "sub-mid-on" : ""}`} onClick={() => fileRef.current?.click()}>
          <TileIconSvg name="camera" />
          <span>{photo ? `${words.photo} ✓` : words.photo}</span>
        </button>
        {canTalk ? (
          <button type="button" className={`sub-mid ${listening ? "sub-mid-on" : ""}`} onClick={toggleTalk} aria-pressed={listening}>
            <TileIconSvg name="mic" />
            <span>{listening ? words.listening : words.talk}</span>
          </button>
        ) : null}
      </div>
      <input ref={fileRef} type="file" accept="image/*" capture="environment" hidden onChange={(event) => onPhoto(event.target.files?.[0] ?? null)} />
      <textarea className="ui-input" rows={2} value={notes} onChange={(event) => onNotes(event.target.value)} placeholder={`${words.whatHappened} (${words.optional})`} aria-label={words.whatHappened} />
    </div>
  );
}

/* ---------- the home ---------- */

export default function SimpleHome({
  accounts,
  supplies,
  lang,
  onMore,
  onReady,
}: {
  accounts: HomeAccount[];
  supplies: HomeSupply[];
  lang: UiLang;
  /** Opens everything the portal did before (schedule, checklists, equipment, complaints, documents). */
  onMore: () => void;
  /** Tells the page whether the simple home is on here (false = show today's screen). */
  onReady: (on: boolean) => void;
}) {
  const words = SUB_WORDS[lang];
  const [home, setHome] = useState<HomeData | null>(null);
  const [view, setView] = useState<View>("home");
  const [site, setSite] = useState<Site | null>(null);
  const [busy, setBusy] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [error, setError] = useState("");
  // one flow at a time
  const [problemType, setProblemType] = useState("");
  const [notes, setNotes] = useState("");
  const [photo, setPhoto] = useState<File | null>(null);
  const [moment, setMoment] = useState<"before" | "after">("after");
  const [sentPhotos, setSentPhotos] = useState(0);
  const [cart, setCart] = useState<Record<string, number>>({});
  const [otherItem, setOtherItem] = useState("");
  const cameraRef = useRef<HTMLInputElement>(null);
  const onReadyRef = useRef(onReady);
  useEffect(() => {
    onReadyRef.current = onReady;
  });

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/subcontractor-portal/home", { cache: "no-store" });
      const data = (await response.json()) as Partial<HomeData> & { success?: boolean };
      const on = response.ok && data.on === true;
      onReadyRef.current(on);
      setHome(on ? { on: true, firstName: data.firstName ?? "", today: data.today ?? [], requests: data.requests ?? [], waiting: data.waiting ?? 0 } : { on: false, firstName: "", today: [], requests: [], waiting: 0 });
    } catch {
      onReadyRef.current(false);
      setHome({ on: false, firstName: "", today: [], requests: [], waiting: 0 });
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (!home || !home.on) return null;

  // Today's sites first, then the rest of the sub's accounts.
  const todayNames = new Set(home.today.map((entry) => entry.accountName));
  const sites: Site[] = [
    ...home.today.map((entry) => ({ accountId: entry.accountId, accountName: entry.accountName, address: entry.address })),
    ...accounts
      .filter((account) => account.accountName && !todayNames.has(account.accountName))
      .map((account) => ({ accountId: String(account.accountId ?? account.id ?? ""), accountName: String(account.accountName), address: String(account.address ?? "") })),
  ];
  const defaultSite = sites[0] ?? null;

  function open(next: View) {
    setError("");
    setRetrying(false);
    setProblemType("");
    setNotes("");
    setPhoto(null);
    setMoment("after");
    setSentPhotos(0);
    setCart({});
    setOtherItem("");
    // One site today: it is already picked. Otherwise the first one is offered and can be changed.
    setSite(next === "photos" && sites.length !== 1 ? null : defaultSite);
    setView(next);
  }

  function showSent() {
    setView("sent");
    void load();
    window.setTimeout(() => setView("home"), 1800);
  }

  async function send(run: () => Promise<void>) {
    setBusy(true);
    setError("");
    setRetrying(false);
    try {
      await withRetry(run, () => setRetrying(true));
      showSent();
    } catch {
      setError(words.notSent);
    } finally {
      setBusy(false);
      setRetrying(false);
    }
  }

  const attach = async () => (photo ? uploadPhoto(photo, { attach: "1" }) : "");

  const sendProblem = () =>
    send(async () => {
      if (!site) return;
      const photoUrl = await attach();
      // Filed the way the portal always has (the office is told), then tracked to the manager's My work.
      await postJson("/api/subcontractor-portal", {
        action: "submitSubPortalIssue",
        issue: { accountId: site.accountId, accountName: site.accountName, issueType: problemType, urgency: "Normal", description: notes.trim() || problemType, photoCount: photo ? 1 : 0, status: "New" },
      });
      await postJson("/api/subcontractor-portal/home", { action: "problem", accountId: site.accountId, accountName: site.accountName, problemType, notes: notes.trim(), photoUrl });
    });

  const sendExtra = () =>
    send(async () => {
      if (!site) return;
      const photoUrl = await attach();
      await postJson("/api/subcontractor-portal/home", { action: "extraJob", accountId: site.accountId, accountName: site.accountName, notes: notes.trim(), photoUrl });
    });

  const sendSupplies = () =>
    send(async () => {
      if (!site) return;
      const orderGroupId = `SOG-${Date.now()}`;
      const lines: { name: string; quantity: number; category: string; unit: string; other: boolean }[] = [];
      for (const supply of supplies) {
        const name = String(supply.supplyItem ?? supply.name ?? "");
        if (name && (cart[name] ?? 0) > 0) lines.push({ name, quantity: cart[name], category: String(supply.category ?? ""), unit: String(supply.unit ?? ""), other: false });
      }
      if (otherItem.trim()) lines.push({ name: otherItem.trim(), quantity: 1, category: "Other", unit: "", other: true });
      for (const line of lines) {
        const placed = await postJson("/api/subcontractor-portal", {
          action: "submitSupplyOrder",
          orderGroupId,
          accountId: site.accountId,
          accountName: site.accountName,
          supplyItem: line.name,
          category: line.category,
          description: line.other ? line.name : "",
          itemDescription: line.other ? line.name : "",
          quantity: String(line.quantity),
          unit: line.unit,
          deliveryMode: "Deliver to Account",
          notes: "",
          status: line.other ? "Needs Review" : "New",
        });
        const orderId = String(placed.orderId ?? "");
        if (orderId) await postJson("/api/subcontractor-portal/home", { action: "orderPlaced", orderId, accountId: site.accountId, accountName: site.accountName, items: `${line.quantity} ${line.unit} ${line.name}`.replace(/\s+/g, " ").trim() });
      }
    });

  async function sendSitePhoto(file: File) {
    if (!site) return;
    setBusy(true);
    setError("");
    setRetrying(false);
    try {
      await withRetry(
        () => uploadPhoto(file, { accountId: site.accountId, accountName: site.accountName, moment }),
        () => setRetrying(true)
      );
      setSentPhotos((count) => count + 1);
    } catch {
      setError(words.notSent);
    } finally {
      setBusy(false);
      setRetrying(false);
    }
  }

  const cartCount = Object.values(cart).reduce((sum, n) => sum + n, 0) + (otherItem.trim() ? 1 : 0);
  const header = (title: string) => (
    <div className="sub-flow-head">
      <button type="button" className="ui-btn ui-btn-second" onClick={() => setView("home")} disabled={busy}>
        ← {words.back}
      </button>
      <h2 className="ui-section-title">{title}</h2>
    </div>
  );
  const status = (
    <>
      {retrying ? (
        <p className="ui-savestatus" role="status">
          {words.retrying}
        </p>
      ) : null}
      {error ? (
        <p className="ui-field-error" role="alert">
          {error}
        </p>
      ) : null}
    </>
  );
  const sendButton = (label: string, onClick: () => void, disabled: boolean): ReactNode => (
    <button type="button" className="ui-btn ui-btn-main sub-send" onClick={onClick} disabled={busy || disabled}>
      {busy ? words.sending : label}
    </button>
  );

  return (
    <div className="sub-home">
      <ShellTitle title={words.hello(home.firstName || "")} />

      {view === "sent" ? (
        <div className="sub-sent" role="status">
          <p className="sub-sent-mark">{words.sent}</p>
          <p>{words.sentText}</p>
        </div>
      ) : null}

      {view === "home" ? (
        <>
          <p className="ui-motto sub-motto">{MOTTO[lang]}</p>

          <section className="ui-stack" aria-label={words.today(home.today.length)}>
            <h2 className="ui-section-title">{words.today(home.today.length)}</h2>
            {home.today.length === 0 ? (
              <p className="ui-muted">{words.noSitesToday}</p>
            ) : (
              <ul className="ui-acct-list">
                {home.today.map((entry) => (
                  <li key={entry.accountId}>
                    <div className={`ui-acct ${entry.done ? "sub-site-done" : ""}`}>
                      <span className="ui-acct-name">{entry.accountName}</span>
                      {entry.address ? <span className="ui-acct-line">{entry.address}</span> : null}
                      <span className="ui-actions-row">
                        <span className="ui-pill ui-pill-off">{entry.timeWindow || "—"}</span>
                        {entry.done ? <span className="ui-pill ui-pill-done">✓ {words.doneToday}</span> : null}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <div className="sub-grid">
            <BigTile icon="camera" label={words.photos} tone="green" onClick={() => open("photos")} />
            <BigTile icon="problem" label={words.problem} tone="red" onClick={() => open("problem")} />
            <BigTile icon="todo" label={words.extraJob} tone="light" onClick={() => open("extra")} />
            <BigTile icon="box" label={words.supplies} tone="light" onClick={() => open("supplies")} />
          </div>

          <button type="button" className="sub-row" onClick={() => setView("requests")}>
            <span>{words.myRequests}</span>
            {home.waiting > 0 ? <span className="ui-pill ui-pill-waiting">{words.waiting(home.waiting)}</span> : null}
            <span aria-hidden="true">›</span>
          </button>
          <button type="button" className="sub-row" onClick={onMore}>
            <span>{words.more}</span>
            <span aria-hidden="true">›</span>
          </button>
        </>
      ) : null}

      {view === "photos" ? (
        <section className="ui-stack">
          {header(words.photos)}
          {!site ? (
            // Picking the site opens the camera straight away.
            <div className="ui-stack">
              <p className="ui-strong">{words.pickSite}</p>
              <div className="sub-sites">
                {sites.map((entry) => (
                  <button
                    key={entry.accountId || entry.accountName}
                    type="button"
                    className="ui-chip"
                    onClick={() => {
                      setSite(entry);
                      cameraRef.current?.click();
                    }}
                  >
                    {entry.accountName}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <>
              <p className="ui-strong">{site.accountName}</p>
              <div className="sub-two" role="group" aria-label={`${words.before} / ${words.after}`}>
                <button type="button" className="ui-chip" aria-pressed={moment === "before"} onClick={() => setMoment("before")}>
                  {words.before}
                </button>
                <button type="button" className="ui-chip" aria-pressed={moment === "after"} onClick={() => setMoment("after")}>
                  {words.after}
                </button>
              </div>
              <button type="button" className="ui-btn ui-btn-main sub-send" disabled={busy} onClick={() => cameraRef.current?.click()}>
                {busy ? words.sending : sentPhotos > 0 ? `📷 ${words.anotherPhoto}` : `📷 ${words.takePhoto}`}
              </button>
              {sentPhotos > 0 ? (
                <p className="ui-savestatus ui-savestatus-saved" role="status">
                  {words.sent} × {sentPhotos}
                </p>
              ) : null}
              {status}
              {sentPhotos > 0 ? (
                <button type="button" className="ui-btn ui-btn-second sub-send" disabled={busy} onClick={showSent}>
                  {words.done} ✓
                </button>
              ) : null}
            </>
          )}
          <input
            ref={cameraRef}
            type="file"
            accept="image/*"
            capture="environment"
            hidden
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (file) void sendSitePhoto(file);
            }}
          />
        </section>
      ) : null}

      {view === "problem" ? (
        <section className="ui-stack">
          {header(words.problem)}
          <SitePicker sites={sites} value={site} onPick={setSite} label={words.pickSite} />
          <p className="ui-strong">{words.whatHappened}</p>
          <div className="sub-choices">
            {(
              [
                ["cantGetIn", "🚪", "Can't get in"],
                ["broken", "🔧", "Broken"],
                ["noSupplies", "🧻", "No supplies"],
                ["damage", "💥", "Damage"],
                ["customer", "🙋", "Customer"],
                ["other", "❓", "Other"],
              ] as const
            ).map(([key, emoji, english]) => (
              <button key={key} type="button" className="sub-choice" aria-pressed={problemType === english} onClick={() => setProblemType(english)}>
                <span aria-hidden="true">{emoji}</span>
                <span>{words.problems[key]}</span>
              </button>
            ))}
          </div>
          <PhotoAndTalk words={words} lang={lang} photo={photo} onPhoto={setPhoto} notes={notes} onNotes={setNotes} />
          {status}
          {sendButton(words.send, () => void sendProblem(), !site || !problemType)}
        </section>
      ) : null}

      {view === "extra" ? (
        <section className="ui-stack">
          {header(words.extraJob)}
          <SitePicker sites={sites} value={site} onPick={setSite} label={words.pickSite} />
          <PhotoAndTalk words={words} lang={lang} photo={photo} onPhoto={setPhoto} notes={notes} onNotes={setNotes} />
          {status}
          {sendButton(words.send, () => void sendExtra(), !site || (!photo && !notes.trim()))}
        </section>
      ) : null}

      {view === "supplies" ? (
        <section className="ui-stack">
          {header(words.supplies)}
          <SitePicker sites={sites} value={site} onPick={setSite} label={words.pickSite} />
          <ul className="sub-supplies">
            {supplies
              .filter((supply) => supply.supplyItem || supply.name)
              .map((supply) => {
                const name = String(supply.supplyItem ?? supply.name);
                const count = cart[name] ?? 0;
                return (
                  <li key={name} className={count > 0 ? "sub-supply-on" : ""}>
                    <span className="sub-supply-pic" aria-hidden="true">
                      {supplyEmoji(name, String(supply.category ?? ""))}
                    </span>
                    <span className="sub-supply-name">
                      {name}
                      {supply.unit ? <span className="ui-muted"> · {supply.unit}</span> : null}
                    </span>
                    <button type="button" className="sub-step" aria-label={`− ${name}`} disabled={count === 0} onClick={() => setCart((current) => ({ ...current, [name]: Math.max(0, count - 1) }))}>
                      −
                    </button>
                    <span className="sub-count" aria-live="polite">
                      {count}
                    </span>
                    <button type="button" className="sub-step" aria-label={`+ ${name}`} onClick={() => setCart((current) => ({ ...current, [name]: count + 1 }))}>
                      +
                    </button>
                  </li>
                );
              })}
          </ul>
          <div className="ui-field">
            <label className="ui-label" htmlFor="sub-other-item">
              {words.otherItem} <span className="ui-optional">({words.optional})</span>
            </label>
            <input id="sub-other-item" className="ui-input" value={otherItem} onChange={(event) => setOtherItem(event.target.value)} placeholder={words.otherItemHint} />
          </div>
          {cartCount === 0 ? <p className="ui-muted">{words.nothingPicked}</p> : null}
          {status}
          {sendButton(cartCount > 0 ? `${words.send} (${cartCount})` : words.send, () => void sendSupplies(), !site || cartCount === 0)}
        </section>
      ) : null}

      {view === "requests" ? (
        <section className="ui-stack">
          {header(words.myRequests)}
          {home.requests.length === 0 ? (
            <p className="ui-muted">{words.noRequests}</p>
          ) : (
            <ul className="ui-acct-list">
              {home.requests.map((request, index) => (
                <li key={`${request.date}-${index}`}>
                  <div className="ui-acct">
                    <span className="ui-acct-name">
                      {request.kind === "order" ? words.supplies : request.kind === "extra" ? words.extraJob : words.problem} · {request.title}
                    </span>
                    {request.detail ? <span className="ui-acct-line ui-clamp">{request.detail}</span> : null}
                    <span className="ui-actions-row">
                      <span className={`ui-pill ${request.status === "done" ? "ui-pill-done" : request.status === "approved" ? "ui-pill-done" : "ui-pill-waiting"}`}>
                        {request.status === "done" ? `✓ ${words.done}` : request.status === "approved" ? `✓ ${words.approved}` : `⏳ ${words.received}`}
                      </span>
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}
    </div>
  );
}

/* ---------- PIN pad ---------- */

/** Four dots and a number pad. Calls onDone with the 4 digits. */
export function PinPad({ title, hint, error, busy, onDone }: { title: string; hint?: string; error?: string; busy?: boolean; onDone: (pin: string) => void }) {
  const [pin, setPin] = useState("");
  const press = (digit: string) => {
    if (busy) return;
    const next = (pin + digit).slice(0, 4);
    setPin(next);
    if (next.length === 4) {
      window.setTimeout(() => {
        setPin("");
        onDone(next);
      }, 120);
    }
  };
  return (
    <div className="sub-pin">
      <h2 className="ui-section-title">{title}</h2>
      {hint ? <p className="ui-muted">{hint}</p> : null}
      <div className="sub-pin-dots" aria-label={`${pin.length} / 4`}>
        {[0, 1, 2, 3].map((index) => (
          <span key={index} className={index < pin.length ? "sub-pin-dot sub-pin-dot-on" : "sub-pin-dot"} />
        ))}
      </div>
      {error ? (
        <p className="ui-field-error" role="alert">
          {error}
        </p>
      ) : null}
      <div className="sub-pin-keys">
        {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((digit) => (
          <button key={digit} type="button" className="sub-pin-key" onClick={() => press(digit)} disabled={busy}>
            {digit}
          </button>
        ))}
        <span />
        <button type="button" className="sub-pin-key" onClick={() => press("0")} disabled={busy}>
          0
        </button>
        <button type="button" className="sub-pin-key" onClick={() => setPin((current) => current.slice(0, -1))} disabled={busy} aria-label="Delete">
          ⌫
        </button>
      </div>
    </div>
  );
}
