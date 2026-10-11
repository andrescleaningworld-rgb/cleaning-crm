"use client";

// Supply Check, on the same shop tablet, link and staff PINs as Equipment
// Check: name + PIN -> where is it going (a site or Office use) -> picture
// grid with big − / + -> Done. Stock drops and the site is charged (the
// server does that; no money is shown here). "Returned" puts items back.
// Once a week it first asks to count five items.
//
// Behind FEATURE_SUPPLY_CONTROL: when it is off, this page says so.

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import LangToggle from "@/app/team-hub/[token]/LangToggle";
import { useTeamHubLang, type TeamHubLang } from "@/app/team-hub/teamHubStrings";

type Person = { staffId: string; name: string; isNew: boolean };
type Item = { id: number; name: string; unit: string; photoUrl: string; shelfCount: number | null; shelfLocation: string };
type Site = { id: string; name: string };
type CountAsk = { supplyId: number; name: string; photoUrl: string; unit: string; shelfLocation: string };
type Home = { name: string; officeUse: string; items: Item[]; sites: Site[]; count: { week: string; asks: CountAsk[] } | null };

type Screen =
  | { kind: "loading" }
  | { kind: "off" }
  | { kind: "people" }
  | { kind: "pin"; person: Person }
  | { kind: "count" }
  | { kind: "where" }
  | { kind: "grid"; site: Site; mode: "take" | "return" }
  | { kind: "done"; items: number; mode: "take" | "return" | "count" };

const WORDS = {
  en: {
    title: "Supply Check",
    motto: "If it's not in the app, it does not exist!",
    loading: "Loading…",
    off: "Supply Check is not turned on yet. Ask your office.",
    linkOff: "This link isn't active anymore. Ask your office for the new one.",
    who: "Who are you?",
    pin: "Enter your PIN",
    wrongPin: "Wrong PIN. Try again.",
    locked: "Too many tries. Wait a few minutes or ask your office.",
    newPin: "Create your PIN in Equipment Check first.",
    notYou: "Not you?",
    where: "Where is it going?",
    office: "Office use",
    search: "Find a site",
    taking: "Taking",
    returning: "Returned",
    whatTake: "What are you taking?",
    whatReturn: "What are you bringing back?",
    onShelf: (n: number) => `${n} on shelf`,
    done: "Done",
    saving: "Saving…",
    nothing: "Tap + on what you take.",
    saved: "Saved! Thank you",
    savedCount: "Count saved! Thank you",
    items: (n: number) => `${n} item${n === 1 ? "" : "s"}`,
    again: "More",
    signOut: "Sign out",
    back: "Back",
    countTitle: "Weekly count",
    countText: "Count these 5 items on the shelf.",
    countSave: "Save count",
    later: "Later",
    error: "That did not save. Try again.",
    noSignal: "No signal. Try again.",
    equipment: "Equipment",
    noItems: "No supplies yet. Ask your office.",
  },
  es: {
    title: "Control de suministros",
    motto: "¡Si no está en la app, no existe!",
    loading: "Cargando…",
    off: "Todavía no está activado. Pregunta en tu oficina.",
    linkOff: "Este enlace ya no está activo. Pide el nuevo en tu oficina.",
    who: "¿Quién eres?",
    pin: "Escribe tu PIN",
    wrongPin: "PIN incorrecto. Intenta otra vez.",
    locked: "Demasiados intentos. Espera unos minutos o pregunta en tu oficina.",
    newPin: "Primero crea tu PIN en Revisión de equipo.",
    notYou: "¿No eres tú?",
    where: "¿A dónde va?",
    office: "Uso de oficina",
    search: "Buscar un sitio",
    taking: "Me llevo",
    returning: "Devuelvo",
    whatTake: "¿Qué te llevas?",
    whatReturn: "¿Qué devuelves?",
    onShelf: (n: number) => `${n} en el estante`,
    done: "Listo",
    saving: "Guardando…",
    nothing: "Toca + en lo que te llevas.",
    saved: "¡Guardado! Gracias",
    savedCount: "¡Conteo guardado! Gracias",
    items: (n: number) => `${n} artículo${n === 1 ? "" : "s"}`,
    again: "Más",
    signOut: "Salir",
    back: "Atrás",
    countTitle: "Conteo semanal",
    countText: "Cuenta estos 5 artículos en el estante.",
    countSave: "Guardar conteo",
    later: "Después",
    error: "No se guardó. Intenta otra vez.",
    noSignal: "Sin señal. Intenta otra vez.",
    equipment: "Equipo",
    noItems: "Todavía no hay suministros. Pregunta en tu oficina.",
  },
};

// Portuguese speakers get the Spanish words until Portuguese is written.
const wordsFor = (lang: TeamHubLang) => (lang === "en" ? WORDS.en : WORDS.es);

const DONE_MS = 4000;
const IDLE_MS = 2 * 60 * 1000;
const BIG = "min-h-[72px] rounded-2xl text-2xl font-bold shadow-sm";

export default function SupplyCheckPage() {
  const params = useParams();
  const key = Array.isArray(params.key) ? params.key[0] : (params.key ?? "");
  const apiBase = `/api/equipment-check/${encodeURIComponent(key)}`;
  const [lang, setLang] = useTeamHubLang();
  const w = wordsFor(lang);

  const [screen, setScreen] = useState<Screen>({ kind: "loading" });
  const [people, setPeople] = useState<Person[]>([]);
  const [linkOff, setLinkOff] = useState(false);
  const [home, setHome] = useState<Home | null>(null);
  const [message, setMessage] = useState("");

  /** Loads the grid; a tablet nobody is signed in on goes to "Who are you?". */
  const load = useCallback(
    async (afterSignIn = false) => {
      try {
        const response = await fetch(`${apiBase}/supplies`, { cache: "no-store" });
        if (response.status === 401) {
          const list = (await (await fetch(apiBase, { cache: "no-store" })).json()) as { active?: boolean; people?: Person[] };
          if (list.active === false) return setLinkOff(true);
          setPeople(list.people ?? []);
          return setScreen({ kind: "people" });
        }
        const data = (await response.json()) as { success?: boolean; ready?: boolean } & Partial<Home>;
        if (data.ready === false) return setScreen({ kind: "off" });
        if (!response.ok || data.success !== true) throw new Error("failed");
        const next: Home = { name: data.name ?? "", officeUse: data.officeUse ?? "Office use", items: data.items ?? [], sites: data.sites ?? [], count: data.count ?? null };
        setHome(next);
        setScreen(next.count && next.count.asks.length > 0 && afterSignIn ? { kind: "count" } : { kind: "where" });
      } catch {
        setMessage(w.noSignal);
      }
    },
    [apiBase, w.noSignal]
  );

  useEffect(() => {
    // The first load: fetches, then sets state when the answer arrives.
    void load(true);
  }, [load]);

  const signOut = useCallback(async () => {
    await fetch(`${apiBase}/session`, { method: "DELETE" }).catch(() => null);
    setHome(null);
    setMessage("");
    void load(true);
  }, [apiBase, load]);

  // A tablet left alone signs itself out, so the next person starts with their own name.
  const signedIn = Boolean(home);
  const kind = screen.kind;
  useEffect(() => {
    if (!signedIn) return;
    let timer = window.setTimeout(() => void signOut(), IDLE_MS);
    const again = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => void signOut(), IDLE_MS);
    };
    window.addEventListener("pointerdown", again);
    return () => {
      window.removeEventListener("pointerdown", again);
      window.clearTimeout(timer);
    };
  }, [signedIn, kind, signOut]);

  // The thank-you screen goes away by itself.
  useEffect(() => {
    if (kind !== "done") return;
    const timer = window.setTimeout(() => void signOut(), DONE_MS);
    return () => window.clearTimeout(timer);
  }, [kind, signOut]);

  return (
    <div className="mx-auto flex min-h-full max-w-3xl flex-col" data-supply-check={kind}>
      <header className="flex items-center justify-between gap-3 bg-[#0C447C] px-4 py-3 text-white">
        <div className="min-w-0">
          <p className="text-xl font-bold">{w.title}</p>
          {home ? <p className="truncate text-base text-blue-100">{home.name}</p> : null}
        </div>
        <div className="flex items-center gap-3">
          <Link href={`/equipment-check/${encodeURIComponent(key)}`} className="rounded-lg bg-white/15 px-3 py-2 text-base font-semibold text-white active:bg-white/25">
            {w.equipment}
          </Link>
          <LangToggle lang={lang} onChange={setLang} />
        </div>
      </header>

      <main className="flex-1 p-4">
        {message ? <div className="mb-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-lg font-semibold text-red-800">{message}</div> : null}

        {linkOff ? (
          <p className="mt-10 text-center text-xl font-semibold text-slate-700">{w.linkOff}</p>
        ) : screen.kind === "loading" ? (
          <p className="mt-10 text-center text-xl text-slate-500">{w.loading}</p>
        ) : screen.kind === "off" ? (
          <p className="mt-10 text-center text-xl font-semibold text-slate-700">{w.off}</p>
        ) : screen.kind === "people" ? (
          <div className="space-y-4">
            <h1 className="text-3xl font-bold text-slate-900">{w.who}</h1>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {people.map((person) => (
                <button
                  key={person.staffId}
                  type="button"
                  onClick={() => {
                    setMessage(person.isNew ? w.newPin : "");
                    if (!person.isNew) setScreen({ kind: "pin", person });
                  }}
                  className={`${BIG} bg-white px-3 text-slate-900 active:bg-gray-100`}
                >
                  {person.name}
                </button>
              ))}
            </div>
          </div>
        ) : screen.kind === "pin" ? (
          <PinPad
            w={w}
            person={screen.person}
            apiBase={apiBase}
            onBack={() => setScreen({ kind: "people" })}
            onIn={() => {
              setMessage("");
              void load(true);
            }}
          />
        ) : !home ? null : screen.kind === "count" && home.count ? (
          <CountScreen
            w={w}
            asks={home.count.asks}
            apiBase={apiBase}
            onLater={() => setScreen({ kind: "where" })}
            onSaved={() => setScreen({ kind: "done", items: 0, mode: "count" })}
            onError={setMessage}
          />
        ) : screen.kind === "where" ? (
          <WhereScreen w={w} home={home} onPick={(site, mode) => setScreen({ kind: "grid", site, mode })} onSignOut={() => void signOut()} />
        ) : screen.kind === "grid" ? (
          <GridScreen
            w={w}
            home={home}
            site={screen.site}
            mode={screen.mode}
            apiBase={apiBase}
            onBack={() => setScreen({ kind: "where" })}
            onSaved={(items) => {
              setMessage("");
              setScreen({ kind: "done", items, mode: screen.mode });
            }}
            onError={setMessage}
          />
        ) : screen.kind === "done" ? (
          <div className="mt-12 flex flex-col items-center gap-4 text-center">
            <span className="text-8xl">✅</span>
            <p className="text-4xl font-bold text-green-700">{screen.mode === "count" ? w.savedCount : w.saved}</p>
            {screen.mode !== "count" ? <p className="text-2xl font-semibold text-slate-700">{w.items(screen.items)}</p> : null}
            <div className="mt-4 grid w-full max-w-md grid-cols-2 gap-3">
              <button type="button" onClick={() => void load(false)} className={`${BIG} bg-[#3B6D11] text-white active:opacity-90`}>
                {w.again}
              </button>
              <button type="button" onClick={() => void signOut()} className={`${BIG} bg-white text-slate-700 active:bg-gray-100`}>
                {w.signOut}
              </button>
            </div>
          </div>
        ) : null}
      </main>

      <footer className="px-4 pb-5 pt-2 text-center text-lg font-bold text-[#0C447C]">{w.motto}</footer>
    </div>
  );
}

type Words = (typeof WORDS)["en"];

/* ---------- PIN ---------- */

function PinPad({ w, person, apiBase, onBack, onIn }: { w: Words; person: Person; apiBase: string; onBack: () => void; onIn: () => void }) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const send = useCallback(
    async (value: string) => {
      setBusy(true);
      setError("");
      try {
        const response = await fetch(`${apiBase}/session`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ staffId: person.staffId, pin: value }) });
        if (response.ok) return onIn();
        setError(response.status === 423 ? w.locked : w.wrongPin);
        setPin("");
      } catch {
        setError(w.noSignal);
        setPin("");
      } finally {
        setBusy(false);
      }
    },
    [apiBase, person.staffId, onIn, w.locked, w.wrongPin, w.noSignal]
  );

  const press = (digit: string) => {
    if (busy || pin.length >= 4) return;
    const next = pin + digit;
    setPin(next);
    if (next.length === 4) void send(next);
  };

  return (
    <div className="mx-auto max-w-sm space-y-4 text-center">
      <h1 className="text-3xl font-bold text-slate-900">{person.name}</h1>
      <p className="text-xl font-semibold text-slate-600">{w.pin}</p>
      <p className="text-5xl font-black tracking-[0.4em] text-slate-900" aria-live="polite">
        {"●".repeat(pin.length).padEnd(4, "○")}
      </p>
      {error ? <p className="text-lg font-semibold text-red-700">{error}</p> : null}
      <div className="grid grid-cols-3 gap-3">
        {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((digit) => (
          <button key={digit} type="button" disabled={busy} onClick={() => press(digit)} className={`${BIG} bg-white text-3xl text-slate-900 active:bg-gray-100`}>
            {digit}
          </button>
        ))}
        <button type="button" onClick={onBack} className={`${BIG} bg-white text-lg text-slate-600 active:bg-gray-100`}>
          {w.notYou}
        </button>
        <button type="button" disabled={busy} onClick={() => press("0")} className={`${BIG} bg-white text-3xl text-slate-900 active:bg-gray-100`}>
          0
        </button>
        <button type="button" onClick={() => setPin(pin.slice(0, -1))} className={`${BIG} bg-white text-3xl text-slate-600 active:bg-gray-100`} aria-label="Delete">
          ⌫
        </button>
      </div>
    </div>
  );
}

/* ---------- where is it going ---------- */

function WhereScreen({ w, home, onPick, onSignOut }: { w: Words; home: Home; onPick: (site: Site, mode: "take" | "return") => void; onSignOut: () => void }) {
  const [mode, setMode] = useState<"take" | "return">("take");
  const [query, setQuery] = useState("");
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (q ? home.sites.filter((site) => site.name.toLowerCase().includes(q)) : home.sites).slice(0, 60);
  }, [home.sites, query]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <button type="button" aria-pressed={mode === "take"} onClick={() => setMode("take")} className={`${BIG} ${mode === "take" ? "bg-[#0C447C] text-white" : "bg-white text-slate-700"}`}>
          {w.taking}
        </button>
        <button type="button" aria-pressed={mode === "return"} onClick={() => setMode("return")} className={`${BIG} ${mode === "return" ? "bg-[#0C447C] text-white" : "bg-white text-slate-700"}`}>
          ↩ {w.returning}
        </button>
      </div>
      <h1 className="text-3xl font-bold text-slate-900">{w.where}</h1>
      <button type="button" data-site="office" onClick={() => onPick({ id: "", name: home.officeUse }, mode)} className={`${BIG} w-full bg-[#EAF3DE] text-[#27500A] active:opacity-90`}>
        🏢 {w.office}
      </button>
      <input
        type="search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder={w.search}
        aria-label={w.search}
        className="min-h-[64px] w-full rounded-2xl border-2 border-slate-300 bg-white px-4 text-2xl"
      />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {shown.map((site) => (
          <button key={`${site.id}|${site.name}`} type="button" data-site={site.id} onClick={() => onPick(site, mode)} className={`${BIG} bg-white px-4 text-left text-xl text-slate-900 active:bg-gray-100`}>
            {site.name}
          </button>
        ))}
      </div>
      <button type="button" onClick={onSignOut} className="min-h-[56px] w-full rounded-2xl bg-white text-xl font-bold text-slate-600 active:bg-gray-100">
        {w.signOut}
      </button>
    </div>
  );
}

/* ---------- the picture grid ---------- */

function Photo({ url }: { url: string }) {
  return url ? (
    // eslint-disable-next-line @next/next/no-img-element -- a stored photo; nothing to optimize on the tablet
    <img src={url} alt="" className="h-32 w-full object-cover" />
  ) : (
    <div className="flex h-32 w-full items-center justify-center bg-slate-200 text-5xl">🧴</div>
  );
}

function GridScreen({
  w,
  home,
  site,
  mode,
  apiBase,
  onBack,
  onSaved,
  onError,
}: {
  w: Words;
  home: Home;
  site: Site;
  mode: "take" | "return";
  apiBase: string;
  onBack: () => void;
  onSaved: (items: number) => void;
  onError: (message: string) => void;
}) {
  const [picked, setPicked] = useState<Record<number, number>>({});
  const [saving, setSaving] = useState(false);
  const total = Object.values(picked).reduce((sum, qty) => sum + qty, 0);
  const change = (id: number, by: number) => setPicked((current) => ({ ...current, [id]: Math.max(0, Math.min(99, (current[id] ?? 0) + by)) }));

  async function save() {
    if (total === 0) return onError(w.nothing);
    setSaving(true);
    try {
      const lines = Object.entries(picked)
        .filter(([, qty]) => qty > 0)
        .map(([id, qty]) => ({ supplyId: Number(id), qty }));
      const response = await fetch(`${apiBase}/supplies`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: mode, accountId: site.id, accountName: site.name, lines }) });
      const data = (await response.json().catch(() => ({}))) as { success?: boolean; items?: number; error?: string };
      if (!response.ok || data.success !== true) return onError(data.error || w.error);
      onSaved(data.items ?? total);
    } catch {
      onError(w.noSignal);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4 pb-28">
      <button type="button" onClick={onBack} className="min-h-[56px] rounded-2xl bg-white px-5 text-xl font-bold text-slate-700 shadow-sm active:bg-gray-100">
        ← {w.back}
      </button>
      <p className="text-xl font-bold text-[#0C447C]">{site.name}</p>
      <h1 className="text-3xl font-bold text-slate-900">{mode === "take" ? w.whatTake : w.whatReturn}</h1>
      {home.items.length === 0 ? <p className="text-xl text-slate-500">{w.noItems}</p> : null}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {home.items.map((item) => {
          const qty = picked[item.id] ?? 0;
          return (
            <div key={item.id} data-item={item.id} className={`flex flex-col overflow-hidden rounded-2xl bg-white shadow-sm ${qty > 0 ? "ring-4 ring-[#3B6D11]" : ""}`}>
              <Photo url={item.photoUrl} />
              <div className="p-3">
                <p className="text-xl font-bold leading-tight text-slate-900">{item.name}</p>
                <p className="text-base text-slate-500">
                  {item.unit}
                  {item.shelfCount !== null ? `${item.unit ? " · " : ""}${w.onShelf(item.shelfCount)}` : ""}
                </p>
              </div>
              <div className="mt-auto grid grid-cols-3 items-center gap-2 p-3 pt-0">
                <button type="button" aria-label={`− ${item.name}`} onClick={() => change(item.id, -1)} disabled={qty === 0} className="min-h-[64px] rounded-2xl bg-slate-200 text-4xl font-black text-slate-800 active:bg-slate-300 disabled:opacity-40">
                  −
                </button>
                <span className="text-center text-4xl font-black text-slate-900" aria-live="polite">
                  {qty}
                </span>
                <button type="button" aria-label={`+ ${item.name}`} onClick={() => change(item.id, 1)} className="min-h-[64px] rounded-2xl bg-[#3B6D11] text-4xl font-black text-white active:opacity-90">
                  +
                </button>
              </div>
            </div>
          );
        })}
      </div>
      <div className="fixed inset-x-0 bottom-0 z-10 border-t border-slate-200 bg-white p-3">
        <button type="button" disabled={saving} onClick={() => void save()} className={`${BIG} mx-auto block w-full max-w-3xl bg-[#3B6D11] text-white active:opacity-90 disabled:opacity-60`}>
          {saving ? w.saving : `${w.done}${total > 0 ? ` · ${w.items(total)}` : ""}`}
        </button>
      </div>
    </div>
  );
}

/* ---------- the weekly count ---------- */

function CountScreen({ w, asks, apiBase, onLater, onSaved, onError }: { w: Words; asks: CountAsk[]; apiBase: string; onLater: () => void; onSaved: () => void; onError: (message: string) => void }) {
  const [counts, setCounts] = useState<Record<number, number>>({});
  const [saving, setSaving] = useState(false);
  const change = (id: number, by: number) => setCounts((current) => ({ ...current, [id]: Math.max(0, Math.min(9999, (current[id] ?? 0) + by)) }));

  async function save() {
    setSaving(true);
    try {
      const response = await fetch(`${apiBase}/supplies`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "count", counts: asks.map((ask) => ({ supplyId: ask.supplyId, counted: counts[ask.supplyId] ?? 0 })) }) });
      const data = (await response.json().catch(() => ({}))) as { success?: boolean; error?: string };
      if (!response.ok || data.success !== true) return onError(data.error || w.error);
      onSaved();
    } catch {
      onError(w.noSignal);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <h1 className="text-3xl font-bold text-slate-900">{w.countTitle}</h1>
      <p className="text-xl font-semibold text-slate-600">{w.countText}</p>
      {asks.map((ask) => (
        <div key={ask.supplyId} data-count={ask.supplyId} className="flex items-center gap-3 rounded-2xl bg-white p-3 shadow-sm">
          <div className="h-20 w-20 shrink-0 overflow-hidden rounded-xl">
            <Photo url={ask.photoUrl} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xl font-bold leading-tight text-slate-900">{ask.name}</p>
            <p className="text-base text-slate-500">{[ask.unit, ask.shelfLocation].filter(Boolean).join(" · ")}</p>
          </div>
          <button type="button" aria-label={`− ${ask.name}`} onClick={() => change(ask.supplyId, -1)} className="min-h-[64px] min-w-[64px] rounded-2xl bg-slate-200 text-4xl font-black text-slate-800 active:bg-slate-300">
            −
          </button>
          <span className="w-14 text-center text-4xl font-black text-slate-900">{counts[ask.supplyId] ?? 0}</span>
          <button type="button" aria-label={`+ ${ask.name}`} onClick={() => change(ask.supplyId, 1)} className="min-h-[64px] min-w-[64px] rounded-2xl bg-[#3B6D11] text-4xl font-black text-white active:opacity-90">
            +
          </button>
        </div>
      ))}
      <div className="grid grid-cols-2 gap-3">
        <button type="button" onClick={onLater} className={`${BIG} bg-white text-slate-700 active:bg-gray-100`}>
          {w.later}
        </button>
        <button type="button" disabled={saving} onClick={() => void save()} className={`${BIG} bg-[#3B6D11] text-white active:opacity-90 disabled:opacity-60`}>
          {saving ? w.saving : w.countSave}
        </button>
      </div>
    </div>
  );
}
